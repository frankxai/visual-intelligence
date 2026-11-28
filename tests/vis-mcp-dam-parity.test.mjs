import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { indexProject, openVisDatabase } from '../core/vis-core.mjs'

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mcp', 'vis-mcp-server.mjs')
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2mVxwAAAABJRU5ErkJggg==', 'base64')

function seedDamProject(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-dam-mcp-'))
  fs.mkdirSync(path.join(base, 'public/images'), { recursive: true })
  const assetPath = path.join(base, 'public/images/sable-hero.png')
  fs.writeFileSync(assetPath, PNG)
  indexProject({ root: base })
  const db = openVisDatabase(base)
  const asset = db.prepare('SELECT * FROM asset').get()
  db.prepare('UPDATE asset SET category=?, tags_json=?, approval_status=?, rights_status=? WHERE asset_id=?')
    .run('arcanea', JSON.stringify(['brand:arcanea', 'character:sable']), 'approved', 'generated-owned', asset.asset_id)
  db.close()

  const tasteLedger = path.join(base, 'taste-ledger.jsonl')
  fs.writeFileSync(tasteLedger, [
    JSON.stringify({ brand: 'arcanea', polarity: 'positive', doctrine: 'Sharp obsidian rim lighting' }),
    JSON.stringify({ brand: 'estate', polarity: 'negative', doctrine: 'No plastic skin texture', defects: ['plastic-skin'] }),
  ].join('\n') + '\n')

  const sha = crypto.createHash('sha256').update(PNG).digest('hex')
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  return { base, assetId: asset.asset_id, sha, tasteLedger }
}

function spawnMcp(t, projectRoot, extraEnv = {}) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, VIS_ROOT: projectRoot, ...extraEnv },
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  t.after(() => child.kill())

  let buffer = ''
  const pending = new Map()
  child.stdout.on('data', chunk => {
    buffer += chunk
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      const msg = JSON.parse(line)
      pending.get(msg.id)?.(msg)
      pending.delete(msg.id)
    }
  })

  let seq = 0
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Timeout waiting for MCP response to ${method}`))
    }, 8000)
    pending.set(id, msg => {
      clearTimeout(timer)
      resolve(msg)
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })

  const call = async (name, args = {}) => {
    const res = await rpc('tools/call', { name, arguments: args })
    return {
      isError: Boolean(res.result?.isError),
      text: res.result?.content?.[0]?.text || '',
      data: res.result?.isError ? null : JSON.parse(res.result.content[0].text),
    }
  }

  return { rpc, call }
}

test('vis-mcp exposes Cloudinary-parity DAM tools and static DAM resources in full mode', async t => {
  const { base, assetId, sha, tasteLedger } = seedDamProject(t)
  const mcp = spawnMcp(t, base, { VIS_MEDIA_SIGNING_KEY: 'mcp-test-signing-key', VIS_TASTE_LEDGER: tasteLedger })

  const init = await mcp.rpc('initialize', {})
  assert.equal(init.result.serverInfo.mcpMode, 'full')
  assert.equal(init.result.serverInfo.readOnlyDefault, true)

  const list = await mcp.rpc('tools/list', {})
  const names = list.result.tools.map(t => t.name)
  for (const expected of [
    'dam_capabilities',
    'dam_discover_tools',
    'dam_describe_tool',
    'list_transform_presets',
    'build_transform_url',
    'build_responsive_delivery',
    'list_structured_metadata_schemas',
    'validate_structured_metadata',
    'list_upload_presets',
    'plan_r2_intake',
    'plan_derivative_purge',
    'get_character_canon_brief',
  ]) {
    assert.ok(names.includes(expected), `expected tool ${expected}`)
  }

  const caps = await mcp.call('dam_capabilities')
  assert.equal(caps.data.gates.writesEnabled, false)
  assert.equal(caps.data.layers.transforms.presetCount, 12)
  assert.equal(caps.data.layers.uploadPresets.rightsLock, 'unknown')

  const xform = await mcp.call('build_transform_url', {
    asset_id: assetId,
    preset: 'og_card',
    worker_base: 'https://cdn.starlight.test',
  })
  assert.equal(xform.data.sha256, sha)
  assert.equal(xform.data.signed, true)
  assert.ok(xform.data.url.startsWith(`https://cdn.starlight.test/t/${sha}/c_fill,w_1200,h_630`))

  const responsive = await mcp.call('build_responsive_delivery', {
    sha256: sha,
    widths: [480, 960],
    aspect_ratio: '16:9',
  })
  assert.equal(responsive.data.sources.length, 3)

  const metaCheck = await mcp.call('validate_structured_metadata', {
    metadata: { brand: 'arcanea', character_id: 'sable', character_outfit: 'obsidian', arcanea_gate: 'sight' },
  })
  assert.equal(metaCheck.data.valid, true)

  const intake = await mcp.call('plan_r2_intake', {
    preset: 'brand_hero_intake',
    filename: 'hero.png',
    mime_type: 'image/png',
    byte_size: 2048,
    sha256: sha,
    metadata: { brand: 'frankx' },
  })
  assert.equal(intake.data.accepted, true)
  assert.equal(intake.data.rights_status, 'unknown')

  const purge = await mcp.call('plan_derivative_purge', {
    sha256: sha,
    derivatives: [
      `derived/${sha.slice(0, 2)}/${sha}.0123456789abcdef.webp`,
      `masters/${sha.slice(0, 2)}/${sha}`,
    ],
  })
  assert.equal(purge.data.purgeCount, 1)
  assert.equal(purge.data.refusedCount, 1)

  const canonUnresolved = await mcp.call('get_character_canon_brief', { character_id: 'sable', brand: 'arcanea' })
  assert.equal(canonUnresolved.data.readyForGeneration, false)
  assert.equal(canonUnresolved.data.status, 'unresolved_identity_authority')
  assert.equal(canonUnresolved.data.canonicalReferences.length, 1)
  assert.deepEqual(canonUnresolved.data.positiveDirectives, ['Sharp obsidian rim lighting'])
  assert.deepEqual(canonUnresolved.data.negativeTasteRules, ['No plastic skin texture'])
  assert.ok(canonUnresolved.data.avoidDefects.includes('plastic-skin'))

  const canonResolved = await mcp.call('get_character_canon_brief', {
    character_id: 'sable',
    brand: 'arcanea',
    identity_receipt: { status: 'resolved', approved_version: 'v1', sha256: sha },
  })
  assert.equal(canonResolved.data.readyForGeneration, true)
  assert.equal(canonResolved.data.status, 'resolved')

  // Static DAM resources
  const resources = await mcp.rpc('resources/list', {})
  assert.ok(resources.result.resources.some(r => r.uri === 'visual://dam/capabilities'))
  const presetsRes = await mcp.rpc('resources/read', { uri: 'visual://transform/presets' })
  const presetsPayload = JSON.parse(presetsRes.result.contents[0].text)
  assert.ok(presetsPayload.presets.hero_desktop)

  // Write gates stay closed in read-only mode
  const blockedAnnotate = await mcp.call('annotate_asset', { asset_id: assetId, tags: ['test'], execute: true })
  assert.equal(blockedAnnotate.data.blocked, true)
})

