import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import worker, { signPath as workerSign } from '../workers/vis-media/src/index.js'
import { masterKey, renditionKey } from '../core/vis-storage.mjs'
import {
  DEFAULT_R2_BUCKET,
  buildR2DamPlan,
  createSignedPreviewUrl,
  normalizeUsageEdges,
  reconcileR2DamPlanDryRun,
  resolvePrivateWorkerBase,
  validateUploadKey,
  verifyPreviewSignature,
} from '../core/vis-r2-dam-plan.mjs'

function memoryBucket() {
  const store = new Map()
  const obj = (key, v) => ({
    key,
    size: v.bytes.length,
    httpEtag: `"${v.etag}"`,
    etag: v.etag,
    httpMetadata: v.httpMetadata,
    customMetadata: v.customMetadata,
    get body() { return new Response(v.bytes).body },
  })
  return {
    store,
    async get(key) { const v = store.get(key); return v ? obj(key, v) : null },
    async head(key) { const v = store.get(key); return v ? obj(key, v) : null },
    async put(key, body, opts = {}) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer())
      const actual = crypto.createHash('sha256').update(bytes).digest('hex')
      if (opts.sha256 && opts.sha256 !== actual) throw new Error('checksum mismatch')
      const v = { bytes, etag: actual.slice(0, 16), httpMetadata: opts.httpMetadata, customMetadata: opts.customMetadata }
      store.set(key, v)
      return obj(key, v)
    },
    async delete(key) { store.delete(key) },
  }
}

test('buildR2DamPlan defaults to starlight-media-private with zero workers.dev default', () => {
  const sha = crypto.createHash('sha256').update('starlight-master-1').digest('hex')
  const plan = buildR2DamPlan([
    {
      assetId: 'sis-hero-01',
      brand: 'sis',
      sha256: sha,
      rawPath: 'sis/raw/hero.png',
      rightsStatus: 'generated-owned',
      qa: { total: 29, decision: 'pass' },
      usedIn: [
        { domain: 'StarlightIntelligence.ai', route: '/', component: 'Hero', sourceFile: 'app\\page.tsx' },
        { domain: 'starlightintelligence.ai', route: '/', component: 'Hero', sourceFile: 'app/page.tsx' },
      ],
    },
  ])

  assert.equal(plan.bucket, DEFAULT_R2_BUCKET)
  assert.equal(plan.bucket, 'starlight-media-private')
  assert.equal(plan.workerBase, null)
  assert.equal(plan.accessMode, 'private-worker-binding')
  assert.equal(plan.readyCount, 1)
  assert.equal(plan.totalUsageEdges, 1)
  assert.ok(!JSON.stringify(plan).includes('workers.dev'))
  assert.ok(!JSON.stringify(plan).includes('r2.dev'))
  assert.equal(plan.uploadManifest[0].r2.putMasterEndpoint, `/o/${masterKey(sha)}`)
  assert.equal(plan.uploadManifest[0].r2.signedPreviewPattern, `/r/${sha}/preview?exp=<unix>&sig=<hmac>`)
  assert.equal(plan.uploadManifest[0].usageCount, 1)
  assert.equal(plan.uploadManifest[0].hasActivePlacement, true)
  assert.equal(plan.uploadManifest[0].usedIn[0].sourceFile, 'app/page.tsx')
})

test('resolvePrivateWorkerBase rejects workers.dev, r2.dev, insecure http, and credentials; accepts custom HTTPS domain', () => {
  assert.equal(resolvePrivateWorkerBase(undefined), null)
  assert.equal(resolvePrivateWorkerBase(''), null)
  assert.equal(resolvePrivateWorkerBase('https://media.starlightintelligence.org/'), 'https://media.starlightintelligence.org')
  assert.throws(() => resolvePrivateWorkerBase('https://vis-media.starlightintelligence.workers.dev'), /workers\.dev/)
  assert.throws(() => resolvePrivateWorkerBase('https://pub-12345.r2.dev'), /r2\.dev/)
  assert.throws(() => resolvePrivateWorkerBase('http://media.starlightintelligence.org'), /https:/)
  assert.throws(() => resolvePrivateWorkerBase('https://user:pass@media.starlightintelligence.org'), /credentials/)
  assert.throws(() => buildR2DamPlan([], { workerBase: 'https://vis-media.starlightintelligence.workers.dev' }), /workers\.dev/)
})

test('validateUploadKey enforces VIS#44 content-addressed key hygiene and blocks traversal', () => {
  const sha = 'a'.repeat(64)
  const otherSha = 'b'.repeat(64)
  assert.equal(validateUploadKey(masterKey(sha), sha).valid, true)
  assert.equal(validateUploadKey(renditionKey(sha, 'preview'), sha).valid, true)
  assert.equal(validateUploadKey(renditionKey(sha, 'thumb'), sha).valid, true)
  assert.equal(validateUploadKey('test/probe.txt').valid, true)

  assert.equal(validateUploadKey(masterKey(otherSha), sha).reason, 'master_key_sha256_mismatch')
  assert.equal(validateUploadKey(renditionKey(otherSha, 'preview'), sha).reason, 'rendition_key_sha256_mismatch')
  assert.equal(validateUploadKey('masters/aa/..%2fsecret', sha).reason, 'unsafe_key_characters')
  assert.equal(validateUploadKey('masters/aa/../../secret', sha).reason, 'unsafe_key_characters')
  assert.equal(validateUploadKey('masters\\aa\\' + sha, sha).reason, 'unsafe_key_characters')
  assert.equal(validateUploadKey('public/hero.png', sha).reason, 'invalid_key_format')
  assert.equal(validateUploadKey('', sha).reason, 'empty_key')
})

