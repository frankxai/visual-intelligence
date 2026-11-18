import { manifestBytes } from './vis-intake-contract.mjs'
/** Local review receipts extend an existing, single-customer VIS database. */
import { createPublicKey, createHash, randomUUID, verify } from 'node:crypto'
import { recordProvenance, recordPublication } from './vis-core.mjs'

export const REVIEW_ACTIONS = [
  'comment',
  'approve_use',
  'approve_identity',
  'approve_canon',
  'authorize_publication',
  'replace_canonical',
  'archive',
  'delete',
  'restore',
  'revoke_rights',
]
const nonemptyRef = (v) => typeof v === 'string' && v.trim().length > 0
const permittedRights = new Set(['owned', 'generated-owned', 'licensed'])
const useActions = new Set([
  'approve_use',
  'approve_identity',
  'approve_canon',
  'authorize_publication',
  'replace_canonical',
])
const nextState = {
  archive: 'archived',
  delete: 'quarantined',
  restore: 'candidate',
  revoke_rights: 'restricted',
}
const fields = [
  'schema',
  'workspace',
  'actor',
  'action',
  'asset',
  'version',
  'sha256',
  'revision',
  'destination',
  'campaign',
  'consentRef',
  'rightsRef',
  'replaces',
  'note',
  'issuedAt',
  'expiresAt',
  'nonce',
]

export function inventoryDigest(db) {
  const versions = db
    .prepare('SELECT asset_id,version_id,sha256 FROM asset_version ORDER BY asset_id,version_id,sha256')
    .all()
  return createHash('sha256').update(JSON.stringify(versions)).digest('hex')
}

export function bindReview(db, workspace, enrollmentDigest) {
  if (typeof workspace !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(workspace))
    throw Error('Workspace required')
  const bound = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='review_workspace'").get()
  if (!bound && db.prepare('SELECT 1 FROM asset LIMIT 1').get() && enrollmentDigest !== inventoryDigest(db))
    throw Error('Existing catalog requires explicit inventory digest for enrollment')
  db.exec(`CREATE TABLE IF NOT EXISTS review_workspace (singleton INTEGER PRIMARY KEY CHECK(singleton=1), workspace TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS review_receipt (
      nonce TEXT PRIMARY KEY, asset TEXT NOT NULL REFERENCES asset(asset_id), version TEXT NOT NULL REFERENCES asset_version(version_id),
      revision INTEGER NOT NULL, state TEXT NOT NULL, decision TEXT NOT NULL, signature TEXT NOT NULL, recorded_at INTEGER NOT NULL,
      UNIQUE(asset, revision));
    CREATE TABLE IF NOT EXISTS review_denial (
      id INTEGER PRIMARY KEY, target TEXT NOT NULL, evidence_sha256 TEXT NOT NULL, reason TEXT NOT NULL, recorded_at INTEGER NOT NULL);
    CREATE TRIGGER IF NOT EXISTS review_receipt_no_update BEFORE UPDATE ON review_receipt BEGIN SELECT RAISE(ABORT,'immutable review receipt'); END;
    CREATE TRIGGER IF NOT EXISTS review_receipt_no_delete BEFORE DELETE ON review_receipt BEGIN SELECT RAISE(ABORT,'immutable review receipt'); END;`)
  db.prepare('INSERT OR IGNORE INTO review_workspace VALUES(1,?)').run(workspace)
  if (db.prepare('SELECT workspace FROM review_workspace').get().workspace !== workspace)
    throw Error('Database belongs to another workspace')
}

export function reviewRecord(db, asset) {
  const version = db
    .prepare(
      `SELECT a.asset_id AS asset, a.title, a.rights_status AS rights, v.version_id AS version,
    v.sha256,v.width,v.height,v.mime_type AS mime,v.byte_size AS bytes FROM asset a JOIN asset_version v
    ON a.asset_id=v.asset_id AND a.source_hash=v.sha256 WHERE a.asset_id=? ORDER BY v.created_at DESC, v.version_id LIMIT 1`,
    )
    .get(asset)
  if (!version) throw Error('Current version unavailable')
  const history = db
    .prepare(
      'SELECT revision,state,decision,signature,recorded_at FROM review_receipt WHERE asset=? ORDER BY revision DESC',
    )
    .all(asset)
    .map((row) => ({ ...row, decision: JSON.parse(row.decision) }))
  const lineage = db
    .prepare(
      'SELECT source_asset_id AS parent,derived_asset_id AS child FROM asset_derivative WHERE source_asset_id=? OR derived_asset_id=?',
    )
    .all(asset, asset)
  const placements = db
    .prepare('SELECT site,url,status,commit_sha FROM asset_placement WHERE sha256=? ORDER BY site,url')
    .all(version.sha256)
  const publications = db
    .prepare(
      'SELECT platform,url,route,campaign,status,publication_id FROM publication WHERE asset_id=? AND version_id=? ORDER BY created_at DESC',
    )
    .all(asset, version.version)
  const intake = db
    .prepare(
      "SELECT payload_json FROM provenance_event WHERE asset_id=? AND version_id=? AND event_type='verified-original-intake' ORDER BY created_at DESC LIMIT 1",
    )
    .get(asset, version.version)
  const source = intake ? JSON.parse(intake.payload_json) : null
  const evaluations = db
    .prepare(
      "SELECT evaluator,score,rubric,notes FROM eval_record WHERE asset_id=? AND verdict='advisory' AND json_extract(metadata_json,'$.evaluation.version')=? ORDER BY created_at DESC",
    )
    .all(asset, version.version)
  return {
    ...version,
    evaluations,
    publications,
    source: source
      ? {
          manifest: source.envelope.manifest,
          technical: source.technical,
          objectKey: source.objectKey,
          malware: source.malware,
        }
      : null,
    revision: history[0]?.revision ?? 0,
    state: history[0]?.state ?? 'candidate',
    history,
    lineage,
    placements,
  }
}

