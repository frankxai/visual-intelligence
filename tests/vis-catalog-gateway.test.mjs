import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose'
import { indexProject, openVisDatabase, getAsset } from '../core/vis-core.mjs'
import { createLibrarySchema } from '../core/vis-library.mjs'
import { createCatalogAccess, validateCatalogInput } from '../core/vis-catalog-access.mjs'
import { createWorkspaceCatalogAdapter } from '../core/adapters/workspace-catalog-adapter.mjs'
import { createCatalogJwtAuthenticator } from '../mcp/vis-catalog-auth.mjs'
import { createCatalogHttpHandler } from '../mcp/vis-http-gateway.mjs'
import { createCatalogNodeServer } from '../mcp/vis-http-node.mjs'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2mVxwAAAABJRU5ErkJggg==', 'base64')
const issuer = 'https://identity.example.test', resource = 'https://creator.example.test/mcp'
const { publicKey, privateKey } = await generateKeyPair('RS256')
const jwk = await exportJWK(publicKey)
const keySet = createLocalJWKSet({ keys: [{ ...jwk, kid: 'fixture', alg: 'RS256' }] })
async function token(sub = 'alice', overrides = {}) {
  return new SignJWT({ scope: 'catalog:read', ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).setSubject(sub).setIssuer(overrides.iss || issuer).setAudience(overrides.aud || resource).setIssuedAt().setExpirationTime(overrides.exp || '5m').sign(privateKey)
}

function catalog(root, workspaceId, name) {
  fs.mkdirSync(path.join(root, 'public/images'), { recursive: true })
  fs.mkdirSync(path.join(root, 'data/renditions'), { recursive: true })
  fs.writeFileSync(path.join(root, 'public/images', name + '.png'), PNG)
  indexProject({ root })
  const db = openVisDatabase(root)
  createLibrarySchema(db)
  const asset = db.prepare('SELECT * FROM asset').get()
  db.prepare('UPDATE asset SET tags_json=?, approval_status=?').run(JSON.stringify(['brand:fixture','character:fox']), 'approved')
  const full = getAsset(db, asset.asset_id), version = full.versions[0]
  const preview = path.join(root, 'data/renditions', 'thumb.png')
  fs.writeFileSync(preview, PNG)
  db.prepare('INSERT INTO asset_rendition (rendition_id,asset_id,sha256,kind,storage,path,mime_type,byte_size,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run('thumb', asset.asset_id, version.sha256, 'thumb', 'local', preview, 'image/png', PNG.length, new Date().toISOString())
  db.close()
  return { root, assetId: asset.asset_id, versionId: version.version_id, preview,
    adapter: createWorkspaceCatalogAdapter({ workspaceId, indexPath: path.join(root,'data/vis.sqlite'), renditionsDir: path.join(root,'data/renditions') }) }
}

async function fixture(t, options = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-catalog-'))
  const alice = catalog(path.join(base, 'alice'), 'workspace-a', 'copper-fox')
  const bob = catalog(path.join(base, 'bob'), 'workspace-b', 'turtle')
  const memberships = new Map([['alice','workspace-a'], ['bob','workspace-b']])
  const authenticate = createCatalogJwtAuthenticator({ issuer, resource, jwksUrl: issuer + '/jwks', keySet,
    resolveMembership: async ({ subject, requestedWorkspaceId }) => { const id = memberships.get(subject); return !requestedWorkspaceId || requestedWorkspaceId === id ? id : null } })
  const access = createCatalogAccess({ sourcesForContext: ctx => [
    { id: 'owned', kind: 'vis_sqlite', adapter: ctx.workspaceId === 'workspace-a' ? alice.adapter : bob.adapter },
    { id: 'cloudinary', kind: 'cloudinary', adapter: null },
  ] })
  const handler = createCatalogHttpHandler({ access, authenticate, issuer, resource, ...options })
  const server = createCatalogNodeServer(handler, resource)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(base, { recursive: true, force: true }) })
  let n = 0
  const rpc = async (method, params = {}, who = 'alice', extraHeaders = {}, rawToken) => {
    const auth = rawToken ?? await token(who)
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/mcp', { method: 'POST', headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + auth, ...extraHeaders,
    }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }) })
    return { status: response.status, headers: response.headers, body: await response.json() }
  }
  const call = async (name, args = {}, who = 'alice', extra = {}) => rpc('tools/call', { name, arguments: args }, who, extra)
  return { alice, bob, rpc, call, memberships, base, server }
}

