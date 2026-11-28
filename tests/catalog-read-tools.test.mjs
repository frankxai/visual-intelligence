import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mcp', 'vis-mcp-server.mjs')
const RENDER = await sharp({ create: { width: 96, height: 64, channels: 3, background: { r: 12, g: 90, b: 140 } } }).png().toBuffer()
const RENDER_ALT = await sharp({ create: { width: 64, height: 96, channels: 3, background: { r: 200, g: 40, b: 90 } } }).png().toBuffer()

function project(config = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-catalog-read-'))
  const root = path.join(base, 'project')
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({ library: { minFreeDiskGB: 0, ...config } }))
  return root
}

function addImage(root, name, bytes = RENDER) {
  fs.writeFileSync(path.join(root, 'assets', name), bytes)
}

// Minimal MCP stdio client: returns { value, isError } so explicit error codes stay visible.
function client(root) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, VIS_ROOT: root, VIS_ENABLE_WRITES: '1' },
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  let buffer = ''
  const waiting = new Map()
  child.stdout.on('data', chunk => {
    buffer += chunk
    let i
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i)
      buffer = buffer.slice(i + 1)
      if (!line.trim()) continue
      const msg = JSON.parse(line)
      waiting.get(msg.id)?.(msg)
      waiting.delete(msg.id)
    }
  })
  let id = 0
  const rpc = (method, params) => new Promise(resolve => {
    const n = ++id
    waiting.set(n, resolve)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, ...(params ? { params } : {}) }) + '\n')
  })
  const call = async (name, args = {}) => {
    const msg = await rpc('tools/call', { name, arguments: args })
    const text = msg.result.content[0].text
    if (msg.result.isError) return { isError: true, code: text.replace(/^Error: /, ''), value: null }
    return { isError: false, code: null, value: JSON.parse(text) }
  }
  const tools = async () => (await rpc('tools/list')).result.tools
  return { call, tools, close: () => child.kill() }
}

function indexFile(root) {
  return path.join(root, 'data', 'vis.sqlite')
}

/** Full row-content digest per table: proves reads wrote nothing. */
function digestTables(root) {
  const db = new DatabaseSync(indexFile(root), { readOnly: true })
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name)
    const digest = {}
    for (const table of tables) {
      const rows = db.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all()
      digest[table] = `${crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')}:${rows.length}`
    }
    return digest
  } finally {
    db.close()
  }
}