test('normalizeUsageEdges deduplicates case-insensitively and tracks orphan assets cleanly', () => {
  const edges = normalizeUsageEdges([
    { domain: 'FRANKX.AI', route: '/vault', component: 'Card', sourceFile: 'src\\Card.tsx' },
    { domain: 'frankx.ai', route: '/vault', component: 'Card', sourceFile: 'src/Card.tsx' },
    '/standalone',
    null,
    {},
  ])
  assert.equal(edges.length, 2)
  assert.equal(edges[0].domain, 'frankx.ai')
  assert.equal(edges[0].sourceFile, 'src/Card.tsx')
  assert.equal(edges[1].route, '/standalone')
})

test('HMAC preview signatures and dry-run reconciliation match workers/vis-media/src/index.js without mutating R2', async () => {
  const secret = 'test-preview-signing-key-2026'
  const adminToken = 'test-admin-token-2026'
  const workerBase = 'https://media.starlightintelligence.org'
  const bucket = memoryBucket()
  const env = { MEDIA: bucket, PREVIEW_SIGNING_KEY: secret, ADMIN_TOKEN: adminToken }

  const masterBytes = Buffer.from('master-image-bytes-for-reconcile')
  const syncedSha = crypto.createHash('sha256').update(masterBytes).digest('hex')
  const pendingSha = crypto.createHash('sha256').update('pending-image-bytes').digest('hex')
  const previewBytes = Buffer.from('RIFF0000WEBPpreview')
  const thumbBytes = Buffer.from('RIFF0000WEBPthumb')

  // Seed only the first asset into the in-memory R2 bucket via the Worker admin API
  const seedPut = async (key, body, contentType, shaHeader) => {
    const res = await worker.fetch(
      new Request(`${workerBase}/o/${key}`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': contentType,
          'x-content-sha256': shaHeader,
        },
        body,
      }),
      env
    )
    assert.equal(res.status, 201)
  }
  await seedPut(masterKey(syncedSha), masterBytes, 'image/png', syncedSha)
  await seedPut(renditionKey(syncedSha, 'preview'), previewBytes, 'image/webp', crypto.createHash('sha256').update(previewBytes).digest('hex'))
  await seedPut(renditionKey(syncedSha, 'thumb'), thumbBytes, 'image/webp', crypto.createHash('sha256').update(thumbBytes).digest('hex'))

  // Verify HMAC parity between vis-r2-dam-plan and workers/vis-media
  const nowSec = Math.floor(Date.now() / 1000)
  const signedUrl = createSignedPreviewUrl({ workerBase, sha256: syncedSha, kind: 'preview', signingKey: secret, ttlSeconds: 600, nowSec })
  const parsed = new URL(signedUrl)
  const exp = parsed.searchParams.get('exp')
  const sig = parsed.searchParams.get('sig')
  assert.equal(sig, await workerSign(secret, `/r/${syncedSha}/preview`, exp))
  assert.equal(verifyPreviewSignature({ signingKey: secret, pathPart: `/r/${syncedSha}/preview`, exp, sig, nowSec }), true)
  assert.equal(verifyPreviewSignature({ signingKey: 'wrong-key', pathPart: `/r/${syncedSha}/preview`, exp, sig, nowSec }), false)
  assert.equal(verifyPreviewSignature({ signingKey: secret, pathPart: `/r/${syncedSha}/thumb`, exp, sig, nowSec }), false)
  assert.equal(verifyPreviewSignature({ signingKey: secret, pathPart: `/r/${syncedSha}/preview`, exp: String(nowSec - 5), sig, nowSec }), false)

  // Spy on methods to prove dry-run reconciliation issues zero PUT/DELETE calls
  const methodsSeen = []
  const fetchImpl = (url, init = {}) => {
    methodsSeen.push(init.method || 'GET')
    return worker.fetch(new Request(url, init), env)
  }

  const plan = buildR2DamPlan(
    [
      { assetId: 'synced-01', brand: 'sis', sha256: syncedSha, rightsStatus: 'generated-owned', qa: { total: 29 } },
      { assetId: 'pending-02', brand: 'sis', sha256: pendingSha, rightsStatus: 'generated-owned', qa: { total: 28 } },
    ],
    { workerBase }
  )
  const report = await reconcileR2DamPlanDryRun(plan, { fetchImpl, adminToken, signingKey: secret, nowSec })
  assert.equal(report.dryRun, true)
  assert.equal(report.bucket, 'starlight-media-private')
  assert.equal(report.checkedCount, 2)
  assert.equal(report.syncedCount, 1)
  assert.equal(report.pendingUploadCount, 1)
  assert.equal(report.errorCount, 0)
  assert.equal(report.results[0].status, 'synced')
  assert.equal(report.results[0].signedPreviewStatus, 200)
  assert.equal(report.results[0].unsignedDenied, true)
  assert.equal(report.results[1].status, 'pending_upload')
  assert.equal(report.results[1].missingKeys.length, 3)
  assert.equal(report.results[1].signedPreviewStatus, 404)
  assert.equal(report.results[1].unsignedDenied, true)
  assert.ok(methodsSeen.every(m => m === 'HEAD' || m === 'GET'), `unexpected mutating methods: ${methodsSeen.join(',')}`)
})