test('HTTP initialize, discovery, search, exact version and preview use existing catalog', async t => {
  const f = await fixture(t)
  const init = await f.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'fresh-adopter', version: '1' } })
  assert.equal(init.body.result.protocolVersion, '2025-11-25')
  const tools = (await f.rpc('tools/list')).body.result.tools
  assert.equal(tools.length, 4)
  assert.ok(tools.every(x => x.annotations.readOnlyHint && !x.annotations.destructiveHint))
  const found = (await f.call('search_assets', { query: 'copper fox', brand: 'fixture', character: 'fox', approval_status: 'approved', aspect: 'square' })).body.result
  assert.equal(found.structuredContent.assets.length, 1)
  const selected = found.structuredContent.assets[0]
  assert.equal(selected.asset_id, f.alice.assetId)
  assert.equal(selected.version_id, f.alice.versionId)
  assert.equal(found.structuredContent.coverage[1].state, 'not_configured')
  assert.equal(found.structuredContent.complete, false)
  assert.equal(found.structuredContent.retrieval, 'metadata')
  const args = { source_id: 'owned', asset_id: selected.asset_id, version_id: selected.version_id }
  const detail = (await f.call('get_asset', args)).body.result
  assert.equal(detail.structuredContent.asset.approval_status, 'approved')
  assert.ok(!JSON.stringify(detail).includes(f.base), 'no workstation paths exposed')
  const preview = (await f.call('get_asset_preview', args)).body.result
  assert.equal(preview.content[1].type, 'image')
  assert.equal(Buffer.from(preview.content[1].data, 'base64').length, PNG.length)
  assert.ok(!JSON.stringify(preview.structuredContent).includes('base64'))
})

test('two users with identical content hashes retain isolated titles and catalogs', async t => {
  const f = await fixture(t)
  assert.equal(f.alice.assetId, f.bob.assetId, 'hash identity remains compatible with VIS')
  const alice = (await f.call('search_assets', {})).body.result.structuredContent.assets
  const bob = (await f.call('search_assets', {}, 'bob')).body.result.structuredContent.assets
  assert.match(alice[0].title, /copper/)
  assert.match(bob[0].title, /turtle/)
  assert.equal((await f.call('search_assets', { query: 'copper' }, 'bob')).body.result.structuredContent.assets.length, 0)
  assert.equal((await f.call('get_asset', { source_id:'owned', asset_id:f.alice.assetId }, 'bob')).body.result.structuredContent.asset.title, bob[0].title)
  assert.equal((await f.call('search_assets', {}, 'bob', { 'x-gencreator-workspace-id':'workspace-a' })).status, 403)
  assert.equal((await f.call('get_asset_preview', { source_id:'owned', asset_id:f.alice.assetId, version_id:f.alice.versionId }, 'bob', { 'x-gencreator-workspace-id':'workspace-a' })).status, 403)
})

test('membership revocation applies on the next preview read', async t => {
  const f = await fixture(t)
  f.memberships.delete('alice')
  assert.equal((await f.call('get_asset_preview', { source_id:'owned', asset_id:f.alice.assetId, version_id:f.alice.versionId })).status, 403)
})

