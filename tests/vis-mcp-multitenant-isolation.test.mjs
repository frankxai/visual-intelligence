import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose'
import { indexProject, openVisDatabase, getAsset } from '../core/vis-core.mjs'
import { createLibrarySchema } from '../core/vis-library.mjs'
import { createCatalogAccess } from '../core/vis-catalog-access.mjs'
import { createWorkspaceCatalogAdapter } from '../core/adapters/workspace-catalog-adapter.mjs'
import { createCatalogJwtAuthenticator } from '../mcp/vis-catalog-auth.mjs'
import { createCatalogHttpHandler } from '../mcp/vis-http-gateway.mjs'
import { createCatalogNodeServer } from '../mcp/vis-http-node.mjs'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2mVxwAAAABJRU5ErkJggg==', 'base64')
const issuer = 'https://identity.starlight.test'
const resource = 'https://mcp.starlight.test/mcp'

const keyPairA = await generateKeyPair('RS256')
const keyPairRogue = await generateKeyPair('RS256')
const jwkA = await exportJWK(keyPairA.publicKey)
const keySet = createLocalJWKSet({ keys: [{ ...jwkA, kid: 'k-active', alg: 'RS256' }] })

async function mintToken(sub, { key = keyPairA.privateKey, kid = 'k-active', iss = issuer, aud = resource, scope = 'catalog:read', exp = '5m' } = {}) {
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setSubject(sub)
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key)
}

function seedTenantCatalog(root, workspaceId, fileStem, tags) {
  fs.mkdirSync(path.join(root, 'public/images'), { recursive: true })
  fs.mkdirSync(path.join(root, 'data/renditions'), { recursive: true })
  fs.writeFileSync(path.join(root, 'public/images', `${fileStem}.png`), PNG)
  indexProject({ root })
  const db = openVisDatabase(root)
  createLibrarySchema(db)
  const asset = db.prepare('SELECT * FROM asset').get()
  db.prepare('UPDATE asset SET tags_json=?, approval_status=?').run(JSON.stringify(tags), 'approved')
  const full = getAsset(db, asset.asset_id)
  const version = full.versions[0]
  const preview = path.join(root, 'data/renditions', `${fileStem}-thumb.png`)
  fs.writeFileSync(preview, PNG)
  db.prepare(
    'INSERT INTO asset_rendition (rendition_id,asset_id,sha256,kind,storage,path,mime_type,byte_size,created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run('thumb', asset.asset_id, version.sha256, 'thumb', 'local', preview, 'image/png', PNG.length, new Date().toISOString())
  db.close()
  return {
    root,
    workspaceId,
    assetId: asset.asset_id,
    versionId: version.version_id,
    adapter: createWorkspaceCatalogAdapter({
      workspaceId,
      indexPath: path.join(root, 'data/vis.sqlite'),
      renditionsDir: path.join(root, 'data/renditions'),
    }),
  }
}

async function createMultiTenantFixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-mt-mcp-'))
  const tenants = {
    'ws-alpha': seedTenantCatalog(path.join(base, 'alpha'), 'ws-alpha', 'aurora-emblem', ['brand:alpha', 'character:nova']),
    'ws-beta': seedTenantCatalog(path.join(base, 'beta'), 'ws-beta', 'obsidian-crest', ['brand:beta', 'character:orion']),
    'ws-gamma': seedTenantCatalog(path.join(base, 'gamma'), 'ws-gamma', 'emerald-sigil', ['brand:gamma', 'character:lyra']),
  }
  const memberships = new Map([
    ['alice', 'ws-alpha'],
    ['bob', 'ws-beta'],
    ['carol', 'ws-gamma'],
  ])
  const auditEvents = []
  const authenticate = createCatalogJwtAuthenticator({
    issuer,
    resource,
    jwksUrl: `${issuer}/jwks`,
    keySet,
    resolveMembership: async ({ subject, requestedWorkspaceId }) => {
      const ws = memberships.get(subject)
      return ws && (!requestedWorkspaceId || requestedWorkspaceId === ws) ? ws : null
    },
  })
  const access = createCatalogAccess({
    sourcesForContext: ctx => [
      { id: 'owned', kind: 'vis_sqlite', adapter: tenants[ctx.workspaceId]?.adapter || null },
      { id: 'r2-private', kind: 'cloudflare_r2', adapter: null },
    ],
    onAudit: event => auditEvents.push(event),
  })
  const handler = createCatalogHttpHandler({ access, authenticate, issuer, resource })
  const server = createCatalogNodeServer(handler, resource)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    fs.rmSync(base, { recursive: true, force: true })
  })

  let seq = 0
  const rpc = async (method, params = {}, who = 'alice', extraHeaders = {}, rawToken) => {
    const auth = rawToken ?? (await mintToken(who))
    const res = await fetch(`http://127.0.0.1:${server.address().port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${auth}`,
        ...extraHeaders,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params }),
    })
    return { status: res.status, headers: res.headers, body: await res.json() }
  }
  const call = (name, args = {}, who = 'alice', extraHeaders = {}, rawToken) =>
    rpc('tools/call', { name, arguments: args }, who, extraHeaders, rawToken)

  return { base, tenants, memberships, auditEvents, rpc, call }
}

