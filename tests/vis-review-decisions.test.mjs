import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createHash, randomUUID, sign } from 'node:crypto'
import { mkdtempSync, rmSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { openVisDatabase, recordPublication } from '../core/vis-core.mjs'
import { initializeReviewWorkspace, ingestReviewAsset } from '../core/vis-review-intake.mjs'
import {
  initializeReviewLedger,
  readReview,
  applyReviewDecision,
  listReviewQueue,
  exportReviewAudit,
  reviewActions
} from '../core/vis-review.mjs'
import { prepareReviewHandoff } from '../core/vis-review-handoff.mjs'

const placement = {
  channel: 'newsletter',
  campaign_id: 'launch',
  content_id: 'story',
  variant_id: 'hero',
  placement_id: 'cover'
}
const destination = Object.values(placement).join('/')
const epoch = () => Math.floor(Date.now() / 1000)

async function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'vis-gate-'))
  const db = openVisDatabase(root)
  t.after(() => {
    db.close()
    rmSync(root, { recursive: true, force: true })
  })
  const keys = {}
  const context = { tenant: 'fixture', reviewers: {} }
  for (const [id, kind, scopes] of [
    ['reviewer', 'human', reviewActions],
    ['critic', 'critic', ['critique']],
    ['maker', 'human', ['critique']]
  ]) {
    const pair = generateKeyPairSync('ed25519')
    keys[id] = pair.privateKey
    context.reviewers[id] = {
      actor: id,
      kind,
      scopes,
      publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' })
    }
  }
  initializeReviewWorkspace(db, context.tenant)
  initializeReviewLedger(db, context)
  async function ingest(color, parents = [], extra = {}) {
    const bytes = await sharp({ create: { width: 20, height: 12, channels: 3, background: color } })
      .png()
      .toBuffer()
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const manifest = {
      kind: 'diagram',
      source_uri: 'urn:fixture:' + sha256,
      source_version: '1',
      title: 'Sample',
      brand: 'fixture',
      maker: 'maker',
      sha256,
      mime_type: 'image/png',
      rights: 'unknown',
      consent: 'unknown',
      parents,
      ...extra
    }
    return ingestReviewAsset(db, {
      tenant: context.tenant,
      storageDir: root,
      manifest,
      bytes,
      actor: 'ingest'
    })
  }
  const asset = await ingest('teal')
  function envelope(action, extra = {}, record = asset, kid = 'reviewer') {
    const view = readReview(db, context, record.asset_id)
    const now = epoch()
    const claims = {
      audience: view.audience,
      protocol: 'vis.review/1',
      kid,
      actor: kid,
      tenant: context.tenant,
      asset_id: record.asset_id,
      version: record.version,
      ...(action === 'approve_asset' ? { identity_usage: 'none' } : {}),
      sha256: record.sha256,
      action,
      destination,
      comment: 'Fixture reviewer decision',
      nonce: randomUUID(),
      revision: view.revision,
      iat: now,
      exp: now + 300,
      ...extra
    }
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
    return {
      token: payload + '.' + sign(null, Buffer.from(payload), keys[kid]).toString('base64url'),
      action,
      destination: claims.destination,
      comment: claims.comment
    }
  }
  const apply = (body, record = asset) => applyReviewDecision(db, context, record.asset_id, body)
  function decide(action, extra = {}, record = asset, kid = 'reviewer') {
    return apply(envelope(action, extra, record, kid), record)
  }
  const clear = (record = asset) =>
    decide(
      'clear_rights',
      {
        rights: 'licensed',
        consent: 'not-required',
        evidence_ref: 'urn:fixture:licence',
        valid_until: epoch() + 900
      },
      record
    )
  const critique = (record = asset) => decide('critique', {}, record, 'critic')
  const scan = () =>
    decide('verify_scan', {
      scanner: 'test-only',
      evidence_ref: 'urn:fixture:scan',
      valid_until: epoch() + 300,
      scan_result: 'clean'
    })
  return { db, context, asset, ingest, apply, decide, envelope, clear, critique, scan }
}

