/**
 * VIS library — declared-root watcher, rendition ladder, and proposal log.
 *
 * Roots are configured once (`library.roots` in vis.config.json). Nothing
 * outside them is walked. Ingest is dry-run by default, never uploads, never
 * calls a vision model, and never deletes. Every new asset starts with rights
 * `unknown`. The grid reads renditions only; the master is never served here.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import {
  assetPublishGate,
  buildAssetEntry,
  expandPathTokens,
  findProjectRoot,
  getAsset,
  loadConfig,
  normalizeConfig,
  openVisDatabase,
  recordProvenance,
  resolveAssetId,
  resolveProjectPath,
  upsertAssetGraph,
  walkMediaFiles,
} from './vis-core.mjs'

export const LIBRARY_DEFAULTS = {
  roots: [],
  renditionsDir: 'data/renditions',
  receiptsDir: 'data/receipts',
  limit: 50,
  thumbWidth: 320,
  previewWidth: 1600,
  maxNewRenditionBytes: 300 * 1024 * 1024,
  minFreeDiskGB: 35,
  sourceKind: 'local-staging',
}

const RENDERABLE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'])
export const PROPOSAL_KINDS = ['rank', 'set', 'tags', 'rights']
const RIGHTS_VALUES = new Set(['unknown', 'needs-review', 'owned', 'generated-owned', 'licensed', 'blocked'])

export function createLibrarySchema(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS library_file_state (
  absolute_path TEXT PRIMARY KEY,
  root_label TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_rendition (
  rendition_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL,
  storage TEXT NOT NULL DEFAULT 'local',
  path TEXT,
  data_text TEXT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  byte_size INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (sha256, kind, storage)
);

CREATE TABLE IF NOT EXISTS asset_proposal (
  proposal_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  rule TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  rationale TEXT,
  proposed_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rendition_asset ON asset_rendition(asset_id);
CREATE INDEX IF NOT EXISTS idx_proposal_status ON asset_proposal(status);
CREATE INDEX IF NOT EXISTS idx_proposal_asset ON asset_proposal(asset_id);
`)
}

export function openLibraryDatabase(root, config) {
  const db = openVisDatabase(root, config)
  createLibrarySchema(db)
  return db
}

export function libraryConfig(config = {}) {
  return { ...LIBRARY_DEFAULTS, ...(config.library || {}) }
}

/** Declared roots only. A root that does not exist is reported, never searched for. */
export function resolveLibraryRoots(root, config, override = null) {
  const lib = libraryConfig(config)
  const raw = override && override.length ? override : lib.roots
  return raw.map((item, index) => {
    const spec = typeof item === 'string' ? { path: item } : item
    const absolute = path.resolve(root, expandPathTokens(spec.path))
    return {
      label: spec.label || path.basename(absolute) || `root-${index}`,
      path: absolute,
      exclude: (spec.exclude || []).map(value => String(value)),
      exists: fs.existsSync(absolute) && fs.statSync(absolute).isDirectory(),
    }
  })
}

