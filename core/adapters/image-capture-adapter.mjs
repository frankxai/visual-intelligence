/** Offline source observations in the owning VIS database, not another asset catalog. */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { recordProvenance } from '../vis-core.mjs'

export const CAPTURE_SCHEMA = 'vis.image-capture.v1'
export const MAX_MANIFEST_BYTES = 4 * 1024 * 1024
const MAX_ITEMS = 250
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_BATCH_BYTES = 256 * 1024 * 1024
const GENERATION_FIELDS = ['user_prompt', 'effective_prompt', 'revised_prompt', 'requested_model', 'resolved_model', 'provider', 'reason']
const UNKNOWN = { value: null, status: 'unknown', evidence_ref: null }

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const id = (kind, value) => `${kind}_${digest(value)}`
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function check(condition, message) { if (!condition) throw new Error(message) }
function keys(value, allowed, label) {
  check(object(value), `${label} must be an object`)
  for (const key of Object.keys(value)) check(allowed.includes(key), `${label}: unsupported field ${key}`)
}
function text(value, label, max = 65536) {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${label} must be a nonempty string (max ${max})`)
  return value
}
function nullableText(value, label, max) { return value == null ? null : text(value, label, max) }
function timestamp(value, label, nullable = false) {
  if (value == null && nullable) return null
  text(value, label, 64)
  check(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), `${label} must be an ISO timestamp with timezone`)
  return new Date(value).toISOString()
}
function claim(value = UNKNOWN, label) {
  keys(value, ['value', 'status', 'evidence_ref'], label)
  check('value' in value && 'evidence_ref' in value, `${label} requires value and evidence_ref (null when unknown)`)
  check(['unknown', 'exact', 'reconstructed', 'inferred'].includes(value.status), `${label}: invalid evidence status`)
  if (value.status === 'unknown') {
    check(value.value == null && value.evidence_ref == null, `${label}: unknown claims must have null value and evidence_ref`)
    return { ...UNKNOWN }
  }
  return { value: text(value.value, `${label}.value`), status: value.status, evidence_ref: text(value.evidence_ref, `${label}.evidence_ref`, 8192) }
}
function labels(value = [], label) {
  check(Array.isArray(value) && value.length <= 100, `${label} must be an array of at most 100 strings`)
  return [...new Set(value.map(v => text(v, label, 512)))]
}

export function normalizeCapture(input) {
  check(Buffer.byteLength(JSON.stringify(input) || '') <= MAX_MANIFEST_BYTES, 'Manifest exceeds 4 MiB')
  keys(input, ['schema_version', 'batch_id', 'source', 'mode', 'captured_at', 'cursor', 'coverage', 'items'], 'manifest')
  check(input.schema_version === CAPTURE_SCHEMA, `schema_version must be ${CAPTURE_SCHEMA}`)
  keys(input.source, ['provider', 'scope'], 'source')
  keys(input.cursor, ['previous', 'next', 'revision'], 'cursor')
  check('previous' in input.cursor && 'next' in input.cursor, 'cursor must explicitly declare previous and next')
  check(Number.isSafeInteger(input.cursor.revision ?? 0) && (input.cursor.revision ?? 0) >= 0, 'cursor.revision must be a nonnegative safe integer')
  keys(input.coverage, ['exhausted', 'note'], 'coverage')
  check(typeof input.coverage.exhausted === 'boolean', 'coverage.exhausted must be boolean')
  check(['backfill', 'event'].includes(input.mode), 'mode must be backfill or event')
  check(Array.isArray(input.items) && input.items.length <= MAX_ITEMS, `items must contain at most ${MAX_ITEMS} entries; never silently truncate a page`)
  const seen = new Set()
  const items = input.items.map((item, index) => {
    const label = `items[${index}]`
    keys(item, ['source_item_id', 'source_uri', 'filename', 'mime_type', 'created_at', 'discovered_at', 'local_path', 'expected_sha256', 'generation', 'concept', 'relations', 'metadata'], label)
    const sourceItemId = text(item.source_item_id, `${label}.source_item_id`, 1024)
    check(!seen.has(sourceItemId), `Duplicate source_item_id in batch: ${sourceItemId}`)
    seen.add(sourceItemId)
    keys(item.generation ?? {}, [...GENERATION_FIELDS, 'model'], `${label}.generation`)
    if (item.generation?.model && item.generation?.resolved_model) {
      check(canonicalJson(item.generation.model) === canonicalJson(item.generation.resolved_model), `${label}: model alias conflicts with resolved_model`)
    }
    keys(item.concept ?? {}, ['summary', 'characters', 'stories', 'worlds', 'intended_uses'], `${label}.concept`)
    check(item.metadata == null || object(item.metadata), `${label}.metadata must be an object`)
    check(item.expected_sha256 == null || /^[a-f0-9]{64}$/.test(item.expected_sha256), `${label}.expected_sha256 must be lowercase SHA-256`)
    const relations = item.relations ?? []
    check(Array.isArray(relations) && relations.length <= 100, `${label}.relations must contain at most 100 entries`)
    return {
      source_item_id: sourceItemId,
      source_uri: nullableText(item.source_uri, `${label}.source_uri`, 8192),
      filename: nullableText(item.filename, `${label}.filename`, 1024),
      mime_type: nullableText(item.mime_type, `${label}.mime_type`, 256),
      created_at: timestamp(item.created_at, `${label}.created_at`, true),
      discovered_at: timestamp(item.discovered_at, `${label}.discovered_at`),
      local_path: nullableText(item.local_path, `${label}.local_path`, 4096),
      expected_sha256: item.expected_sha256 || null,
      generation: Object.fromEntries(GENERATION_FIELDS.map(key => [key, claim(item.generation?.[key] ?? (key === 'resolved_model' ? item.generation?.model : undefined), `${label}.generation.${key}`)])),
      concept: {
        summary: claim(item.concept?.summary, `${label}.concept.summary`),
        ...Object.fromEntries(['characters', 'stories', 'worlds', 'intended_uses'].map(key => [key, labels(item.concept?.[key], `${label}.concept.${key}`)])),
      },
      relations: relations.map((relation, i) => {
        keys(relation, ['type', 'source_item_id', 'source', 'evidence_ref'], `${label}.relations[${i}]`)
        check(['edit-of', 'variation-of', 'derived-from', 'references'].includes(relation.type), 'Unsupported relation type')
        if (relation.source) keys(relation.source, ['provider', 'scope'], 'relation.source')
        return {
          type: relation.type,
          source_item_id: text(relation.source_item_id, 'relation.source_item_id', 1024),
          source: relation.source ? { provider: text(relation.source.provider, 'relation.source.provider', 128), scope: text(relation.source.scope, 'relation.source.scope', 1024) } : null,
          evidence_ref: text(relation.evidence_ref, 'relation.evidence_ref', 8192),
        }
      }),
      metadata: item.metadata || {},
    }
  })
  return {
    schema_version: CAPTURE_SCHEMA,
    batch_id: text(input.batch_id, 'batch_id', 1024),
    source: { provider: text(input.source.provider, 'source.provider', 128), scope: text(input.source.scope, 'source.scope', 1024) },
    mode: input.mode,
    captured_at: timestamp(input.captured_at, 'captured_at'),
    cursor: { previous: nullableText(input.cursor.previous, 'cursor.previous', 8192), next: nullableText(input.cursor.next, 'cursor.next', 8192), revision: input.cursor.revision ?? 0 },
    coverage: { exhausted: input.coverage.exhausted, note: text(input.coverage.note, 'coverage.note', 4096) },
    items,
  }
}

export function createCaptureSchema(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS image_capture_source (
  source_id TEXT PRIMARY KEY, provider TEXT NOT NULL, scope TEXT NOT NULL,
  cursor TEXT, coverage_json TEXT NOT NULL, captured_at TEXT NOT NULL, revision INTEGER NOT NULL,
  UNIQUE(provider, scope)
);
CREATE TABLE IF NOT EXISTS image_capture_batch (
  batch_key TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES image_capture_source(source_id),
  batch_id TEXT NOT NULL, manifest_sha256 TEXT NOT NULL, receipt_json TEXT NOT NULL,
  UNIQUE(source_id, batch_id)
);
CREATE TABLE IF NOT EXISTS image_capture_observation (
  observation_id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES image_capture_source(source_id),
  source_item_id TEXT NOT NULL, batch_key TEXT NOT NULL REFERENCES image_capture_batch(batch_key),
  discovered_at TEXT NOT NULL, source_created_at TEXT, measured_sha256 TEXT,
  asset_id TEXT REFERENCES asset(asset_id), version_id TEXT REFERENCES asset_version(version_id),
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_capture_item ON image_capture_observation(source_id, source_item_id);
CREATE INDEX IF NOT EXISTS idx_capture_asset ON image_capture_observation(asset_id);
CREATE INDEX IF NOT EXISTS idx_capture_hash ON image_capture_observation(measured_sha256);
`)
}