test('envelope binds configured actor, tenant, exact version, action, destination, note and revision', async (t) => {
  const f = await fixture(t)
  for (const fields of [
    { audience: randomUUID() },
    { tenant: 'other' },
    { actor: 'other' },
    { asset_id: 'wrong' },
    { version: 'old' },
    { sha256: '0'.repeat(64) },
    { revision: 3 },
    { exp: epoch() - 1 },
    { iat: epoch() + 60 },
    { exp: epoch() + 1200 },
    { protocol: 'other' },
    { nonce: 'short' }
  ]) {
    assert.throws(() => f.apply(f.envelope('comment', fields)))
  }
  const signed = f.envelope('comment')
  for (const change of [
    { action: 'delete' },
    { destination: 'other' },
    { comment: 'different' },
    { token: signed.token.slice(2) }
  ]) {
    assert.throws(() => f.apply({ ...signed, ...change }))
  }
  assert.throws(() => f.apply(f.envelope('delete', {}, f.asset, 'critic')), /scope/)
  assert.throws(() => f.decide('critique', {}, f.asset, 'maker'), /independent/)
  assert.throws(() => listReviewQueue(f.db, { ...f.context, tenant: 'other' }), /binding/)
  assert.equal(f.apply(signed).revision, 1)
  assert.throws(() => f.apply(signed), /replay/)
})
test('deletion quarantines; archive, restore, replay and stale write are independent', async (t) => {
  const f = await fixture(t)
  const before = f.envelope('approve_asset')
  const deletion = f.envelope('delete')
  assert.equal(f.apply(deletion).status, 'quarantined')
  assert.throws(() => f.apply(before), /stale/)
  assert.throws(() => f.decide('approve_asset'), /hold/)
  assert.throws(() => f.apply(deletion), /replay/)
  assert.equal(f.decide('recover').status, 'candidate')
  assert.equal(f.decide('archive').status, 'archived')
  assert.equal(f.decide('recover').status, 'candidate')
  assert.throws(() => f.decide('recover'), /already active/)
  assert.throws(() => f.db.exec('DELETE FROM vis_review_event'), /immutable/)
  assert.throws(() => f.db.exec("UPDATE vis_review_event SET action='publish'"), /immutable/)
  assert.equal(readReview(f.db, f.context, f.asset.asset_id).sha256, f.asset.sha256)
})
test('human action, independent critique, rights and current scan gate scoped campaign drafts and receipts', async (t) => {
  const f = await fixture(t)
  assert.throws(() => f.decide('approve_asset'), /clearance/)
  f.clear()
  assert.throws(() => f.decide('approve_asset'), /critique/)
  f.critique()
  assert.throws(() => f.decide('publish'), /asset-use/)
  f.decide('approve_asset')
  assert.throws(() => f.decide('publish'), /scan/)
  f.scan()
  f.decide('publish')
  const draft = prepareReviewHandoff(f.db, f.context, f.asset.asset_id, placement)
  assert.equal(draft.mode, 'draft')
  assert.equal(draft.provider_receipt, null)
  for (const channel of ['website', 'linkedin', 'interactive', 'slides', 'editorial']) {
    assert.throws(
      () => prepareReviewHandoff(f.db, f.context, f.asset.asset_id, { ...placement, channel }),
      /authorization/
    )
  }
  f.decide('revoke_rights')
  assert.throws(() => prepareReviewHandoff(f.db, f.context, f.asset.asset_id, placement), /authorization/)
  const receipt = {
    provider: 'synthetic',
    receipt_ref: 'urn:test:receipt',
    occurred_at: epoch(),
    authorization_nonce: draft.authorization_nonce
  }
  f.decide('publication_receipt', receipt)
  assert.throws(() => f.decide('publication_receipt', receipt), /unique/)
  assert.throws(() => f.decide('approve_identity'), /clearance/)
})
test('replacement binds both versions and records a proposal without changing the canonical asset', async (t) => {
  const f = await fixture(t)
  const previous = await f.ingest('navy')
  f.clear()
  f.critique()
  f.decide('approve_asset')
  assert.throws(() => f.decide('approve_identity'), /subject/)
  f.context.authorities = {
    mark: {
      kind: 'identity',
      brand: 'fixture',
      source: 'urn:registry:mark',
      revision: 'r4',
      asset_id: previous.asset_id,
      version: previous.version,
      sha256: previous.sha256
    }
  }
  const binding = {
    subject: 'mark',
    authority_source: 'urn:registry:mark',
    authority_revision: 'r4',
    reference_asset_id: previous.asset_id,
    reference_version: previous.version,
    reference_sha256: previous.sha256
  }
  assert.throws(() => f.decide('approve_canon', binding), /mismatch/)
  assert.throws(() => f.decide('approve_identity', { ...binding, authority_revision: 'r3' }), /mismatch/)
  f.decide('approve_asset', { identity_usage: 'brand_mark', subject: 'mark' })
  f.scan()
  assert.throws(() => f.decide('publish'), /identity reference/)
  f.decide('approve_identity', binding)
  f.decide('publish')
  f.context.authorities.mark.revision = 'r5'
  assert.throws(
    () => prepareReviewHandoff(f.db, f.context, f.asset.asset_id, placement),
    /authority reference/
  )
  f.context.authorities.mark.revision = 'r4'
  assert.throws(
    () =>
      f.decide('replace_canonical', {
        ...binding,
        previous_asset_id: previous.asset_id,
        previous_version: previous.version,
        previous_sha256: 'bad'
      }),
    /target/
  )
  f.decide('replace_canonical', {
    ...binding,
    previous_asset_id: previous.asset_id,
    previous_version: previous.version,
    previous_sha256: previous.sha256
  })
  assert.equal(readReview(f.db, f.context, previous.asset_id).revision, 0)
})
test('parent holds and consent denial block derivative use, held original remains recoverable', async (t) => {
  const f = await fixture(t)
  const p = { asset_id: f.asset.asset_id, version: f.asset.version, sha256: f.asset.sha256 }
  const child = await f.ingest('orchid', [p])
  f.clear(child)
  f.critique(child)
  assert.throws(() => f.decide('approve_asset', {}, child), /clearance/)
  f.clear()
  f.decide('approve_asset', {}, child)
  f.decide('delete')
  assert.throws(() => f.decide('approve_canon', {}, child), /parent on hold/)
  const blocked = await f.ingest('red', [], { consent: 'denied' })
  assert.throws(() => f.clear(blocked), /hold/)
  const expired = await f.ingest('gold', [], { rights_expires_at: '2020-01-01T00:00:00Z' })
  assert.throws(() => f.clear(expired), /expired/)
})

