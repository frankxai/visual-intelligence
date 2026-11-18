// A decision is a signed instruction for one enrolled VIS version. This module
// owns no master files, identity registry, delivery adapter or publishing key.
import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { assertReviewWorkspace, getReviewIntake, getReviewIntakeMetadata } from './vis-review-intake.mjs'

export const reviewActions = [
  'comment',
  'critique',
  'verify_scan',
  'clear_rights',
  'revoke_rights',
  'approve_asset',
  'approve_identity',
  'approve_canon',
  'replace_canonical',
  'publish',
  'publication_receipt',
  'archive',
  'delete',
  'recover'
]
const approvalActions = new Set([
  'approve_asset',
  'approve_identity',
  'approve_canon',
  'replace_canonical',
  'publish'
])
const resets = new Set(['archive', 'delete', 'recover', 'revoke_rights'])
const lifecycle = { archive: 'archived', delete: 'quarantined', recover: 'candidate' }
const safeKey = /^[a-zA-Z0-9_-]{1,128}$/
const bounded = (s, n) =>
  typeof s === 'string' && s.length > 0 && s.length <= n && !/[\u0000-\u001f]/.test(s)
function requireValue(condition, reason) {
  if (!condition) throw new Error(reason)
}

export function loadReviewContext(file) {
  if (!file) return null
  const config = JSON.parse(readFileSync(file, 'utf8'))
  requireValue(
    bounded(config.tenant, 160) && config.reviewers && typeof config.reviewers === 'object',
    'invalid review configuration'
  )
  return config
}

export function assertReviewTenant(db, context) {
  requireValue(context && bounded(context.tenant, 160), 'tenant configuration required')
  assertReviewWorkspace(db, context.tenant)
}

