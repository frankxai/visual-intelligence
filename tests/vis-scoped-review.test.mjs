import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generateKeyPairSync, sign } from 'node:crypto'
import sharp from 'sharp'
import { openLibraryDatabase } from '../core/vis-library.mjs'
import { loadConfig } from '../core/vis-core.mjs'
import { createLocalStorage, sha256File } from '../core/vis-storage.mjs'
import { manifestBytes, importOriginal, exportOriginal } from '../core/vis-intake.mjs'
import {
  publicationReceiptBytes,
  observePublication,
  REVIEW_ACTIONS,
  applyDecision,
  bindReview,
  decisionBytes,
  decisionTemplate,
  reviewRecord,
} from '../core/vis-review.mjs'
import { serveLibrary } from '../web/vis-library-server.mjs'

async function setup(t) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-scoped-'))
  fs.writeFileSync(path.join(project, 'vis.config.json'), '{}')
  const db = openLibraryDatabase(project, loadConfig(project))
  const cleanups = [() => db.close()]
  t.after(async () => {
    while (cleanups.length > 0) await cleanups.pop()()
    fs.rmSync(project, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  })
  const key = generateKeyPairSync('ed25519'),
    actor = 'human:reviewer',
    workspace = 'synthetic-a'
  const publicKey = key.publicKey.export({ format: 'pem', type: 'spki' }),
    destination = 'newsletter:issue-1'
  const policy = {
    workspace,
    reviewers: [{ actor, actions: REVIEW_ACTIONS, destinations: [destination], publicKey }],
    ingesters: [{ actor: 'agent:fixture', publicKey, brands: ['fixture'], sourceKinds: ['diagram'] }],
    channels: [{ platform: 'newsletter', destination }],
  }
  const file = path.join(project, 'fixture.png'),
    objectRoot = path.join(project, 'objects')
  await sharp({ create: { width: 128, height: 80, channels: 3, background: '#426' } })
    .png()
    .toFile(file)
  const manifest = {
    schema: 'vis.intake.v1',
    workspace,
    brand: 'fixture',
    sourceKind: 'diagram',
    sourceRef: 'urn:vis:test:1',
    sourceVersion: '1',
    sourceOwner: 'fixture',
    title: 'Test plate',
    sha256: sha256File(file),
    bytes: fs.statSync(file).size,
    mime: 'image/png',
    parent: null,
    run: 'fixture-1',
    actor: 'agent:fixture',
    model: null,
    costMicros: 0,
    currency: 'EUR',
    rightsRef: null,
    consentRef: null,
    folioRef: null,
    promptRef: null,
  }
  const signed = (m) => ({
    manifest: m,
    signature: sign(null, manifestBytes(m), key.privateKey).toString('base64url'),
  })
  const intake = { project, policy, db, objectRoot, file, envelope: signed(manifest) }
  const imported = await importOriginal(intake),
    asset = imported.asset
  const record = () => reviewRecord(db, asset)
  const make = (action, extra = {}) => ({
    ...decisionTemplate(record(), workspace, action, actor),
    destination,
    campaign: 'edition-1',
    note: 'Fixture review',
    rightsRef: 'rights:test',
    consentRef: 'consent:test',
    ...extra,
  })
  const wrap = (d) => ({
    decision: d,
    signature: sign(null, decisionBytes(d), key.privateKey).toString('base64url'),
  })
  const apply = (d) => applyDecision(db, policy, wrap(d), asset)
  return {
    key,
    db,
    project,
    objectRoot,
    policy,
    imported,
    intake,
    manifest,
    signed,
    record,
    make,
    wrap,
    apply,
    asset,
    destination,
    onCleanup: (fn) => cleanups.push(fn),
  }
}
test('signed import deduplicates, decodes raster and restores bytes in a new workspace database', async (t) => {
  const f = await setup(t),
    { db, intake, imported, project, policy } = f
  assert.equal((await importOriginal(intake)).duplicate, true)
  assert.equal(f.record().rights, 'unknown')
  assert.equal(f.record().source.manifest.costMicros, 0)
  assert.equal(imported.technical.width, 128)
  const directory = path.join(project, 'export')
  await exportOriginal({ ...intake, eventId: imported.eventId, directory })
  const project2 = path.join(project, 'restored')
  fs.mkdirSync(project2)
  fs.writeFileSync(path.join(project2, 'vis.config.json'), '{}')
  const db2 = openLibraryDatabase(project2, loadConfig(project2))
  f.onCleanup(() => db2.close())
  const second = await importOriginal({
    db: db2,
    project: project2,
    policy,
    objectRoot: path.join(project2, 'store'),
    file: path.join(directory, 'original'),
    envelope: JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'))),
  })
  assert.equal(second.asset, imported.asset)
  assert.equal(sha256File(path.join(directory, 'original')), imported.sha256)
  assert.equal(reviewRecord(db2, second.asset).history.length, 0)
  assert.throws(() => bindReview(db, 'other'), /another workspace/)
  await assert.rejects(
    importOriginal({ ...intake, envelope: f.signed({ ...f.manifest, mime: 'image/jpeg' }) }),
    /MIME/,
  )
  await assert.rejects(
    importOriginal({ ...intake, envelope: f.signed({ ...f.manifest, sha256: '0'.repeat(64) }) }),
    /digest/,
  )
  await assert.rejects(
    importOriginal({
      ...intake,
      envelope: { ...intake.envelope, manifest: { ...f.manifest, sourceOwner: 'someone else' } },
    }),
    /signature/,
  )
})
test('existing corrupted master cannot be silently overwritten', async (t) => {
  const f = await setup(t),
    stored = path.join(f.objectRoot, f.imported.objectKey)
  fs.writeFileSync(stored, 'fixture corruption')
  await assert.rejects(
    createLocalStorage({ dir: f.objectRoot }).putMaster(f.imported.sha256, f.intake.file),
    /integrity/,
  )
  assert.equal(fs.readFileSync(stored, 'utf8'), 'fixture corruption')
})
test('decision rejects changed action, actor, destination, expiry, workspace, digest, version, stale revision and replay', async (t) => {
  const f = await setup(t),
    d = f.make('comment'),
    e = f.wrap(d)
  for (const change of [
    { action: 'delete' },
    { actor: 'human:unregistered' },
    { workspace: 'synthetic-b' },
    { destination: 'linkedin:other' },
    { note: 'changed' },
  ])
    assert.throws(() => applyDecision(f.db, f.policy, { ...e, decision: { ...d, ...change } }, f.asset))
  for (const change of [
    { expiresAt: Date.now() - 1 },
    { sha256: 'a'.repeat(64) },
    { version: 'old' },
    { revision: 19 },
    { actor: 'agent:fixture' },
  ])
    assert.throws(() => f.apply({ ...d, ...change }))
  assert.throws(() => applyDecision(f.db, f.policy, e, 'asset_other'), /Scope/)
  assert.equal(f.apply(d).revision, 1)
  assert.throws(() => f.apply(d), /consumed/)
  assert.throws(() => f.apply({ ...f.make('archive'), revision: 0 }), /Stale/)
  assert.equal(f.record().history.length, 1)
})
test('delete only quarantines; restore is distinct; revoked assets cannot be recovered as cleared', async (t) => {
  const f = await setup(t)
  assert.equal(f.apply(f.make('delete')).state, 'quarantined')
  assert.throws(() => f.apply(f.make('approve_identity')), /blocked/)
  assert.throws(() => f.apply(f.make('delete')), /Invalid lifecycle/)
  assert.equal(sha256File(path.join(f.objectRoot, f.imported.objectKey)), f.imported.sha256)
  assert.equal(f.apply(f.make('restore')).state, 'candidate')
  assert.equal(f.apply(f.make('archive')).state, 'archived')
  f.apply(f.make('restore'))
  f.apply(f.make('revoke_rights'))
  assert.throws(() => f.apply(f.make('restore')), /Nothing recoverable/)
  assert.throws(() => f.apply(f.make('purge')), /Unknown action/)
})
test('identity, canon, replacement and destination handoff require specific live clearance', async (t) => {
  const f = await setup(t)
  assert.throws(() => f.apply(f.make('authorize_publication')), /rights/)
  f.db.prepare("UPDATE asset SET rights_status='owned' WHERE asset_id=?").run(f.asset)
  assert.throws(() => f.apply(f.make('approve_canon')), /consent/)
  const clearance = {
    ...f.make('approve_use'),
    expiresAt: Date.now() + 100000,
    technicalStatus: 'passed',
    technicalRef: 'qa:fixture',
    actions: [
      'approve_use',
      'approve_canon',
      'approve_identity',
      'authorize_publication',
      'replace_canonical',
    ],
  }
  f.policy.clearances = [clearance]
  for (const a of ['approve_use', 'approve_canon', 'approve_identity'])
    assert.equal(f.apply(f.make(a)).action, a)
  const replacement = f.make('replace_canonical', { replaces: 'a'.repeat(64) })
  assert.throws(() => f.apply(replacement), /Prior canonical/)
  f.policy.canonicalHeads = { [f.destination]: replacement.replaces }
  assert.equal(f.apply(replacement).dispatched, false)
  assert.throws(() => f.apply(f.make('authorize_publication', { campaign: 'another' })), /consent/)
  const planned = f.apply(f.make('authorize_publication'))
  assert.equal(planned.dispatched, false)
  assert.equal(f.record().publications[0].status, 'planned')
  assert.equal(f.db.prepare('SELECT approval_status FROM asset').get().approval_status, 'candidate')
  const reporter = 'adapter:newsletter'
  f.policy.reporters = [
    {
      actor: reporter,
      publicKey: f.policy.reviewers[0].publicKey,
      destinations: [f.destination],
      origins: ['https://fixture.invalid'],
    },
  ]
  const r = {
    schema: 'vis.publication-receipt.v1',
    workspace: f.policy.workspace,
    decisionNonce: planned.nonce,
    destination: f.destination,
    campaign: 'edition-1',
    asset: f.asset,
    version: f.imported.version,
    sha256: f.imported.sha256,
    providerId: 'fixture-only',
    url: 'https://fixture.invalid/issue-1',
    publishedAt: Date.now(),
    reporter,
  }
  const observe = (receipt) =>
    observePublication(f.db, f.policy, {
      receipt,
      signature: sign(null, publicationReceiptBytes(receipt), f.key.privateKey).toString('base64url'),
    })
  assert.throws(() => observe({ ...r, campaign: 'other' }), /scope/)
  assert.equal(observe(r).duplicate, false)
  assert.equal(observe(r).duplicate, true)
  assert.equal(f.record().publications[0].status, 'published')
  clearance.expiresAt = 0
  assert.throws(() => f.apply(f.make('approve_use')), /consent/)
})
test('bound browser serves renditions and refuses legacy write routes and unsigned decisions', async (t) => {
  const f = await setup(t),
    { server, url } = await serveLibrary(f.project, { port: 0, reviewPolicy: f.policy })
  f.onCleanup(() => new Promise((resolve) => {
    server.closeAllConnections?.()
    server.close(() => resolve())
  }))
  assert.equal((await fetch(url + 'r/' + f.asset + '/preview')).status, 200)
  assert.equal((await fetch(url + 'api/asset/' + f.asset + '/rights', { method: 'POST' })).status, 404)
  const endpoint = url + 'api/review/asset/' + f.asset
  const headers = { 'x-vis-operator': '1', origin: new URL(url).origin, 'content-type': 'application/json' }
  assert.equal((await fetch(endpoint, { method: 'POST', headers, body: '{}' })).status, 403)
  const body = JSON.stringify(f.wrap(f.make('archive')))
  assert.equal(
    (
      await fetch(endpoint, {
        method: 'POST',
        headers: { ...headers, origin: 'https://other.example' },
        body,
      })
    ).status,
    403,
  )
  assert.equal((await fetch(endpoint, { method: 'POST', headers, body })).status, 200)
  assert.equal((await fetch(endpoint, { method: 'POST', headers, body })).status, 403)
  assert.throws(() => serveLibrary(f.project, { port: 0 }), /requires --review-policy/)
})
test('advisory evaluators cannot sign as the producer or promote a version', async (t) => {
  const f = await setup(t),
    { recordVisualEvaluation, evaluationBytes } = await import('../core/vis-review.mjs')
  const file = path.join(f.project, 'other.png')
  await sharp({ create: { width: 30, height: 20, channels: 3, background: '#643' } })
    .png()
    .toFile(file)
  const m = {
    ...f.manifest,
    title: 'Second plate',
    sha256: sha256File(file),
    bytes: fs.statSync(file).size,
    parent: f.asset,
  }
  const other = await importOriginal({ ...f.intake, file, envelope: f.signed(m) })
  const e = {
    schema: 'vis.visual-eval.v1',
    workspace: f.policy.workspace,
    asset: other.asset,
    version: other.version,
    sha256: other.sha256,
    referenceAsset: f.asset,
    referenceHash: f.imported.sha256,
    rubric: 'reading-v1',
    critic: 'critic:independent',
    score: 20,
    note: 'Inspect crop.',
    model: null,
    costMicros: null,
    currency: null,
  }
  const evaluate = (k) => {
    f.policy.critics = [
      {
        actor: e.critic,
        rubrics: [e.rubric],
        publicKey: k.publicKey.export({ format: 'pem', type: 'spki' }),
      },
    ]
    return recordVisualEvaluation(f.db, f.policy, {
      evaluation: e,
      signature: sign(null, evaluationBytes(e), k.privateKey).toString('base64url'),
    })
  }
  assert.throws(() => evaluate(f.key), /Independent/)
  assert.equal(evaluate(generateKeyPairSync('ed25519')).verdict, 'advisory')
  assert.equal(reviewRecord(f.db, other.asset).revision, 0)
  assert.equal(reviewRecord(f.db, other.asset).evaluations[0].score, 20)
})