export function decisionBytes(d) {
  if (!d || Object.keys(d).length !== fields.length || !fields.every((f) => Object.hasOwn(d, f)))
    throw Error('Invalid signed fields')
  return Buffer.from(JSON.stringify(fields.map((f) => d[f])), 'utf8')
}

export function decisionTemplate(record, workspace, action, actor, now = Date.now()) {
  if (!REVIEW_ACTIONS.includes(action)) throw Error('Unknown action')
  return {
    schema: 'vis.review.v1',
    workspace,
    actor,
    action,
    asset: record.asset,
    version: record.version,
    sha256: record.sha256,
    revision: record.revision,
    destination: '',
    campaign: '',
    consentRef: '',
    rightsRef: '',
    replaces: '',
    note: '',
    issuedAt: now,
    expiresAt: now + 300000,
    nonce: randomUUID(),
  }
}

/** The registry is injected by the operator. The browser never issues approvals or supplies keys. */
export function applyDecision(db, policy, envelope, target, now = Date.now()) {
  try {
    return commitDecision(db, policy, envelope, target, now)
  } catch (error) {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(envelope) ?? 'null')
      .digest('hex')
    db.prepare('INSERT INTO review_denial(target,evidence_sha256,reason,recorded_at) VALUES(?,?,?,?)').run(
      String(target).slice(0, 160),
      fingerprint,
      error.message.slice(0, 200),
      now,
    )
    throw error
  }
}
function commitDecision(db, policy, envelope, target, now) {
  const d = envelope?.decision
  const bytes = decisionBytes(d)
  if (
    d.schema !== 'vis.review.v1' ||
    d.workspace !== policy.workspace ||
    d.asset !== target ||
    !Number.isSafeInteger(d.revision) ||
    d.revision < 0 ||
    !REVIEW_ACTIONS.includes(d.action)
  )
    throw Error('Scope mismatch')
  for (const f of fields.filter((f) => !['issuedAt', 'expiresAt', 'revision'].includes(f))) {
    if (typeof d[f] !== 'string' || d[f].length > 2000 || /[\u0000-\u001f]/.test(d[f]))
      throw Error('Invalid decision value')
  }
  if (
    !/^human:[A-Za-z0-9_.-]+$/.test(d.actor) ||
    !/^[0-9a-f-]{36}$/i.test(d.nonce) ||
    !Number.isSafeInteger(d.issuedAt) ||
    !Number.isSafeInteger(d.expiresAt) ||
    d.issuedAt > now ||
    d.expiresAt <= now ||
    d.expiresAt - d.issuedAt > 300000
  )
    throw Error('Invalid actor or validity interval')
  const authority = policy.reviewers?.find((r) => r.actor === d.actor && r.actions.includes(d.action))
  if (!authority || !authority.destinations.includes(d.destination) || !authority.publicKey)
    throw Error('Reviewer lacks this scope')
  const key = createPublicKey(authority.publicKey)
  if (
    key.asymmetricKeyType !== 'ed25519' ||
    typeof envelope.signature !== 'string' ||
    !verify(null, bytes, key, Buffer.from(envelope.signature, 'base64url'))
  )
    throw Error('Invalid decision signature')
  if (!d.note.trim() || !d.destination.trim()) throw Error('Reason and destination required')
  db.exec('BEGIN IMMEDIATE')
  try {
    const workspace = db.prepare('SELECT workspace FROM review_workspace').get()?.workspace
    if (workspace !== d.workspace) throw Error('Workspace mismatch')
    if (db.prepare('SELECT 1 FROM review_receipt WHERE nonce=?').get(d.nonce))
      throw Error('Decision already consumed')
    const current = reviewRecord(db, d.asset)
    if (current.version !== d.version || current.sha256 !== d.sha256 || current.revision !== d.revision)
      throw Error('Stale decision')
    if (useActions.has(d.action)) {
      if (current.state !== 'candidate' || !permittedRights.has(current.rights))
        throw Error('Use blocked by lifecycle or rights')
      const clearance = policy.clearances?.find(
        (c) =>
          c.sha256 === d.sha256 &&
          c.version === d.version &&
          c.asset === d.asset &&
          c.destination === d.destination &&
          c.campaign === d.campaign &&
          c.actions.includes(d.action) &&
          c.technicalStatus === 'passed' &&
          nonemptyRef(c.technicalRef) &&
          c.consentRef === d.consentRef &&
          c.rightsRef === d.rightsRef &&
          c.expiresAt > now,
      )
      if (!clearance || !d.consentRef.trim() || !d.rightsRef.trim())
        throw Error('Current rights and consent evidence required')
      if (d.action === 'authorize_publication' && !d.campaign.trim()) throw Error('Campaign required')
      if (
        d.action === 'replace_canonical' &&
        (!/^[0-9a-f]{64}$/.test(d.replaces) ||
          d.replaces === d.sha256 ||
          policy.canonicalHeads?.[d.destination] !== d.replaces)
      )
        throw Error('Prior canonical digest mismatch')
    }
    if (d.action === 'restore' && !['quarantined', 'archived'].includes(current.state))
      throw Error('Nothing recoverable')
    if (
      (d.action === 'archive' && current.state !== 'candidate') ||
      (d.action === 'delete' && !['candidate', 'archived'].includes(current.state))
    )
      throw Error('Invalid lifecycle transition')
    const state = nextState[d.action] ?? current.state
    db.prepare('INSERT INTO review_receipt VALUES(?,?,?,?,?,?,?,?)').run(
      d.nonce,
      d.asset,
      d.version,
      d.revision + 1,
      state,
      JSON.stringify(d),
      envelope.signature,
      now,
    )
    if (d.action === 'authorize_publication') {
      const channel = policy.channels?.find((ch) => ch.destination === d.destination)
      if (
        !channel ||
        !['editorial', 'newsletter', 'linkedin', 'website', 'slides', 'interactive'].includes(
          channel.platform,
        )
      )
        throw Error('Destination adapter unconfigured')
      recordPublication(db, {
        assetId: d.asset,
        versionId: d.version,
        publicationId: 'review_' + d.nonce,
        platform: channel.platform,
        route: d.destination,
        campaign: d.campaign,
        status: 'planned',
        actor: d.actor,
        execute: true,
      })
    }
    recordProvenance(db, {
      assetId: d.asset,
      versionId: d.version,
      eventType: 'scoped-review',
      actor: d.actor,
      source: 'vis.review.v1',
      eventId: d.nonce,
      payload: {
        action: d.action,
        destination: d.destination,
        revision: d.revision + 1,
        state,
        campaign: d.campaign,
      },
    })
    db.exec('COMMIT')
    return { nonce: d.nonce, revision: d.revision + 1, state, action: d.action, dispatched: false }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// Accepts an observed provider receipt from a destination-specific attester. Never dispatches content.
export function publicationReceiptBytes(r) {
  const keys = [
    'schema',
    'workspace',
    'decisionNonce',
    'destination',
    'campaign',
    'asset',
    'version',
    'sha256',
    'providerId',
    'url',
    'publishedAt',
    'reporter',
  ]
  if (!r || Object.keys(r).length !== keys.length || !keys.every((k) => Object.hasOwn(r, k)))
    throw Error('Invalid receipt fields')
  return Buffer.from(JSON.stringify(keys.map((k) => r[k])))
}

export function observePublication(db, policy, { receipt: r, signature }, now = Date.now()) {
  const bytes = publicationReceiptBytes(r)
  const reporter = policy.reporters?.find(
    (k) => k.actor === r.reporter && k.destinations.includes(r.destination),
  )
  const key = reporter && createPublicKey(reporter.publicKey)
  if (
    r.schema !== 'vis.publication-receipt.v1' ||
    r.workspace !== policy.workspace ||
    !key ||
    key.asymmetricKeyType !== 'ed25519' ||
    !verify(null, bytes, key, Buffer.from(signature, 'base64url'))
  )
    throw Error('Receipt authority denied')
  const link = new URL(r.url)
  if (
    link.protocol !== 'https:' ||
    link.username ||
    link.password ||
    !reporter.origins.includes(link.origin) ||
    !nonemptyRef(r.providerId) ||
    r.providerId.length > 200 ||
    !Number.isSafeInteger(r.publishedAt) ||
    r.publishedAt > now
  )
    throw Error('Invalid provider evidence')
  db.exec('BEGIN IMMEDIATE')
  try {
    const row = db.prepare('SELECT * FROM review_receipt WHERE nonce=?').get(r.decisionNonce)
    const d = row && JSON.parse(row.decision)
    if (
      !d ||
      d.action !== 'authorize_publication' ||
      ['workspace', 'asset', 'version', 'sha256', 'campaign', 'destination'].some((k) => d[k] !== r[k]) ||
      r.publishedAt < row.recorded_at ||
      r.publishedAt >= d.expiresAt
    )
      throw Error('Receipt scope mismatch')
    const eventId = 'provider_' + JSON.stringify([r.workspace, r.destination, r.providerId])
    const prior = db
      .prepare('SELECT payload_json FROM provenance_event WHERE provenance_event_id=?')
      .get(eventId)
    if (prior) {
      if (!publicationReceiptBytes(JSON.parse(prior.payload_json).receipt).equals(bytes))
        throw Error('Receipt collision')
      db.exec('COMMIT')
      return { observed: true, duplicate: true }
    }
    // Late or disputed events need reconciliation by an operator.
    if (reviewRecord(db, r.asset).revision !== row.revision) throw Error('Review changed since authorization')
    const updated = db
      .prepare(
        "UPDATE publication SET status='published',url=?,published_at=? WHERE publication_id=? AND status='planned'",
      )
      .run(r.url, new Date(r.publishedAt).toISOString(), 'review_' + r.decisionNonce)
    if (updated.changes !== 1) throw Error('No pending placement')
    recordProvenance(db, {
      eventId,
      assetId: r.asset,
      versionId: r.version,
      eventType: 'provider-publication-observed',
      actor: r.reporter,
      source: r.destination,
      payload: { receipt: r, signature },
    })
    db.exec('COMMIT')
    return { observed: true, duplicate: false }
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function evaluationBytes(e) {
  const keys = [
    'schema',
    'workspace',
    'asset',
    'version',
    'sha256',
    'referenceAsset',
    'referenceHash',
    'rubric',
    'critic',
    'score',
    'note',
    'model',
    'costMicros',
    'currency',
  ]
  if (!e || Object.keys(e).length !== keys.length || !keys.every((k) => Object.hasOwn(e, k)))
    throw Error('Invalid evaluation fields')
  return Buffer.from(JSON.stringify(keys.map((k) => e[k])))
}
export function recordVisualEvaluation(db, policy, { evaluation: e, signature }) {
  const bytes = evaluationBytes(e)
  const critic = policy.critics?.find((c) => c.actor === e.critic && c.rubrics.includes(e.rubric))
  const key = critic && createPublicKey(critic.publicKey)
  if (
    !key ||
    key.asymmetricKeyType !== 'ed25519' ||
    !verify(null, bytes, key, Buffer.from(signature, 'base64url')) ||
    e.schema !== 'vis.visual-eval.v1' ||
    policy.workspace !== e.workspace ||
    db.prepare('SELECT workspace FROM review_workspace').get()?.workspace !== e.workspace
  )
    throw Error('Critic scope denied')
  const record = reviewRecord(db, e.asset),
    ref = reviewRecord(db, e.referenceAsset)
  const intake = db
    .prepare(
      "SELECT payload_json FROM provenance_event WHERE asset_id=? AND event_type='verified-original-intake'",
    )
    .all(e.asset)
  const sameProducer = intake.some((row) => {
    const source = JSON.parse(row.payload_json).envelope
    return (
      source.manifest.actor === e.critic ||
      verify(null, manifestBytes(source.manifest), key, Buffer.from(source.signature, 'base64url'))
    )
  })
  const ingesters = policy.ingesters ?? []
  if (
    !record.source ||
    sameProducer ||
    ingesters.some((p) => p.publicKey === critic.publicKey || p.actor === e.critic) ||
    e.asset === ref.asset ||
    e.sha256 !== record.sha256 ||
    e.version !== record.version ||
    ref.sha256 !== e.referenceHash ||
    !Number.isInteger(e.score) ||
    e.score < 0 ||
    e.score > 30 ||
    !nonemptyRef(e.note) ||
    e.note.length > 4000 ||
    !(e.model === null || nonemptyRef(e.model)) ||
    !(e.costMicros === null
      ? e.currency === null
      : Number.isSafeInteger(e.costMicros) && e.costMicros >= 0 && /^[A-Z]{3}$/.test(e.currency))
  )
    throw Error('Independent, version-bound evaluation required')
  const id = 'eval_' + createHash('sha256').update(bytes).digest('hex')
  db.prepare('INSERT OR IGNORE INTO eval_record VALUES(?,?,?,?,?,?,?,?,?)').run(
    id,
    e.asset,
    e.critic,
    e.score,
    e.rubric,
    'advisory',
    e.note,
    JSON.stringify({ evaluation: e, signature }),
    new Date().toISOString(),
  )
  return { id, verdict: 'advisory' }
}
