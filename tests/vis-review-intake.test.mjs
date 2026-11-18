import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, generateKeyPairSync } from 'node:crypto'
import sharp from 'sharp'
import { getLibraryAsset, listLibrary, openLibraryDatabase, renditionPath } from '../core/vis-library.mjs'
import {
  auditReviewStorage,
  readReviewRendition,
  getReviewIntakeMetadata,
  exportReviewAsset,
  getReviewIntake,
  importReviewAsset,
  ingestReviewAsset,
  initializeReviewWorkspace
} from '../core/vis-review-intake.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-review-intake-'))
  const storageDir = path.join(root, 'vault')
  const packageDir = path.join(root, 'package')
  fs.mkdirSync(storageDir)
  fs.mkdirSync(packageDir)
  const db = openLibraryDatabase(root)
  t.after(() => {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { root, storageDir, packageDir, db, tenant: 'fixture', actor: 'fixture-runner' }
}
async function image(f, color = 'red') {
  const bytes = await sharp({ create: { width: 42, height: 26, channels: 3, background: color } })
    .png()
    .toBuffer()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return {
    ...f,
    bytes,
    manifest: {
      kind: 'diagram',
      title: 'Source diagram',
      brand: 'test',
      maker: 'illustrator',
      mime_type: 'image/png',
      sha256,
      source_uri: 'urn:fixture:' + color,
      source_version: '1',
      rights: 'owned',
      consent: 'not-required',
      execution: { run_id: 'local-123', cost_micros: 0, currency: 'EUR' }
    }
  }
}
test('one verified original, real VIS preview, immutable lineage and retry-safe receipts', async (t) => {
  const f = fixture(t)
  initializeReviewWorkspace(f.db, f.tenant)
  const first = await image(f)
  const a = await ingestReviewAsset(f.db, first)
  assert.equal(a.technical_pass, true)
  assert.equal(a.width, 42)
  assert.equal(a.height, 26)
  assert.equal(a.malware_status, 'unscanned')
  assert.equal(getLibraryAsset(f.db, a.asset_id).rights_status, 'unknown')
  assert.equal(listLibrary(f.db).total, 1)
  assert.ok(fs.existsSync(renditionPath(f.root, f.db, a.asset_id, 'preview')))
  await ingestReviewAsset(f.db, first)
  const count = () =>
    f.db.prepare("SELECT count(*) AS n FROM provenance_event WHERE event_type='review-intake'").get().n
  assert.equal(count(), 1)
  const second = await image(f, 'blue')
  second.manifest.parents = [{ asset_id: a.asset_id, version: a.version, sha256: a.sha256 }]
  const b = await ingestReviewAsset(f.db, second)
  assert.deepEqual(b.parents, second.manifest.parents)
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM asset_derivative').get().n, 1)
  assert.equal(count(), 2)
  const options = {
    tenant: 'fixture',
    assetId: a.asset_id,
    root: f.root,
    kind: 'preview',
    sha256: a.sha256
  }
  assert.ok(readReviewRendition(f.db, options).length)
  assert.equal(readReviewRendition(f.db, { ...options, sha256: b.sha256 }), null)
  const previewPath = renditionPath(f.root, f.db, a.asset_id, 'preview')
  fs.chmodSync(previewPath, 0o600)
  fs.writeFileSync(previewPath, 'swapped')
  assert.throws(() => readReviewRendition(f.db, options), /Rendition checksum/)
  await assert.rejects(
    ingestReviewAsset(f.db, { ...first, manifest: { ...first.manifest, maker: 'replacement' } }),
    /Conflicting/
  )
  assert.equal(getReviewIntake(f.db, 'fixture', a.asset_id).maker, 'illustrator')
})
test('tenant binding, source hashes, declared MIME, source versions and lineage fail closed', async (t) => {
  const f = fixture(t)
  initializeReviewWorkspace(f.db, f.tenant)
  assert.throws(() => initializeReviewWorkspace(f.db, 'another'), /Workspace binding/)
  const first = await image(f)
  for (const [overrides, pattern] of [
    [{ tenant: 'another' }, /Workspace binding/],
    [{ manifest: { ...first.manifest, sha256: '0'.repeat(64) } }, /checksum/],
    [{ manifest: { ...first.manifest, mime_type: 'image/jpeg' } }, /MIME/],
    [{ manifest: { ...first.manifest, source_uri: 'https://example.com/a?sig=private' } }, /temporary/],
    [
      {
        manifest: {
          ...first.manifest,
          parents: [{ asset_id: 'missing', version: 'v1', sha256: first.manifest.sha256 }]
        }
      },
      /parent/
    ]
  ])
    await assert.rejects(ingestReviewAsset(f.db, { ...first, ...overrides }), pattern)
  assert.equal(listLibrary(f.db).total, 0)
  await ingestReviewAsset(f.db, first)
  const variant = await image(f, 'blue')
  variant.manifest.source_uri = first.manifest.source_uri
  await assert.rejects(ingestReviewAsset(f.db, variant), /Conflicting immutable source version/)
  assert.deepEqual(auditReviewStorage(f.db, f), { verified: 1, invalid: [], untracked: [] })
  assert.equal(listLibrary(f.db).total, 1)
})
test('signed export and clean import verify originals and never carry destination approval', async (t) => {
  const f = fixture(t)
  const destination = fixture(t)
  initializeReviewWorkspace(f.db, f.tenant)
  initializeReviewWorkspace(destination.db, destination.tenant)
  const first = await ingestReviewAsset(f.db, await image(f))
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' }
  })
  exportReviewAsset(f.db, { ...f, assetId: first.asset_id, privateKey })
  const options = { ...destination, packageDir: f.packageDir, publicKey }
  const imported = await importReviewAsset(destination.db, options)
  assert.equal(imported.sha256, first.sha256)
  assert.equal(imported.version, first.version)
  assert.equal(getLibraryAsset(destination.db, first.asset_id).approval_status, 'candidate')
  const manifestFile = path.join(f.packageDir, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestFile))
  manifest.payload.input.rights = 'licensed'
  fs.chmodSync(manifestFile, 0o600)
  fs.writeFileSync(manifestFile, JSON.stringify(manifest))
  await assert.rejects(importReviewAsset(destination.db, options), /signature/)
  const obj = getLibraryAsset(f.db, first.asset_id).files[0].absolute_path
  fs.chmodSync(obj, 0o600)
  fs.writeFileSync(obj, 'tampered')
  assert.throws(() => getReviewIntake(f.db, f.tenant, first.asset_id), /checksum/)
  assert.equal(getReviewIntakeMetadata(f.db, f.tenant, first.asset_id).version, first.version)
  assert.deepEqual(auditReviewStorage(f.db, f).invalid, [first.sha256])
})
test('populated legacy catalog requires reconciled migration, untrusted package paths stay local', async (t) => {
  const f = fixture(t)
  f.db
    .prepare(
      "INSERT INTO asset(asset_id,media_type,source_hash,first_seen_at,last_seen_at) VALUES ('old','image','test','now','now')"
    )
    .run()
  assert.throws(() => initializeReviewWorkspace(f.db, f.tenant), /populated database/)
  const other = fixture(t)
  initializeReviewWorkspace(other.db, other.tenant)
  const link = path.join(other.root, 'symlink')
  fs.symlinkSync(other.storageDir, link)
  await assert.rejects(
    ingestReviewAsset(other.db, { ...(await image(other)), storageDir: link }),
    /non-symlink/
  )
})
test('SVG source is retained privately without raster validation or browser rendering', async (t) => {
  const f = fixture(t)
  initializeReviewWorkspace(f.db, f.tenant)
  const first = await image(f)
  const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
  const a = await ingestReviewAsset(f.db, {
    ...first,
    bytes,
    manifest: {
      ...first.manifest,
      mime_type: 'image/svg+xml',
      sha256: createHash('sha256').update(bytes).digest('hex')
    }
  })
  assert.equal(a.technical_pass, false)
  assert.equal(a.validation, 'signature-only')
  assert.equal(renditionPath(f.root, f.db, a.asset_id, 'preview'), null)
})