export function initializeReviewLedger(db, context) {
  assertReviewTenant(db, context)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vis_review_instance (singleton INTEGER PRIMARY KEY CHECK(singleton=1), audience TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS vis_review_event (
      seq INTEGER PRIMARY KEY, tenant TEXT NOT NULL REFERENCES vis_review_workspace(tenant),
      asset_id TEXT NOT NULL REFERENCES vis_review_intake(asset_id),
      version TEXT NOT NULL REFERENCES asset_version(version_id), sha256 TEXT NOT NULL,
      revision INTEGER NOT NULL, action TEXT NOT NULL, destination TEXT NOT NULL,
      actor TEXT NOT NULL, nonce TEXT NOT NULL, at TEXT NOT NULL,
      claims_json TEXT NOT NULL, signed_token TEXT NOT NULL,
      UNIQUE(tenant, nonce), UNIQUE(tenant,asset_id,version,revision)
    );
    CREATE TABLE IF NOT EXISTS vis_review_denial (
      seq INTEGER PRIMARY KEY, tenant TEXT NOT NULL REFERENCES vis_review_workspace(tenant),
      at TEXT NOT NULL, request_digest TEXT NOT NULL, observed_actor TEXT, reason TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS vis_review_denial_no_update BEFORE UPDATE ON vis_review_denial
      BEGIN SELECT RAISE(ABORT,'immutable denial'); END;
    CREATE TRIGGER IF NOT EXISTS vis_review_denial_no_delete BEFORE DELETE ON vis_review_denial
      BEGIN SELECT RAISE(ABORT,'immutable denial'); END;
    CREATE INDEX IF NOT EXISTS vis_review_action ON vis_review_event(tenant,asset_id,version,seq);
    CREATE TRIGGER IF NOT EXISTS vis_review_no_update BEFORE UPDATE ON vis_review_event
      BEGIN SELECT RAISE(ABORT,'immutable decision'); END;
    CREATE TRIGGER IF NOT EXISTS vis_review_no_delete BEFORE DELETE ON vis_review_event
      BEGIN SELECT RAISE(ABORT,'immutable decision'); END;
  `)
  db.prepare('INSERT OR IGNORE INTO vis_review_instance VALUES(1,?)').run(randomUUID())
}

function audience(db) {
  return db.prepare('SELECT audience FROM vis_review_instance WHERE singleton=1').get().audience
}

function currentVersion(db, context, assetId, requireBytes = true) {
  const resolve = requireBytes ? getReviewIntake : getReviewIntakeMetadata
  const record = resolve(db, context.tenant, assetId)
  const live = db
    .prepare(
      'SELECT a.source_hash,v.sha256 FROM asset a JOIN asset_version v USING(asset_id) WHERE a.asset_id=? AND v.version_id=?'
    )
    .get(assetId, record?.version ?? '')
  requireValue(
    record && live?.sha256 === record.sha256 && live.source_hash === record.sha256,
    'enrolled current version required'
  )
  return record
}

function history(db, context, record) {
  return db
    .prepare(
      'SELECT action,actor,at,claims_json FROM vis_review_event WHERE tenant=? AND asset_id=? AND version=? ORDER BY seq'
    )
    .all(context.tenant, record.asset_id, record.version)
    .map((row) => ({ ...JSON.parse(row.claims_json), at: row.at }))
}

function statusOf(events) {
  const last = events.findLast((e) => Object.hasOwn(lifecycle, e.action))
  return last ? lifecycle[last.action] : 'candidate'
}

export function readReview(db, context, assetId) {
  assertReviewTenant(db, context)
  const record = currentVersion(db, context, assetId, false)
  let custody = 'verified'
  try {
    getReviewIntake(db, context.tenant, assetId)
  } catch {
    custody = 'unavailable'
  }
  const events = history(db, context, record)
  const now = Math.floor(Date.now() / 1000)
  let effective = 'uncleared'
  if (activeEvents(events).some((e) => e.action === 'clear_rights' && e.valid_until > now))
    effective = 'review_scoped_grants'
  else if (
    events.findLast((e) => ['revoke_rights', 'clear_rights'].includes(e.action))?.action === 'revoke_rights'
  )
    effective = 'revoked'
  if (record.rights_expires_at && Date.parse(record.rights_expires_at) <= now * 1000) effective = 'expired'
  if (record.rights === 'blocked' || record.consent === 'denied') effective = 'blocked'
  // Source paths, private prompts/signed decisions, storage keys and opaque
  // provenance payloads never travel to the local review client.
  return {
    audience: audience(db),
    asset_id: assetId,
    version: record.version,
    sha256: record.sha256,
    custody,
    effective_rights: effective,
    rights_expires_at: record.rights_expires_at,
    rights: record.rights,
    consent: record.consent,
    technical_pass: record.technical_pass,
    maker: record.maker,
    parents: record.parents,
    status: statusOf(events),
    revision: events.length,
    events: events.map(({ action, actor, at, destination, comment, valid_until }) => ({
      action,
      actor,
      at,
      destination,
      comment,
      valid_until
    }))
  }
}

export function listReviewQueue(db, context, { limit = 100, offset = 0 } = {}) {
  assertReviewTenant(db, context)
  const count = Number(limit),
    start = Number(offset)
  requireValue(
    Number.isSafeInteger(count) && count > 0 && count <= 1000 && Number.isSafeInteger(start) && start >= 0,
    'invalid page'
  )
  const assets = db
    .prepare(
      `SELECT a.asset_id,a.title,i.sha256,i.version,a.rights_status AS rights,
    COALESCE((SELECT CASE e.action WHEN 'delete' THEN 'quarantined' WHEN 'archive' THEN 'archived' ELSE 'candidate' END
    FROM vis_review_event e WHERE e.tenant=? AND e.asset_id=i.asset_id AND e.version=i.version
    AND e.action IN ('archive','delete','recover') ORDER BY seq DESC LIMIT 1),'candidate') AS status
    FROM vis_review_intake i JOIN asset a USING(asset_id) WHERE a.source_hash=i.sha256 ORDER BY i.created_at DESC,a.asset_id LIMIT ? OFFSET ?`
    )
    .all(context.tenant, count, start)
  const total = db
    .prepare(
      'SELECT count(*) AS n FROM vis_review_intake i JOIN asset a USING(asset_id) WHERE a.source_hash=i.sha256'
    )
    .get().n
  return { assets, total }
}

function authenticate(context, body, assetId, now) {
  requireValue(typeof body?.token === 'string' && body.token.length <= 16384, 'decision required')
  const parts = body.token.split('.')
  requireValue(
    parts.length === 2 && parts.every((s) => /^[A-Za-z0-9_-]+$/.test(s)),
    'invalid decision encoding'
  )
  const [payload, signature] = parts
  const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  requireValue(
    c && safeKey.test(c.kid) && Object.hasOwn(context.reviewers ?? {}, c.kid),
    'unknown reviewer'
  )
  const reviewer = context.reviewers[c.kid]
  const key = createPublicKey(reviewer.publicKey)
  requireValue(
    key.asymmetricKeyType === 'ed25519' &&
      verify(null, Buffer.from(payload), key, Buffer.from(signature, 'base64url')),
    'invalid signature'
  )
  requireValue(
    c.protocol === 'vis.review/1' &&
      c.actor === reviewer.actor &&
      bounded(c.actor, 160) &&
      c.tenant === context.tenant &&
      c.asset_id === assetId,
    'decision binding mismatch'
  )
  requireValue(
    reviewActions.includes(c.action) &&
      c.action === body.action &&
      Array.isArray(reviewer.scopes) &&
      reviewer.scopes.includes(c.action),
    'action outside scope'
  )
  requireValue(
    reviewer.kind === 'human' || (reviewer.kind === 'critic' && c.action === 'critique'),
    'human reviewer required'
  )
  requireValue(typeof c.nonce === 'string' && /^[a-z0-9_-]{20,100}$/i.test(c.nonce), 'invalid nonce')
  requireValue(
    Number.isSafeInteger(c.iat) &&
      Number.isSafeInteger(c.exp) &&
      c.iat <= now &&
      now < c.exp &&
      c.exp - c.iat <= 600,
    'decision expired or outside time window'
  )
  requireValue(
    c.destination === (body.destination ?? '') &&
      typeof c.destination === 'string' &&
      c.destination.length <= 500,
    'destination mismatch'
  )
  requireValue(
    c.comment === (body.comment ?? '') && bounded(c.comment, 2000),
    'signed review note required'
  )
  return c
}

function activeEvents(events) {
  return events.slice(events.findLastIndex((e) => resets.has(e.action)) + 1)
}

function clearance(active, destination, now) {
  const last = active.findLast((e) => e.action === 'clear_rights' && e.destination === destination)
  requireValue(last && last.valid_until > now, 'current scoped rights clearance required')
  return last
}

function checkSource(record, now) {
  requireValue(
    record.technical_pass === true && record.rights !== 'blocked' && record.consent !== 'denied',
    'technical, consent or rights hold'
  )
  if (record.rights_expires_at != null)
    requireValue(Date.parse(record.rights_expires_at) > now * 1000, 'source rights expired')
}

function validateParents(db, context, record, destination, now, seen) {
  for (const p of record.parents) {
    const parent = currentVersion(db, context, p.asset_id)
    requireValue(parent.version === p.version && parent.sha256 === p.sha256, 'source lineage mismatch')
    if (seen.has(parent.asset_id)) continue
    requireValue(seen.size < 512, 'lineage review limit exceeded')
    seen.add(parent.asset_id)
    const events = history(db, context, parent)
    requireValue(statusOf(events) === 'candidate', 'parent on hold')
    checkSource(parent, now)
    clearance(activeEvents(events), destination, now)
    validateParents(db, context, parent, destination, now, seen)
  }
}

function validateAuthority(db, context, c, record) {
  // The tenant owner provisions this mapping from a pinned external authority.
  // The review database cannot create, change or select the official master.
  requireValue(
    bounded(c.subject, 160) && Object.hasOwn(context.authorities ?? {}, c.subject),
    'enrolled authority subject required'
  )
  const ref = context.authorities[c.subject]
  const requestedKind =
    c.action === 'approve_canon' ? 'character' : c.action === 'approve_identity' ? 'identity' : ref.kind
  requireValue(
    ['identity', 'character'].includes(requestedKind) &&
      ref.kind === requestedKind &&
      ref.brand === record.brand &&
      bounded(ref.source, 1024) &&
      ref.source === c.authority_source &&
      bounded(ref.revision, 160) &&
      ref.revision === c.authority_revision &&
      c.reference_asset_id === ref.asset_id &&
      c.reference_version === ref.version &&
      c.reference_sha256 === ref.sha256,
    'authority reference mismatch'
  )
  const source = currentVersion(db, context, ref.asset_id)
  requireValue(
    source.version === ref.version && source.sha256 === ref.sha256 && source.brand === ref.brand,
    'authority source version mismatch'
  )
  const sourceEvents = history(db, context, source)
  requireValue(
    statusOf(sourceEvents) === 'candidate' &&
      sourceEvents.findLast((e) => ['clear_rights', 'revoke_rights'].includes(e.action))?.action !==
        'revoke_rights',
    'authority source on hold'
  )
}

function validateDecision(db, context, c, record, events, now) {
  requireValue(
    c.version === record.version && c.sha256 === record.sha256 && c.revision === events.length,
    'stale version or review revision'
  )
  if (c.action === 'publication_receipt') {
    // A delayed provider acknowledgement belongs in history even after the
    // asset is held. It never grants use or lifts a hold.
    const grant = events.find(
      (e) => e.action === 'publish' && e.destination === c.destination && e.nonce === c.authorization_nonce
    )
    requireValue(
      grant &&
        Number.isSafeInteger(c.occurred_at) &&
        c.occurred_at >= Math.floor(Date.parse(grant.at) / 1000) &&
        c.occurred_at <= now &&
        c.occurred_at < grant.exp &&
        bounded(c.provider, 100) &&
        bounded(c.receipt_ref, 500) &&
        !events.some(
          (e) => e.action === 'publication_receipt' && e.authorization_nonce === c.authorization_nonce
        ),
      'unique publication authorization and dated provider evidence required'
    )
    return
  }
  const active = activeEvents(events)
  const state = statusOf(events)
  if (c.action === 'recover') requireValue(state !== 'candidate', 'asset already active')
  else if (state !== 'candidate')
    requireValue(['comment', 'revoke_rights'].includes(c.action), 'asset on hold')
  if (c.action === 'critique')
    requireValue(bounded(record.maker, 160) && c.actor !== record.maker, 'independent critic required')
  if (c.action === 'verify_scan') {
    requireValue(
      c.scan_result === 'clean' &&
        bounded(c.evidence_ref, 500) &&
        bounded(c.scanner, 100) &&
        Number.isSafeInteger(c.valid_until) &&
        c.valid_until > now,
      'clean scan evidence and expiry required'
    )
  }
  if (c.action === 'clear_rights' || approvalActions.has(c.action)) {
    requireValue(bounded(c.destination, 500), 'exact destination required')
    checkSource(record, now)
  }
  if (c.action === 'clear_rights') {
    requireValue(
      ['owned', 'generated-owned', 'licensed'].includes(c.rights) &&
        ['granted', 'not-required'].includes(c.consent) &&
        bounded(c.evidence_ref, 500) &&
        Number.isSafeInteger(c.valid_until) &&
        c.valid_until > now,
      'rights, consent, expiry and evidence required'
    )
  }
  if (!approvalActions.has(c.action)) return
  clearance(active, c.destination, now)
  validateParents(db, context, record, c.destination, now, new Set([record.asset_id]))
  requireValue(
    active.some((e) => e.action === 'critique' && e.destination === c.destination),
    'destination-specific independent critique required'
  )
  if (c.action === 'approve_asset') {
    requireValue(
      ['none', 'brand_mark', 'character'].includes(c.identity_usage),
      'reviewer must classify identity use'
    )
    if (c.identity_usage !== 'none') requireValue(bounded(c.subject, 160), 'identity subject required')
    return
  }
  requireValue(
    active.some((e) => e.action === 'approve_asset' && e.destination === c.destination),
    'asset-use approval required'
  )
  if (['approve_identity', 'approve_canon', 'replace_canonical'].includes(c.action)) {
    validateAuthority(db, context, c, record)
  }
  if (c.action === 'replace_canonical') {
    requireValue(
      c.previous_asset_id === c.reference_asset_id &&
        c.previous_version === c.reference_version &&
        c.previous_sha256 === c.reference_sha256,
      'previous canonical target binding required'
    )
    requireValue(
      ['approve_identity', 'approve_canon'].some((a) =>
        active.some(
          (e) =>
            e.action === a &&
            e.destination === c.destination &&
            e.subject === c.subject &&
            e.authority_source === c.authority_source &&
            e.authority_revision === c.authority_revision &&
            e.reference_sha256 === c.reference_sha256
        )
      ),
      'identity or canon approval required'
    )
    const previous = currentVersion(db, context, c.previous_asset_id ?? '')
    requireValue(
      previous.asset_id !== record.asset_id &&
        previous.sha256 === c.previous_sha256 &&
        previous.version === c.previous_version,
      'previous canonical target binding required'
    )
  }
  if (c.action === 'publish') {
    const use = active.findLast((e) => e.action === 'approve_asset' && e.destination === c.destination)
    if (use.identity_usage !== 'none') {
      const required = use.identity_usage === 'brand_mark' ? 'approve_identity' : 'approve_canon'
      const mark = active.findLast(
        (e) => e.action === required && e.destination === c.destination && e.subject === use.subject
      )
      requireValue(mark, 'approved identity reference required for this placement')
      validateAuthority(db, context, mark, record)
    }
    requireValue(
      active.some((e) => e.action === 'verify_scan' && e.valid_until > now),
      'current scan attestation required'
    )
  }
}

export function applyReviewDecision(db, context, assetId, body) {
  assertReviewTenant(db, context)
  db.exec('BEGIN IMMEDIATE')
  let verifiedActor = null
  try {
    const now = Math.floor(Date.now() / 1000)
    const c = authenticate(context, body, assetId, now)
    verifiedActor = c.actor
    requireValue(c.audience === audience(db), 'decision audience mismatch')
    const restrictive = ['revoke_rights', 'delete', 'archive', 'comment', 'publication_receipt'].includes(
      c.action
    )
    const record = currentVersion(db, context, assetId, !restrictive)
    const events = history(db, context, record)
    requireValue(
      !db.prepare('SELECT 1 FROM vis_review_event WHERE tenant=? AND nonce=?').get(context.tenant, c.nonce),
      'decision replay'
    )
    validateDecision(db, context, c, record, events, now)
    db.prepare(
      `INSERT INTO vis_review_event(tenant,asset_id,version,sha256,revision,action,destination,actor,nonce,at,claims_json,signed_token)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      c.tenant,
      assetId,
      c.version,
      c.sha256,
      c.revision + 1,
      c.action,
      c.destination,
      c.actor,
      c.nonce,
      new Date().toISOString(),
      JSON.stringify(c),
      body.token
    )
    const result = readReview(db, context, assetId)
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    const compact = typeof body?.token === 'string' ? body.token.slice(0, 16384) : ''
    const hash = createHash('sha256').update(compact).digest('hex')
    // Do not retain untrusted payloads, claimed identities or filesystem errors.
    db.prepare(
      'INSERT INTO vis_review_denial(tenant,at,request_digest,observed_actor,reason) VALUES(?,?,?,?,?)'
    ).run(
      context.tenant,
      new Date().toISOString(),
      hash,
      verifiedActor,
      verifiedActor ? 'scope_or_precondition' : 'unauthenticated'
    )
    throw error
  }
}