test('JWT verification denies expired, forged, wrong-audience, wrong-issuer and scope-less tokens', async t => {
  const f = await fixture(t)
  for (const overrides of [{ exp: 1 }, { aud: 'https://unrelated.example.test/mcp' }, { iss: 'https://unrelated.example.test' }, { scope: '' }]) {
    const response = await f.rpc('tools/list', {}, 'alice', {}, await token('alice', overrides))
    assert.ok([401,403].includes(response.status))
    assert.match(response.headers.get('www-authenticate'), /resource_metadata/)
  }
  const original = await token()
  const parts = original.split('.'); parts[2] = 'AAAA'
  assert.equal((await f.rpc('tools/list', {}, 'alice', {}, parts.join('.'))).status, 401)
})

test('empty, unavailable and unconfigured sources are distinct and sanitized', async t => {
  const f = await fixture(t)
  const empty = (await f.call('search_assets', { query:'does-not-exist' })).body.result.structuredContent
  assert.equal(empty.no_matches, true)
  assert.equal(empty.coverage[0].state, 'ready')
  fs.renameSync(path.join(f.alice.root, 'data/vis.sqlite'), path.join(f.alice.root, 'data/moved.sqlite'))
  const offline = (await f.call('search_assets', {})).body.result.structuredContent
  assert.equal(offline.coverage[0].state, 'unavailable')
  assert.equal(offline.coverage[1].state, 'not_configured')
  assert.equal(offline.complete, false)
  assert.ok(!JSON.stringify(offline).includes(f.base))
})

test('unknown sources, versions, write tools and injected workspace/path arguments fail closed', async t => {
  const f = await fixture(t)
  for (const [name,args] of [
    ['search_assets',{ workspace_id:'workspace-b' }], ['search_assets',{ path:'/etc/passwd' }],
    ['search_assets',{ limit:100000 }], ['search_assets',{ limit:1.5 }],
    ['get_asset',{ source_id:'other-user', asset_id:f.alice.assetId }],
    ['get_asset',{ source_id:'owned', asset_id:'/etc/passwd' }],
    ['get_asset',{ source_id:'owned', asset_id:f.alice.assetId, version_id:'not-a-version' }],
    ['approve_asset',{ asset_id:f.alice.assetId }], ['publish_asset',{}],
  ]) assert.equal((await f.call(name,args)).body.result.isError, true, name + JSON.stringify(args))
  assert.throws(() => validateCatalogInput('search_assets', { __proto__:null, limit:0 }))
  assert.throws(() => validateCatalogInput('search_assets', JSON.parse('{"__proto__":{"workspace_id":"workspace-b"}}')))
  assert.throws(() => validateCatalogInput('search_assets', { constructor:'injected' }))
})

test('previews reject files outside the enrolled rendition root and mismatched image bytes', async t => {
  const f = await fixture(t), args = { source_id:'owned', asset_id:f.alice.assetId, version_id:f.alice.versionId }
  const db = openVisDatabase(f.alice.root)
  const outside = path.join(f.base,'outside.png'); fs.writeFileSync(outside,PNG)
  db.prepare('UPDATE asset_rendition SET path=?').run(outside); db.close()
  assert.equal((await f.call('get_asset_preview',args)).body.result.isError, true)
  const second = openVisDatabase(f.alice.root); second.prepare('UPDATE asset_rendition SET path=?').run(f.alice.preview); second.close()
  fs.writeFileSync(f.alice.preview,'private text masquerading as an image')
  assert.equal((await f.call('get_asset_preview',args)).body.result.isError, true)
})

test('origin, protocol, size bounds and per-principal rate limits apply over HTTP', async t => {
  const f = await fixture(t)
  assert.equal((await f.rpc('tools/list',{},'alice',{ Origin:'https://evil.example.test' })).status,403)
  assert.equal((await f.rpc('tools/list',{},'alice',{ 'MCP-Protocol-Version':'not-supported' })).status,400)
  assert.equal((await f.call('search_assets',{ query:'x'.repeat(70000) })).status,413)
  const limited = await fixture(t,{ requestsPerMinute:1 })
  assert.equal((await limited.rpc('tools/list')).status,200)
  assert.equal((await limited.rpc('tools/list')).status,429)
  assert.equal((await limited.rpc('tools/list',{},'bob')).status,200)
})