export function isInsideRoot(filePath, rootPath) {
  const rel = path.relative(rootPath, filePath)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function isExcluded(filePath, libRoot) {
  const segments = path.relative(libRoot.path, filePath).split(path.sep)
  return libRoot.exclude.some(ex => segments.includes(ex))
}

/** Walk one declared root. Excluded directories are pruned before descent. */
export function walkLibraryRoot(libRoot, config) {
  if (!libRoot.exists) return []
  const excluded = new Set(libRoot.exclude)
  const walkConfig = {
    ...config,
    containWithin: true,
    privateDirPatterns: [...(config.privateDirPatterns || []), ...excluded],
  }
  return walkMediaFiles(libRoot.path, walkConfig).filter(file => isInsideRoot(file, libRoot.path) && !isExcluded(file, libRoot))
}

/**
 * Plan, then (with execute:true) file new or changed files under the declared roots.
 * Unchanged files (same size and mtime as the last run) are skipped without hashing.
 */
export async function ingestLibrary(options = {}) {
  const root = path.resolve(options.root || findProjectRoot())
  const config = normalizeConfig({ ...loadConfig(root), ...(options.config || {}) })
  const lib = libraryConfig(config)
  const roots = resolveLibraryRoots(root, config, options.roots)
  const limit = Number(options.limit || lib.limit)
  const execute = options.execute === true
  const startedAt = nowIso()
  const runId = stableId('lib', `${startedAt}:${root}`)
  const db = openLibraryDatabase(root, config)

  try {
    const plan = []
    const considered = []
    let unchanged = 0
    let truncated = false
    outer: for (const libRoot of roots) {
      for (const file of walkLibraryRoot(libRoot, config)) {
        considered.push(file)
        const stats = fs.statSync(file)
        const state = db.prepare('SELECT byte_size, mtime_ms FROM library_file_state WHERE absolute_path = ?').get(file)
        if (state && state.byte_size === stats.size && state.mtime_ms === Math.trunc(stats.mtimeMs)) {
          unchanged++
          continue
        }
        if (plan.length >= limit) {
          truncated = true
          break outer
        }
        plan.push({ root: libRoot, file, byteSize: stats.size, mtimeMs: Math.trunc(stats.mtimeMs) })
      }
    }

    const summary = {
      runId,
      dryRun: !execute,
      roots: roots.map(({ label, path: p, exclude, exists }) => ({ label, path: p, exclude, exists })),
      considered: considered.length,
      unchanged,
      planned: plan.length,
      truncated,
      limit,
    }
    if (!execute) {
      return { ...summary, plan: plan.map(item => ({ root: item.root.label, path: item.file, byteSize: item.byteSize })), note: 'Dry run. Pass execute:true (CLI --execute) to hash and render.' }
    }

    const renditionsDir = resolveProjectPath(root, expandPathTokens(lib.renditionsDir))
    const receiptsDir = resolveProjectPath(root, expandPathTokens(options.receiptsDir || lib.receiptsDir))
    const minFree = Number(options.minFreeDiskGB ?? lib.minFreeDiskGB)
    const maxBytes = Number(options.maxNewRenditionBytes ?? lib.maxNewRenditionBytes)
    const rows = []
    let renditionBytes = 0
    let stopped = null

    for (const item of plan) {
      const free = freeDiskGB(renditionsDir)
      if (free !== null && free < minFree) {
        stopped = `free disk ${free.toFixed(1)} GB is below ${minFree} GB`
        break
      }
      if (renditionBytes >= maxBytes) {
        stopped = `new rendition bytes reached ${renditionBytes} (cap ${maxBytes})`
        break
      }
      const row = await ingestOne(db, { root, config, lib, item, renditionsDir, runId })
      renditionBytes += row.renditionBytes
      rows.push(row)
    }

    const receipt = {
      schema: 'vis.library-ingest-receipt.v1',
      ...summary,
      startedAt,
      completedAt: nowIso(),
      stopped,
      filed: rows.length,
      newAssets: rows.filter(r => r.newAsset).length,
      duplicatesOfKnownHash: rows.filter(r => !r.newAsset).length,
      renditionBytes,
      uploaded: false,
      visionModel: false,
      rows,
    }
    fs.mkdirSync(receiptsDir, { recursive: true })
    const receiptPath = path.join(receiptsDir, `library-ingest-${startedAt.replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2))
    return { ...receipt, receiptPath }
  } finally {
    db.close()
  }
}

async function ingestOne(db, { root, config, lib, item, renditionsDir, runId }) {
  const entry = buildAssetEntry(item.root.path, item.root.path, item.file, config)
  const known = db.prepare('SELECT asset_id FROM asset WHERE asset_id = ?').get(entry.assetId)
  const renditions = RENDERABLE.has(entry.extension) && !hasRenditions(db, entry.sha256)
    ? await renderLadder(item.file, entry.sha256, renditionsDir, lib)
    : []
  const ts = nowIso()

  db.exec('BEGIN')
  try {
    upsertAssetGraph(db, entry, config)
    for (const r of renditions) {
      db.prepare(`
INSERT OR IGNORE INTO asset_rendition (rendition_id, asset_id, sha256, kind, storage, path, data_text, mime_type, width, height, byte_size, created_at)
VALUES (?, ?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, ?)`).run(
        stableId('rnd', `${entry.sha256}:${r.kind}:local`), entry.assetId, entry.sha256, r.kind,
        r.path ? slash(path.relative(root, r.path)) : null, r.data || null, r.mime || null,
        r.width || null, r.height || null, r.bytes || null, ts,
      )
    }
    db.prepare(`
INSERT INTO library_file_state (absolute_path, root_label, byte_size, mtime_ms, sha256, asset_id, seen_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(absolute_path) DO UPDATE SET byte_size = excluded.byte_size, mtime_ms = excluded.mtime_ms,
  sha256 = excluded.sha256, asset_id = excluded.asset_id, seen_at = excluded.seen_at`).run(
      item.file, item.root.label, item.byteSize, item.mtimeMs, entry.sha256, entry.assetId, ts,
    )
    recordProvenance(db, {
      assetId: entry.assetId,
      versionId: entry.versionId,
      eventType: 'library-ingested',
      actor: 'vis-library',
      source: item.file,
      payload: { runId, root: item.root.label, sourceKind: lib.sourceKind, rights: 'unknown', uploaded: false },
      eventId: stableId('prov', `${entry.assetId}:library-ingested:${item.file}:${item.mtimeMs}`),
    })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return {
    path: item.file,
    root: item.root.label,
    assetId: entry.assetId,
    sha256: entry.sha256,
    mime: entry.mimeType,
    width: entry.width,
    height: entry.height,
    bytes: entry.byteSize,
    newAsset: !known,
    rights: 'unknown',
    renditions: renditions.map(r => r.kind),
    renditionBytes: renditions.reduce((sum, r) => sum + (r.bytes || 0), 0),
  }
}

function hasRenditions(db, sha256) {
  return Boolean(db.prepare("SELECT 1 FROM asset_rendition WHERE sha256 = ? AND kind = 'thumb' AND storage = 'local'").get(sha256))
}

/** Thumb (~320 px WebP), preview (~1600 px WebP), ThumbHash. The master is only read. */
export async function renderLadder(filePath, sha256, renditionsDir, lib = LIBRARY_DEFAULTS) {
  const { default: sharp } = await import('sharp')
  const { rgbaToThumbHash } = await import('thumbhash')
  const bytes = fs.readFileSync(filePath)
  const image = sharp(bytes, { failOn: 'none', animated: false })
  const dir = path.join(renditionsDir, sha256.slice(0, 2))
  fs.mkdirSync(dir, { recursive: true })
  const out = []
  for (const [kind, width, quality] of [['thumb', lib.thumbWidth, 80], ['preview', lib.previewWidth, 82]]) {
    const { data, info } = await image.clone().rotate()
      .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality }).toBuffer({ resolveWithObject: true })
    const target = path.join(dir, `${sha256}.${kind}.webp`)
    fs.writeFileSync(target, data)
    out.push({ kind, path: target, mime: 'image/webp', width: info.width, height: info.height, bytes: data.length })
  }
  const raw = await image.clone().rotate().resize({ width: 100, height: 100, fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const hash = Buffer.from(rgbaToThumbHash(raw.info.width, raw.info.height, raw.data)).toString('base64')
  out.push({ kind: 'thumbhash', data: hash, bytes: 0 })
  return out
}

/** Watch declared roots and file changes after a quiet period. Returns { close }. */
export function watchLibrary(options = {}) {
  const root = path.resolve(options.root || findProjectRoot())
  const config = normalizeConfig({ ...loadConfig(root), ...(options.config || {}) })
  const roots = resolveLibraryRoots(root, config, options.roots).filter(r => r.exists)
  const debounceMs = Number(options.debounceMs || 2000)
  const log = options.log || (() => {})
  let timer = null
  let running = false
  let pending = false

  const run = async () => {
    if (running) { pending = true; return }
    running = true
    try {
      const result = await ingestLibrary({ ...options, root, execute: true })
      log(result)
    } catch (error) {
      log({ error: error.message })
    } finally {
      running = false
      if (pending) { pending = false; schedule() }
    }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, debounceMs) }
  const watchers = roots.map(r => fs.watch(r.path, { recursive: true }, (_event, name) => {
    if (!name) return schedule()
    const full = path.join(r.path, String(name))
    if (isExcluded(full, r)) return
    schedule()
  }))
  if (options.initial !== false) schedule()
  return {
    roots,
    close() {
      clearTimeout(timer)
      for (const w of watchers) w.close()
    },
  }
}

// ---------------------------------------------------------------------------
// Read API shared by the operator screen and the MCP server.

export function listLibrary(db, options = {}) {
  const limit = Math.min(Number(options.limit || 200), 1000)
  const offset = Math.max(Number(options.offset || 0), 0)
  const where = ['EXISTS (SELECT 1 FROM library_file_state f WHERE f.asset_id = a.asset_id)']
  const params = []
  if (options.rights) { where.push('a.rights_status = ?'); params.push(options.rights) }
  if (options.root) { where.push('EXISTS (SELECT 1 FROM library_file_state f WHERE f.asset_id = a.asset_id AND f.root_label = ?)'); params.push(options.root) }
  if (options.query) {
    where.push("(a.title LIKE ? OR a.primary_path LIKE ? OR a.tags_json LIKE ? OR COALESCE(n.custom_tags_json,'') LIKE ?)")
    const q = `%${options.query}%`
    params.push(q, q, q, q)
  }
  if (options.minRating) { where.push('COALESCE(n.rating, 0) >= ?'); params.push(Number(options.minRating)) }
  const order = options.sort === 'rank' ? 'COALESCE(n.rating, 0) DESC, a.last_seen_at DESC' : 'a.last_seen_at DESC, a.asset_id'
  const sql = `
SELECT a.asset_id, a.title, a.primary_path, a.media_type, a.rights_status, a.approval_status, a.source_hash AS sha256,
  n.rating, n.custom_tags_json,
  (SELECT data_text FROM asset_rendition r WHERE r.asset_id = a.asset_id AND r.kind = 'thumbhash' LIMIT 1) AS thumbhash,
  (SELECT width FROM asset_rendition r WHERE r.asset_id = a.asset_id AND r.kind = 'thumb' LIMIT 1) AS thumb_width,
  (SELECT height FROM asset_rendition r WHERE r.asset_id = a.asset_id AND r.kind = 'thumb' LIMIT 1) AS thumb_height,
  (SELECT COUNT(*) FROM library_file_state f WHERE f.asset_id = a.asset_id) AS location_count,
  (SELECT COUNT(*) FROM asset_proposal p WHERE p.asset_id = a.asset_id AND p.status = 'open') AS open_proposals
FROM asset a LEFT JOIN asset_annotation n ON n.asset_id = a.asset_id
WHERE ${where.join(' AND ')}
ORDER BY ${order}
LIMIT ? OFFSET ?`
  const rows = db.prepare(sql).all(...params, limit, offset)
  const total = db.prepare(`SELECT COUNT(*) AS c FROM asset a LEFT JOIN asset_annotation n ON n.asset_id = a.asset_id WHERE ${where.join(' AND ')}`).get(...params).c
  return {
    total,
    limit,
    offset,
    assets: rows.map(row => ({ ...row, custom_tags: safeJson(row.custom_tags_json, []), custom_tags_json: undefined })),
  }
}

export function getLibraryAsset(db, assetRef) {
  const assetId = resolveAssetId(db, assetRef)
  if (!assetId) return null
  const asset = getAsset(db, assetId)
  const renditions = db.prepare('SELECT kind, storage, path, data_text, mime_type, width, height, byte_size FROM asset_rendition WHERE asset_id = ? ORDER BY kind').all(assetId)
  const files = db.prepare('SELECT absolute_path, root_label, byte_size, seen_at FROM library_file_state WHERE asset_id = ? ORDER BY absolute_path').all(assetId)
  const proposals = listProposals(db, { assetId, status: 'all' })
  const events = db.prepare('SELECT event_type, actor, source, payload_json, created_at FROM provenance_event WHERE asset_id = ? ORDER BY created_at DESC LIMIT 50').all(assetId)
    .map(e => ({ ...e, payload: safeJson(e.payload_json, {}), payload_json: undefined }))
  return {
    ...asset,
    renditions,
    files,
    proposals,
    events,
    publish_gate: assetPublishGate(asset, { intendedUse: 'website publication' }),
  }
}

export function renditionPath(root, db, assetId, kind, renditionsDir = null) {
  if (!['thumb', 'preview'].includes(kind)) return null
  const row = db.prepare("SELECT path FROM asset_rendition WHERE asset_id = ? AND kind = ? AND storage = 'local'").get(assetId, kind)
  if (!row?.path) return null
  const base = path.resolve(root, renditionsDir || libraryConfig(loadConfig(root)).renditionsDir)
  const resolved = path.resolve(root, row.path)
  if (!isInsideRoot(resolved, base)) return null
  return resolved
}

// ---------------------------------------------------------------------------
// Proposals: agents propose, a person decides, the decision is the learning signal.

export function proposeForAsset(db, args = {}) {
  const assetId = resolveAssetId(db, args.assetId || args.asset_id || args.asset)
  if (!assetId) throw new Error('Asset not found for proposal')
  const kind = String(args.kind || '')
  if (!PROPOSAL_KINDS.includes(kind)) throw new Error(`Unknown proposal kind: ${kind}. Use ${PROPOSAL_KINDS.join(', ')}`)
  const payload = normalizeProposalPayload(kind, args.payload || {})
  const rule = String(args.rule || 'manual')
  const proposal = {
    proposalId: stableId('prp', `${assetId}:${kind}:${rule}:${JSON.stringify(payload)}`),
    assetId,
    kind,
    rule,
    payload,
    rationale: args.rationale || null,
    proposedBy: args.proposedBy || args.proposed_by || 'agent',
  }
  if (args.execute !== true) return { dryRun: true, wouldPropose: proposal }
  const existing = db.prepare('SELECT status FROM asset_proposal WHERE proposal_id = ?').get(proposal.proposalId)
  if (existing) return { dryRun: false, duplicate: true, proposal, status: existing.status }
  db.prepare(`
INSERT INTO asset_proposal (proposal_id, asset_id, kind, rule, payload_json, rationale, proposed_by, status, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`).run(
    proposal.proposalId, assetId, kind, rule, JSON.stringify(payload), proposal.rationale, proposal.proposedBy, nowIso(),
  )
  recordProvenance(db, { assetId, eventType: 'proposal-opened', actor: proposal.proposedBy, source: rule, payload: { proposalId: proposal.proposalId, kind, payload } })
  return { dryRun: false, proposal, status: 'open' }
}

function normalizeProposalPayload(kind, payload) {
  if (kind === 'rank') {
    const rating = Number(payload.rating)
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new Error('rank proposal needs an integer rating 0-5')
    return { rating }
  }
  if (kind === 'set') {
    const name = String(payload.name || '').trim()
    if (!name) throw new Error('set proposal needs a name')
    return { name }
  }
  if (kind === 'tags') {
    const tags = [...new Set((payload.tags || []).map(t => String(t).trim().toLowerCase()).filter(Boolean))]
    if (!tags.length) throw new Error('tags proposal needs at least one tag')
    return { tags }
  }
  const rights = String(payload.rights || '')
  if (!RIGHTS_VALUES.has(rights)) throw new Error(`rights proposal needs one of ${[...RIGHTS_VALUES].join(', ')}`)
  return { rights }
}

export function listProposals(db, options = {}) {
  const where = []
  const params = []
  if (options.assetId) { where.push('asset_id = ?'); params.push(options.assetId) }
  if (options.status !== 'all') { where.push('status = ?'); params.push(options.status || 'open') }
  const rows = db.prepare(`SELECT * FROM asset_proposal ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, Math.min(Number(options.limit || 200), 1000))
  return rows.map(row => ({ ...row, payload: safeJson(row.payload_json, {}), payload_json: undefined }))
}

/**
 * Accept or dismiss. Accept applies rank, set, or tags. A rights proposal is applied
 * only when the caller passes allowRights (the operator screen, or MCP with
 * VIS_ENABLE_RIGHTS=1). Accept never publishes.
 */
export function decideProposal(db, args = {}) {
  const proposalId = args.proposalId || args.proposal_id
  const decision = args.decision
  if (!['accepted', 'dismissed'].includes(decision)) throw new Error('decision must be accepted or dismissed')
  const row = db.prepare('SELECT * FROM asset_proposal WHERE proposal_id = ?').get(proposalId)
  if (!row) throw new Error(`Proposal not found: ${proposalId}`)
  if (row.status !== 'open') return { dryRun: false, unchanged: true, status: row.status }
  const payload = safeJson(row.payload_json, {})
  if (decision === 'accepted' && row.kind === 'rights' && args.allowRights !== true) {
    return { dryRun: true, refused: true, reason: 'Rights changes need a person. Use the operator screen, or restart MCP with VIS_ENABLE_RIGHTS=1 for this call.' }
  }
  const decidedBy = args.decidedBy || args.decided_by || 'person'
  if (args.execute !== true) return { dryRun: true, wouldDecide: { proposalId, decision, kind: row.kind, payload } }

  const ts = nowIso()
  db.exec('BEGIN')
  try {
    if (decision === 'accepted') applyProposal(db, row, payload, decidedBy, ts)
    db.prepare('UPDATE asset_proposal SET status = ?, decided_by = ?, decided_at = ? WHERE proposal_id = ?').run(decision, decidedBy, ts, proposalId)
    recordProvenance(db, {
      assetId: row.asset_id,
      eventId: stableId('prov', `${proposalId}:${decision}`),
      eventType: `proposal-${decision}`,
      actor: decidedBy,
      source: row.rule,
      payload: { proposalId, kind: row.kind, payload },
    })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { dryRun: false, proposalId, status: decision, published: false }
}

function applyProposal(db, row, payload, decidedBy, ts) {
  const ensureAnnotation = () => db.prepare(`
INSERT INTO asset_annotation (asset_id, updated_by, updated_at) VALUES (?, ?, ?)
ON CONFLICT(asset_id) DO UPDATE SET updated_by = excluded.updated_by, updated_at = excluded.updated_at`).run(row.asset_id, decidedBy, ts)
  if (row.kind === 'rank') {
    ensureAnnotation()
    db.prepare('UPDATE asset_annotation SET rating = ? WHERE asset_id = ?').run(payload.rating, row.asset_id)
  } else if (row.kind === 'tags') {
    ensureAnnotation()
    const current = safeJson(db.prepare('SELECT custom_tags_json FROM asset_annotation WHERE asset_id = ?').get(row.asset_id)?.custom_tags_json, [])
    const next = [...new Set([...current, ...payload.tags])]
    db.prepare('UPDATE asset_annotation SET custom_tags_json = ? WHERE asset_id = ?').run(JSON.stringify(next), row.asset_id)
  } else if (row.kind === 'set') {
    const collectionId = stableId('col', `set:${payload.name}`)
    db.prepare(`
INSERT INTO collection (collection_id, name, type, status, created_at, updated_at) VALUES (?, ?, 'set', 'draft', ?, ?)
ON CONFLICT(collection_id) DO UPDATE SET updated_at = excluded.updated_at`).run(collectionId, payload.name, ts, ts)
    db.prepare('INSERT OR IGNORE INTO collection_item (collection_id, asset_id) VALUES (?, ?)').run(collectionId, row.asset_id)
  } else if (row.kind === 'rights') {
    setRights(db, { assetId: row.asset_id, rights: payload.rights, decidedBy, ts, inTransaction: true })
  }
}

/** Direct rights change by a person. Callers outside the operator screen must gate this. */
export function setRights(db, { assetId, rights, decidedBy = 'person', notes = null, ts = nowIso(), inTransaction = false }) {
  if (!RIGHTS_VALUES.has(rights)) throw new Error(`Unknown rights value: ${rights}`)
  const work = () => {
    db.prepare('UPDATE asset SET rights_status = ? WHERE asset_id = ?').run(rights, assetId)
    db.prepare('INSERT INTO rights_record (rights_id, asset_id, status, notes, created_at) VALUES (?, ?, ?, ?, ?)').run(
      stableId('rgt', `${assetId}:${rights}:${ts}`), assetId, rights, notes || `set by ${decidedBy}`, ts,
    )
    recordProvenance(db, { assetId, eventType: 'rights-set', actor: decidedBy, source: 'vis-library', payload: { rights }, eventId: stableId('prov', `${assetId}:rights-set:${rights}:${ts}`) })
  }
  if (inTransaction) return work()
  db.exec('BEGIN')
  try { work(); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error }
}

/** Accept/dismiss history per rule. The proposer reads this before proposing again. */
export function proposalStats(db) {
  const rows = db.prepare(`
SELECT rule, kind,
  SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
  SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed,
  SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open
FROM asset_proposal GROUP BY rule, kind ORDER BY rule, kind`).all()
  return rows.map(r => {
    const decided = r.accepted + r.dismissed
    return { ...r, decided, acceptRate: decided ? r.accepted / decided : null, muted: isMuted(r) }
  })
}

function isMuted(stat) {
  const decided = stat.accepted + stat.dismissed
  return decided >= 5 && stat.dismissed / decided >= 0.8
}

/**
 * Built-in proposer. One rule today: the first folder under a library root is a
 * likely set name. A rule the person keeps dismissing (>=80% of >=5) is muted.
 */
export function suggestProposals(db, options = {}) {
  const stats = new Map(proposalStats(db).map(s => [`${s.rule}:${s.kind}`, s]))
  const rule = 'folder-set'
  if (stats.get(`${rule}:set`)?.muted) return { rule, muted: true, proposed: [] }
  const rows = db.prepare(`
SELECT f.asset_id, f.absolute_path, f.root_label FROM library_file_state f
WHERE NOT EXISTS (SELECT 1 FROM asset_proposal p WHERE p.asset_id = f.asset_id AND p.rule = ?)
ORDER BY f.seen_at DESC LIMIT ?`).all(rule, Math.min(Number(options.limit || 50), 500))
  const proposed = []
  const seen = new Set()
  for (const row of rows) {
    if (seen.has(row.asset_id)) continue
    seen.add(row.asset_id)
    const name = setNameFor(row.absolute_path, row.root_label, options.roots || [])
    if (!name) continue
    proposed.push(proposeForAsset(db, {
      assetId: row.asset_id, kind: 'set', rule, payload: { name },
      rationale: `The file sits in ${name}`,
      proposedBy: 'vis-proposer', execute: options.execute === true,
    }))
  }
  return { rule, muted: false, proposed }
}

function setNameFor(filePath, rootLabel, roots) {
  const root = roots.find(r => r.label === rootLabel)
  const rel = root ? path.relative(root.path, filePath) : null
  // Two folders deep: "animelegends/character-lab-2026-09-01" separates a shoot from its brand.
  const dirs = rel ? rel.split(path.sep).slice(0, -1) : []
  if (!dirs.length) return null
  return `${rootLabel}/${dirs.slice(0, 2).join('/')}`
}

// ---------------------------------------------------------------------------

function freeDiskGB(dir) {
  try {
    let probe = dir
    while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe)
    const s = fs.statfsSync(probe)
    return (s.bavail * s.bsize) / 1024 ** 3
  } catch {
    return null
  }
}

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`
}

function nowIso() {
  return new Date().toISOString()
}

function slash(value) {
  return String(value).replaceAll('\\', '/')
}

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback } catch { return fallback }
}