export function exportReviewAudit(db, context) {
  assertReviewTenant(db, context)
  db.exec('BEGIN')
  try {
    const accepted = db
      .prepare('SELECT seq,at,claims_json,signed_token FROM vis_review_event WHERE tenant=? ORDER BY seq')
      .all(context.tenant)
    const decisions = accepted.map(({ seq, at, claims_json, signed_token }) => ({
      seq,
      at,
      claims: JSON.parse(claims_json),
      signed_token
    }))
    const denials = db
      .prepare(
        'SELECT seq,at,request_digest,observed_actor,reason FROM vis_review_denial WHERE tenant=? ORDER BY seq'
      )
      .all(context.tenant)
    const inputs = db
      .prepare('SELECT asset_id,version,record_json FROM vis_review_intake ORDER BY asset_id')
      .all()
      .map((row) => {
        const { input, technical } = JSON.parse(row.record_json)
        return { asset_id: row.asset_id, version: row.version, input, technical }
      })
    const signers = Object.entries(context.reviewers).map(([kid, r]) => ({
      kid,
      actor: r.actor,
      kind: r.kind,
      public_key: createPublicKey(r.publicKey).export({ type: 'spki', format: 'pem' })
    }))
    const result = {
      schema: 'vis.private-review-audit/1',
      tenant: context.tenant,
      audience: audience(db),
      exported_at: new Date().toISOString(),
      signers,
      inputs,
      decisions,
      denials
    }
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function eligibleHandoff(db, context, assetId, destination) {
  assertReviewTenant(db, context)
  db.exec('BEGIN')
  try {
    const now = Math.floor(Date.now() / 1000)
    const record = currentVersion(db, context, assetId)
    const events = history(db, context, record)
    const active = activeEvents(events)
    const grant = active.findLast((e) => e.action === 'publish' && e.destination === destination)
    requireValue(
      statusOf(events) === 'candidate' && grant && now < grant.exp,
      'current publication authorization required'
    )
    requireValue(
      !active.some((e) => e.action === 'publication_receipt' && e.authorization_nonce === grant.nonce),
      'publication already receipted'
    )
    // Re-evaluate scopes and evidence at export time, including parent holds
    // imposed after the child was originally approved.
    const receipt = db
      .prepare('SELECT signed_token FROM vis_review_event WHERE tenant=? AND nonce=?')
      .get(context.tenant, grant.nonce)
    authenticate(
      context,
      { token: receipt.signed_token, action: 'publish', destination, comment: grant.comment },
      assetId,
      now
    )
    validateDecision(db, context, { ...grant, revision: events.length }, record, events, now)
    db.exec('COMMIT')
    return {
      version: record.version,
      sha256: record.sha256,
      authorization_nonce: grant.nonce,
      expires_at: grant.exp
    }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