test('catalog read tools: sources coverage, exact preview, explicit absence, and no writes', async t => {
  const root = project({ roots: [{ label: 'assets', path: './assets' }, { label: 'offline', path: './not-mounted' }] })
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true })
  addImage(root, 'hero.png')
  addImage(root, 'unrendered.png', RENDER_ALT)

  const mcp = client(root)
  t.after(() => mcp.close())

  const listed = await mcp.tools()
  const sources = listed.find(tool => tool.name === 'get_asset_sources')
  const preview = listed.find(tool => tool.name === 'get_asset_preview')
  assert.ok(sources, 'get_asset_sources is exposed')
  assert.ok(preview, 'get_asset_preview is exposed')
  assert.deepEqual(sources.inputSchema, { type: 'object', properties: {}, required: [], additionalProperties: false })
  assert.deepEqual(preview.inputSchema.required, ['source_id', 'asset_id', 'version_id'])
  assert.equal(preview.inputSchema.additionalProperties, false)
  for (const tool of [sources, preview]) {
    assert.equal(tool.annotations.readOnlyHint, true)
    assert.equal(tool.annotations.destructiveHint, false)
  }

  const ingest = await mcp.call('library_ingest', { execute: true })
  assert.equal(ingest.value.filed, 2)

  const found = await mcp.call('library_search', {})
  assert.equal(found.value.total, 2)
  const byName = new Map(found.value.assets.map(asset => [path.basename(asset.primary_path), asset.asset_id]))
  const heroId = byName.get('hero.png')
  const unrenderedId = byName.get('unrendered.png')

  // Happy path: coverage reports every declared source, including the unavailable one.
  const coverage = await mcp.call('get_asset_sources')
  assert.equal(coverage.isError, false)
  assert.equal(coverage.value.retrieval, 'metadata')
  assert.deepEqual(coverage.value.assets, [])
  const declared = new Map(coverage.value.coverage.map(source => [source.source_id, source]))
  assert.equal(declared.get('assets').state, 'ready')
  assert.equal(declared.get('assets').kind, 'local-library')
  assert.equal(declared.get('assets').asset_count, 2)
  assert.match(declared.get('assets').indexed_at, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(declared.get('assets').exhaustive, false)
  assert.equal(declared.get('offline').state, 'unavailable', 'a declared root that is not mounted is explicit')
  assert.equal(declared.get('offline').asset_count, null)
  assert.equal(coverage.value.complete, false, 'a local index is never an exhaustive workspace census')
  assert.equal(coverage.value.no_matches, false)

  const detail = await mcp.call('get_asset', { asset_id: heroId })
  const versionId = detail.value.versions[0].version_id
  assert.ok(versionId)

  const documented = await mcp.call('get_asset_preview', { source_id: 'assets', asset_id: heroId, version_id: versionId })
  assert.equal(documented.isError, false)
  assert.equal(documented.value.asset.asset_id, heroId)
  assert.equal(documented.value.asset.version_id, versionId)
  assert.equal(documented.value.asset.source_id, 'assets')
  assert.equal(documented.value.asset.preview_available, true)
  assert.equal(documented.value.asset.approval_status, 'candidate')
  assert.equal(documented.value.preview.kind, 'preview')
  assert.equal(documented.value.preview.mime_type, 'image/webp')
  assert.equal(documented.value.preview.master_bytes, false)
  assert.match(documented.value.preview.sha256, /^[0-9a-f]{64}$/)
  assert.ok(fs.existsSync(documented.value.preview.path), 'the existing rendition is on disk')
  assert.ok(documented.value.preview.byte_size > 0)

  // Missing rendition: an exact asset/version with no thumb or preview says so.
  const drop = new DatabaseSync(indexFile(root))
  try {
    drop.prepare('DELETE FROM asset_rendition WHERE asset_id = ?').run(unrenderedId)
  } finally {
    drop.close()
  }
  const unrenderedDetail = await mcp.call('get_asset', { asset_id: unrenderedId })
  const unrenderedVersion = unrenderedDetail.value.versions[0].version_id

  const before = digestTables(root)

  const absent = await mcp.call('get_asset_preview', { source_id: 'assets', asset_id: unrenderedId, version_id: unrenderedVersion })
  assert.equal(absent.isError, true)
  assert.equal(absent.code, 'preview_unavailable')

  // Unknown source, unknown asset and wrong version fail closed rather than guessing.
  const unknownSource = await mcp.call('get_asset_preview', { source_id: 'nope', asset_id: heroId, version_id: versionId })
  assert.equal(unknownSource.isError, true)
  assert.equal(unknownSource.code, 'not_found')
  const wrongVersion = await mcp.call('get_asset_preview', { source_id: 'assets', asset_id: heroId, version_id: unrenderedVersion })
  assert.equal(wrongVersion.isError, true)
  assert.equal(wrongVersion.code, 'not_found')
  const wrongSource = await mcp.call('get_asset_preview', { source_id: 'offline', asset_id: heroId, version_id: versionId })
  assert.equal(wrongSource.isError, true)
  assert.equal(wrongSource.code, 'not_found', 'an asset is not readable through a source that does not hold it')

  await mcp.call('get_asset_sources')
  await mcp.call('get_asset_preview', { source_id: 'assets', asset_id: heroId, version_id: versionId })

  const after = digestTables(root)
  assert.deepEqual(after, before, 'catalog read tools mutate no table')
  assert.equal(Object.keys(after).length, Object.keys(before).length)
})

test('catalog sources: an unconfigured workspace says not_configured instead of a silent empty result', async t => {
  const root = project({ roots: [] })
  const mcp = client(root)
  t.after(() => mcp.close())

  const sources = await mcp.call('get_asset_sources')
  assert.equal(sources.isError, false)
  assert.equal(sources.value.coverage.length, 1)
  assert.equal(sources.value.coverage[0].source_id, 'local-library')
  assert.equal(sources.value.coverage[0].state, 'not_configured')
  assert.equal(sources.value.coverage[0].indexed_at, null)
  assert.equal(sources.value.complete, false)
  assert.equal(sources.value.no_matches, false, 'not_configured is not "search finished with no matches"')
})