test('VIS_MCP_MODE=dynamic exposes compact 12-tool discovery surface while dispatching all tools', async t => {
  const { base, sha } = seedDamProject(t)
  const mcp = spawnMcp(t, base, { VIS_MCP_MODE: 'dynamic' })

  const init = await mcp.rpc('initialize', {})
  assert.equal(init.result.serverInfo.mcpMode, 'dynamic')

  const list = await mcp.rpc('tools/list', {})
  assert.equal(list.result.tools.length, 12)

  const discovered = await mcp.call('dam_discover_tools', { category: 'transform' })
  assert.ok(discovered.data.tools.some(t => t.name === 'plan_derivative_purge'))

  const described = await mcp.call('dam_describe_tool', { name: 'plan_derivative_purge' })
  assert.equal(described.data.tools[0].name, 'plan_derivative_purge')
  assert.equal(described.data.tools[0].readOnly, true)

  // Undiscoverable from compact list yet still callable on demand
  const presets = await mcp.call('list_transform_presets')
  assert.ok(presets.data.presets.og_card)

  const uploadPresets = await mcp.call('list_upload_presets')
  assert.equal(uploadPresets.data.rightsLock, 'unknown')

  const metaInvalid = await mcp.call('validate_structured_metadata', {
    metadata: { character_id: 'sable' },
  })
  assert.equal(metaInvalid.data.valid, false)

  // No workstation temp root paths leaked
  const purged = await mcp.call('plan_derivative_purge', {
    sha256: sha,
    derivatives: [`derived/${sha.slice(0, 2)}/${sha}.abcdef0123456789.avif`],
  })
  assert.equal(JSON.stringify(purged.data).includes(base), false)
})