test('VIS#65/#68: 3-tenant MCP gateway enforces strict workspace isolation across every read tool', async t => {
  const f = await createMultiTenantFixture(t)

  // Every tenant sees only its own catalog even though underlying SHA256/assetId is identical
  const alphaRes = (await f.call('search_assets', {}, 'alice')).body.result.structuredContent
  const betaRes = (await f.call('search_assets', {}, 'bob')).body.result.structuredContent
  const gammaRes = (await f.call('search_assets', {}, 'carol')).body.result.structuredContent

  assert.match(alphaRes.assets[0].title, /aurora/)
  assert.match(betaRes.assets[0].title, /obsidian/)
  assert.match(gammaRes.assets[0].title, /emerald/)
  assert.equal((await f.call('search_assets', { query: 'aurora' }, 'carol')).body.result.structuredContent.assets.length, 0)
  assert.equal((await f.call('search_assets', { query: 'emerald' }, 'alice')).body.result.structuredContent.assets.length, 0)

  // Cross-workspace header spoofing fails closed with 403 across all read tools
  for (const [tool, args] of [
    ['get_asset_sources', {}],
    ['search_assets', {}],
    ['get_asset', { source_id: 'owned', asset_id: f.tenants['ws-alpha'].assetId }],
    ['get_asset_preview', { source_id: 'owned', asset_id: f.tenants['ws-alpha'].assetId, version_id: f.tenants['ws-alpha'].versionId }],
  ]) {
    const spoofed = await f.call(tool, args, 'bob', { 'x-gencreator-workspace-id': 'ws-alpha' })
    assert.equal(spoofed.status, 403, `expected 403 for cross-tenant ${tool}`)
  }

  // Unconfigured R2 source coverage stays explicit and never leaks local paths
  const sources = (await f.call('get_asset_sources', {}, 'carol')).body.result.structuredContent
  assert.equal(sources.coverage.find(s => s.source_id === 'owned').state, 'ready')
  assert.equal(sources.coverage.find(s => s.source_id === 'r2-private').state, 'not_configured')
  assert.ok(!JSON.stringify(sources).includes(f.base))
})

test('VIS#65/#68: rogue signing keys, wrong kid, revoked memberships, and mutating tools fail closed', async t => {
  const f = await createMultiTenantFixture(t)

  // Rogue RSA key with matching kid must be rejected (401)
  const rogueJwt = await mintToken('alice', { key: keyPairRogue.privateKey, kid: 'k-active' })
  assert.equal((await f.rpc('tools/list', {}, 'alice', {}, rogueJwt)).status, 401)

  // Unknown kid must be rejected (401)
  const badKidJwt = await mintToken('alice', { kid: 'k-rotated-out' })
  assert.equal((await f.rpc('tools/list', {}, 'alice', {}, badKidJwt)).status, 401)

  // Revoking carol immediately blocks ALL read tools with 403
  f.memberships.delete('carol')
  for (const [tool, args] of [
    ['get_asset_sources', {}],
    ['search_assets', {}],
    ['get_asset', { source_id: 'owned', asset_id: f.tenants['ws-gamma'].assetId }],
    ['get_asset_preview', { source_id: 'owned', asset_id: f.tenants['ws-gamma'].assetId, version_id: f.tenants['ws-gamma'].versionId }],
  ]) {
    const res = await f.call(tool, args, 'carol')
    assert.equal(res.status, 403, `revoked tenant must get 403 on ${tool}`)
  }

  // All mutating/write tool invocations fail closed
  for (const writeTool of ['approve_asset', 'publish_asset', 'delete_asset', 'r2_put', 'update_rights']) {
    const res = await f.call(writeTool, { asset_id: f.tenants['ws-alpha'].assetId }, 'alice')
    assert.equal(res.body.result.isError, true, `write tool ${writeTool} must fail closed`)
  }
})
