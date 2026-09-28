import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mcp', 'vis-mcp-server.mjs')

async function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-lib-mcp-'))
  const project = path.join(base, 'project')
  const assets = path.join(base, 'assets')
  fs.mkdirSync(project, { recursive: true })
  fs.mkdirSync(path.join(assets, 'shoot'), { recursive: true })
  await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 100, b: 0 } } }).png().toFile(path.join(assets, 'shoot', 'hero.png'))
  fs.writeFileSync(path.join(project, 'vis.config.json'), JSON.stringify({ library: { roots: [{ label: 'assets', path: assets }], minFreeDiskGB: 0 } }))
  return { project, assets }
}

function client(project, env = {}) {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, VIS_ROOT: project, ...env }, stdio: ['pipe', 'pipe', 'ignore'] })
  let buffer = ''
  const waiting = new Map()
  child.stdout.on('data', chunk => {
    buffer += chunk
    let i
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i)
      buffer = buffer.slice(i + 1)
      const msg = JSON.parse(line)
      waiting.get(msg.id)?.(msg)
      waiting.delete(msg.id)
    }
  })
  let id = 0
  const call = (name, args = {}) => new Promise(resolve => {
    const n = ++id
    waiting.set(n, msg => resolve(JSON.parse(msg.result.content[0].text.replace(/^Error: /, '"Error: ') + (msg.result.isError ? '"' : ''))))
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method: 'tools/call', params: { name, arguments: args } }) + '\n')
  })
  const list = () => new Promise(resolve => {
    const n = ++id
    waiting.set(n, msg => resolve(msg.result.tools.map(t => t.name)))
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method: 'tools/list' }) + '\n')
  })
  return { call, list, close: () => child.kill() }
}

test('MCP: read tools are open, writes need the flag, rights and publish need a person', async t => {
  const { project, assets } = await fixture()

  const readOnly = client(project)
  t.after(() => readOnly.close())
  const tools = await readOnly.list()
  for (const name of ['library_search', 'library_get_asset', 'library_list_proposals', 'library_ingest', 'library_propose', 'library_decide_proposal']) {
    assert.ok(tools.includes(name), name)
  }
  const blockedIngest = await readOnly.call('library_ingest', { execute: true })
  assert.equal(blockedIngest.blocked, true)
  assert.equal(blockedIngest.planned, 1)
  assert.equal((await readOnly.call('library_search')).total, 0, 'blocked ingest wrote nothing')

  const writer = client(project, { VIS_ENABLE_WRITES: '1' })
  t.after(() => writer.close())
  const filed = await writer.call('library_ingest', { execute: true })
  assert.equal(filed.filed, 1)

  const found = await writer.call('library_search', { query: 'hero' })
  assert.equal(found.total, 1)
  const assetId = found.assets[0].asset_id
  assert.equal(found.assets[0].rights_status, 'unknown')

  fs.copyFileSync(path.join(assets, 'shoot', 'hero.png'), path.join(assets, 'shoot', 'hero-again.png'))
  const again = await writer.call('library_ingest', { execute: true })
  assert.equal(again.filed, 1)
  assert.equal(again.newAssets, 0, 'same bytes do not create a second asset')
  assert.equal((await writer.call('library_search')).total, 1)

  const detail = await writer.call('library_get_asset', { asset_id: assetId })
  assert.equal(detail.files.length, 2)
  assert.ok(detail.files.every(f => !String(f.absolute_path).includes('redacted')), 'library roots are on the allowlist')

  const proposal = await writer.call('library_propose', { asset_id: assetId, kind: 'rights', rights: 'owned', rule: 'test', execute: true })
  assert.equal(proposal.status, 'open')
  const refused = await writer.call('library_decide_proposal', { proposal_id: proposal.proposal.proposalId, decision: 'accepted', execute: true })
  assert.equal(refused.refused, true, 'rights accept needs VIS_ENABLE_RIGHTS')

  const review = await writer.call('review_assets', { asset_id: assetId, rights_status: 'owned', execute: true })
  assert.equal(review.blocked, true, 'review_assets cannot set rights without VIS_ENABLE_RIGHTS')

  const publish = await writer.call('record_publication', { asset_id: assetId, platform: 'website', url: 'https://example.com', execute: true })
  assert.equal(publish.blocked, true, 'publish without VIS_ENABLE_PUBLISH fails')
  assert.equal((await writer.call('library_get_asset', { asset_id: assetId })).publications.length, 0)

  const person = client(project, { VIS_ENABLE_WRITES: '1', VIS_ENABLE_RIGHTS: '1' })
  t.after(() => person.close())
  const accepted = await person.call('library_decide_proposal', { proposal_id: proposal.proposal.proposalId, decision: 'accepted', execute: true })
  assert.equal(accepted.status, 'accepted')
  assert.equal(accepted.published, false)
  assert.equal((await person.call('library_get_asset', { asset_id: assetId })).rights_status, 'owned')
})