test('loss of original custody still permits a signed hold which survives original recovery', async (t) => {
  const f = await fixture(t)
  f.clear()
  f.critique()
  f.decide('approve_asset')
  f.scan()
  f.decide('publish')
  const file = f.db
    .prepare('SELECT absolute_path FROM library_file_state WHERE asset_id=?')
    .get(f.asset.asset_id).absolute_path
  renameSync(file, file + '.offline')
  assert.equal(readReview(f.db, f.context, f.asset.asset_id).custody, 'unavailable')
  assert.throws(() => prepareReviewHandoff(f.db, f.context, f.asset.asset_id, placement))
  assert.equal(f.decide('revoke_rights').effective_rights, 'revoked')
  renameSync(file + '.offline', file)
  assert.equal(readReview(f.db, f.context, f.asset.asset_id).custody, 'verified')
  assert.throws(() => prepareReviewHandoff(f.db, f.context, f.asset.asset_id, placement), /authorization/)
})

test('six editorial surfaces prepare only their separately authorized draft rendition', async (t) => {
  const f = await fixture(t)
  for (const channel of ['editorial', 'newsletter', 'linkedin', 'website', 'slides', 'interactive']) {
    const spec = { ...placement, channel }
    const destination = Object.values(spec).join('/')
    f.decide('clear_rights', {
      destination,
      rights: 'owned',
      consent: 'not-required',
      evidence_ref: 'urn:test:rights',
      valid_until: epoch() + 1200
    })
    f.decide('critique', { destination }, f.asset, 'critic')
    f.decide('approve_asset', { destination })
    f.scan()
    f.decide('publish', { destination })
    const draft = prepareReviewHandoff(f.db, f.context, f.asset.asset_id, spec)
    assert.equal(draft.destination, destination)
    assert.equal(draft.sha256, f.asset.sha256)
    assert.equal(draft.provider_receipt, null)
  }
})

test('audit distinguishes refused instructions, input costs and signed events; unsigned legacy publication is refused', async t => {
  const f = await fixture(t)
  assert.throws(() => f.apply({action:'publish',token:'invalid'}))
  const comment = f.envelope('comment')
  f.apply(comment)
  assert.throws(() => f.apply(comment), /replay/)
  const audit = exportReviewAudit(f.db, f.context)
  assert.equal(audit.decisions.length, 1)
  assert.equal(audit.decisions[0].signed_token, comment.token)
  assert.equal(audit.denials.length, 2)
  assert.equal(audit.denials[0].observed_actor, null)
  assert.equal(audit.inputs[0].input.execution.cost_micros, null)
  assert.throws(() => recordPublication(f.db, {assetId:f.asset.asset_id,execute:true}), /signed VIS/)
})