function hasCaptureSchema(db) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'image_capture_batch'").get()
}
function measuredFile(localPath, mediaRoot) {
  check(mediaRoot, 'local_path requires an explicit mediaRoot')
  check(!path.isAbsolute(localPath), 'local_path must be relative to mediaRoot')
  const root = fs.realpathSync(mediaRoot)
  const resolved = fs.realpathSync(path.resolve(root, localPath))
  const relative = path.relative(root, resolved)
  check(relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'local_path escapes mediaRoot')
  const fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const before = fs.fstatSync(fd)
    check(before.isFile() && before.size <= MAX_FILE_BYTES, 'Local file must be regular and at most 64 MiB')
    const hash = crypto.createHash('sha256')
    const buffer = Buffer.alloc(64 * 1024)
    let count = 0
    let bytes
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) !== 0) {
      count += bytes
      check(count <= MAX_FILE_BYTES, 'Local file grew beyond 64 MiB')
      hash.update(buffer.subarray(0, bytes))
    }
    const after = fs.fstatSync(fd)
    check(count === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs, 'Local file changed during capture')
    return { sha256: hash.digest('hex'), bytes: count }
  } finally { fs.closeSync(fd) }
}

/** Same input works for backfill pages and generation events. Caller owns source authentication. */
export function captureImages(db, input, options = {}) {
  const manifest = normalizeCapture(input)
  const sourceId = id('capture_source', canonicalJson(manifest.source))
  const batchKey = id('capture_batch', `${sourceId}:${manifest.batch_id}`)
  const manifestHash = digest(canonicalJson(manifest))
  const execute = options.execute === true
  // Schema and data are committed together; no cursor can survive a failed page.
  db.exec(execute ? 'BEGIN IMMEDIATE' : 'BEGIN')
  try {
    const exists = hasCaptureSchema(db)
    const prior = exists ? db.prepare('SELECT * FROM image_capture_batch WHERE batch_key = ?').get(batchKey) : null
    if (prior) {
      check(prior.manifest_sha256 === manifestHash, 'batch_id already committed with different content; use a new batch_id')
      db.exec('ROLLBACK')
      return { ...JSON.parse(prior.receipt_json), dry_run: !execute, replayed: true }
    }
    const source = exists ? db.prepare('SELECT cursor, revision FROM image_capture_source WHERE source_id = ?').get(sourceId) : null
    check((source?.cursor ?? null) === manifest.cursor.previous && (source?.revision ?? 0) === manifest.cursor.revision, 'Stale source cursor/revision; reload checkpoint before retrying')
    check(manifest.cursor.revision < Number.MAX_SAFE_INTEGER, 'Source revision exhausted safe integer range')
    const hashes = new Set()
    let measuredBytes = 0
    const rows = manifest.items.map(item => {
      const measured = item.local_path ? measuredFile(item.local_path, options.mediaRoot) : null
      measuredBytes += measured?.bytes || 0
      check(measuredBytes <= MAX_BATCH_BYTES, 'Batch exceeds 256 MiB of local reads')
      if (measured && item.expected_sha256) check(measured.sha256 === item.expected_sha256, `SHA-256 mismatch for source item ${item.source_item_id}`)
      const version = measured ? db.prepare('SELECT asset_id, version_id FROM asset_version WHERE sha256 = ? ORDER BY version_id LIMIT 1').get(measured.sha256) : null
      const knownHash = measured && exists ? db.prepare('SELECT observation_id FROM image_capture_observation WHERE measured_sha256 = ? LIMIT 1').get(measured.sha256) : null
      const duplicate = !!measured && (hashes.has(measured.sha256) || !!knownHash)
      if (measured) hashes.add(measured.sha256)
      return {
        observation_id: id('capture_observation', `${batchKey}:${item.source_item_id}`),
        source_item_id: item.source_item_id,
        measured_sha256: measured?.sha256 || null,
        measured_bytes: measured?.bytes ?? null,
        asset_id: version?.asset_id || null,
        version_id: version?.version_id || null,
        state: version ? 'linked' : measured ? 'pending-library-ingest' : 'metadata-only',
        duplicate_bytes: duplicate,
        generation: item.generation,
        created_at: item.created_at,
        discovered_at: item.discovered_at,
        review_status: 'unreviewed',
      }
    })
    const receipt = {
      schema_version: 'vis.image-capture-receipt.v1',
      batch_key: batchKey, batch_id: manifest.batch_id, manifest_sha256: manifestHash,
      source: manifest.source, mode: manifest.mode, captured_at: manifest.captured_at,
      dry_run: !execute, replayed: false,
      cursor: { before: source?.cursor ?? null, proposed: manifest.cursor.next, committed: execute ? manifest.cursor.next : source?.cursor ?? null,
        revision_before: source?.revision ?? 0, revision_proposed: manifest.cursor.revision + 1, revision_committed: execute ? manifest.cursor.revision + 1 : source?.revision ?? 0 },
      coverage: manifest.coverage,
      // Exhaustion applies only to the named scope and query, never all consumer history.
      all_history_verified: false,
      counts: {
        observations: rows.length,
        linked: rows.filter(r => r.state === 'linked').length,
        metadata_only: rows.filter(r => r.state === 'metadata-only').length,
        pending_library_ingest: rows.filter(r => r.state === 'pending-library-ingest').length,
        duplicate_bytes: rows.filter(r => r.duplicate_bytes).length,
        missing_user_prompt: rows.filter(r => r.generation.user_prompt.status === 'unknown').length,
        missing_resolved_model: rows.filter(r => r.generation.resolved_model.status === 'unknown').length,
        missing_reason: rows.filter(r => r.generation.reason.status === 'unknown').length,
      },
      measured_bytes: measuredBytes, rows,
      uploads: 0, model_calls: 0, publications: 0,
    }
    if (!execute) { db.exec('ROLLBACK'); return receipt }
    createCaptureSchema(db)
    db.prepare(`INSERT INTO image_capture_source VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(source_id) DO UPDATE SET cursor=excluded.cursor, coverage_json=excluded.coverage_json, captured_at=excluded.captured_at, revision=excluded.revision`)
      .run(sourceId, manifest.source.provider, manifest.source.scope, manifest.cursor.next, JSON.stringify(manifest.coverage), manifest.captured_at, manifest.cursor.revision + 1)
    db.prepare('INSERT INTO image_capture_batch VALUES (?, ?, ?, ?, ?)').run(batchKey, sourceId, manifest.batch_id, manifestHash, JSON.stringify(receipt))
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const item = manifest.items[i]
      const payload = { ...item, capture: { ...row, source: manifest.source, batch_key: batchKey } }
      db.prepare('INSERT INTO image_capture_observation VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(row.observation_id, sourceId, item.source_item_id, batchKey, item.discovered_at, item.created_at, row.measured_sha256, row.asset_id, row.version_id, JSON.stringify(payload))
      if (row.asset_id) {
        // Keep fidelity in the provenance payload. Do not flatten reconstructed prompts
        // or guessed models into the generation_event/prompt tables as observed facts.
        recordProvenance(db, { eventId: row.observation_id, assetId: row.asset_id, versionId: row.version_id,
          eventType: 'image-source-captured', actor: 'vis-image-capture', source: `${manifest.source.provider}:${item.source_item_id}`,
          createdAt: manifest.captured_at, payload })
      }
    }
    db.exec('COMMIT')
    return receipt
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* Preserve the original failure. */ }
    throw error
  }
}

/** Private export. The discovery ledger never substitutes for canonical asset records. */
export function exportCaptureIndex(db) {
  if (!hasCaptureSchema(db)) return { schema_version: 'vis.image-capture-index.v1', sources: [], observations: [] }
  const count = db.prepare('SELECT COUNT(*) AS count FROM image_capture_observation').get().count
  check(count <= 100000, 'Export exceeds 100000 observations; query scoped pages instead')
  return {
    schema_version: 'vis.image-capture-index.v1',
    sources: db.prepare('SELECT * FROM image_capture_source ORDER BY source_id').all().map(row => ({ ...row, coverage: JSON.parse(row.coverage_json), coverage_json: undefined })),
    observations: db.prepare('SELECT payload_json FROM image_capture_observation ORDER BY discovered_at, observation_id').all().map(row => JSON.parse(row.payload_json)),
  }
}
