/**
 * Absorb verified rows from image-generation-ledger.jsonl into vis.sqlite.
 *
 * Guarantees:
 * - Zero dependency on unmerged local modules (uses ../core/vis-core.mjs only).
 * - Never creates phantom ledger:// assets when files are missing on disk by default.
 * - Never overwrites an existing rights_record or human/non-unknown rights_status.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pathToFileURL } from 'url'
import { openVisDatabase, stableId } from '../core/vis-core.mjs'

const PATH_KEYS = [
  'image_path', 'path', 'asset_path', 'local_asset_path', 'localPath',
  'imagePath', 'local_image_path', 'assetPath', 'file', 'artifact_path',
  'localArtifactPath', 'original_asset_path', 'assetMirror', 'source_file', 'review_path',
]

const NESTED_PATH_KEYS = ['path', 'local_path', 'localPath', 'absolute_path', 'file', 'image_path']
const SHA_KEYS = [
  'sha256', 'image_sha256', 'imageSha256', 'asset_sha256', 'assetSha256',
  'artifact_sha256', 'artifactSha256', 'captureSha256',
]

export function defaultLedgerPath(projectRoot = process.cwd()) {
  if (process.env.STARLIGHT_LEDGER_PATH) return path.resolve(process.env.STARLIGHT_LEDGER_PATH)
  return path.resolve(projectRoot, '../../logs/image-generation-ledger.jsonl')
}

export function readJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, rows: [], unparseable: 0 }
  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const rows = []
  let unparseable = 0
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    try {
      rows.push({ line: i + 1, row: JSON.parse(trimmed) })
    } catch {
      unparseable++
    }
  }
  return { exists: true, rows, unparseable }
}

export function resolveRowPath(row) {
  if (!row || typeof row !== 'object') return null
  for (const k of PATH_KEYS) {
    if (typeof row[k] === 'string' && row[k].trim()) return row[k].trim()
  }
  if (Array.isArray(row.files) && typeof row.files[0] === 'string' && row.files[0].trim()) {
    return row.files[0].trim()
  }
  for (const k of ['image', 'asset', 'artifact', 'generated']) {
    const val = row[k]
    if (typeof val === 'string' && val.trim()) return val.trim()
    if (val && typeof val === 'object') {
      for (const nested of NESTED_PATH_KEYS) {
        if (typeof val[nested] === 'string' && val[nested].trim()) return val[nested].trim()
      }
    }
  }
  return null
}

export function resolveRecordedSha256(row) {
  if (!row || typeof row !== 'object') return null
  for (const k of SHA_KEYS) {
    const v = row[k]
    if (typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v)) return v.toLowerCase()
  }
  if (row.source_hashes && typeof row.source_hashes === 'object') {
    const first = Object.values(row.source_hashes).find(v => typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v))
    if (first) return first.toLowerCase()
  }
  return null
}

function normPath(p) {
  return String(p || '').replace(/\\/g, '/').toLowerCase()
}

function safeString(val, fallback = null) {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    return val.harness || val.coding_agent || val.agent || val.name || JSON.stringify(val)
  }
  return String(val)
}

export function absorbLedgerIntoDb(db, ledgerPath, options = {}) {
  const ledger = readJsonlFile(ledgerPath)
  if (!ledger.exists) {
    throw new Error(`Ledger file does not exist at ${ledgerPath}`)
  }

  const now = options.now || new Date().toISOString()
  const bySha = new Map()
  const versionSha = new Map()
  for (const r of db.prepare('SELECT version_id, asset_id, sha256 FROM asset_version').all()) {
    if (r.sha256) {
      const s = r.sha256.toLowerCase()
      bySha.set(s, r.asset_id)
      versionSha.set(r.version_id, s)
    }
  }
  const byPath = new Map()
  for (const r of db.prepare('SELECT absolute_path, relative_path, asset_id, version_id FROM asset_location').all()) {
    const info = { assetId: r.asset_id, sha: versionSha.get(r.version_id) || null }
    if (r.absolute_path) byPath.set(normPath(r.absolute_path), info)
    if (r.relative_path) byPath.set(normPath(r.relative_path), info)
  }

  const updateUnknownRights = db.prepare(`
    UPDATE asset
    SET rights_status = 'generated-owned'
    WHERE asset_id = ? AND (rights_status IS NULL OR rights_status = 'unknown')
  `)

  const insertRightsRecordIfAbsent = db.prepare(`
    INSERT INTO rights_record (rights_id, asset_id, status, license, owner, source_url, notes, created_at)
    SELECT ?, ?, 'generated-owned', 'Proprietary / First-Party Generated', 'Frank / Starlight Ecosystem', ?, 'Verified generation receipt in image-generation-ledger.jsonl', ?
    WHERE NOT EXISTS (SELECT 1 FROM rights_record WHERE asset_id = ?)
  `)

  const insertAsset = db.prepare(`
    INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
    VALUES (?, 'image', ?, ?, ?, ?, ?, ?, 'generated-owned', 'candidate', ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET
      rights_status = CASE WHEN asset.rights_status IS NULL OR asset.rights_status = 'unknown' THEN 'generated-owned' ELSE asset.rights_status END,
      primary_path = COALESCE(asset.primary_path, excluded.primary_path),
      last_seen_at = excluded.last_seen_at
  `)

  const insertVersion = db.prepare(`
    INSERT INTO asset_version (version_id, asset_id, sha256, media_type, mime_type, extension, byte_size, width, height, duration_seconds, created_at, metadata_json)
    VALUES (?, ?, ?, 'image', ?, ?, ?, NULL, NULL, NULL, ?, ?)
    ON CONFLICT(version_id) DO UPDATE SET
      byte_size = COALESCE(asset_version.byte_size, excluded.byte_size)
  `)

  const insertLocation = db.prepare(`
    INSERT INTO asset_location (location_id, asset_id, version_id, root, absolute_path, relative_path, public_path, repo, storage_kind, is_primary, seen_at, exists_now)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 'starlight', 'local', 1, ?, 1)
    ON CONFLICT(location_id) DO UPDATE SET
      exists_now = 1,
      seen_at = excluded.seen_at
  `)

  const insertPrompt = db.prepare(`
    INSERT OR IGNORE INTO prompt (prompt_id, asset_id, source_path, prompt_text, negative_prompt, model_hint, settings_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertGenEvent = db.prepare(`
    INSERT OR IGNORE INTO generation_event (event_id, asset_id, version_id, prompt_id, model, provider, seed, settings_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertProvEvent = db.prepare(`
    INSERT OR IGNORE INTO provenance_event (provenance_event_id, asset_id, version_id, event_type, actor, source, payload_json, created_at)
    VALUES (?, ?, ?, 'ledger-absorbed', ?, ?, ?, ?)
  `)

  let alreadyIndexed = 0
  let newlyIndexed = 0
  let skippedMissingCount = 0

  db.exec('BEGIN TRANSACTION')
  try {
    for (const entry of ledger.rows) {
      const row = entry.row
      const rawPath = resolveRowPath(row)
      const recordedSha = resolveRecordedSha256(row)

      let matchedAssetId = null
      if (recordedSha && bySha.has(recordedSha)) {
        matchedAssetId = bySha.get(recordedSha)
      } else if (rawPath) {
        const atPath = byPath.get(normPath(rawPath)) || byPath.get(normPath(path.resolve(rawPath)))
        if (atPath && (!recordedSha || !atPath.sha || atPath.sha === recordedSha)) {
          matchedAssetId = atPath.assetId
        }
      }

      const timestamp = safeString(row.timestamp || row.created_at, now)

      if (matchedAssetId) {
        alreadyIndexed++
        updateUnknownRights.run(matchedAssetId)
        insertRightsRecordIfAbsent.run(stableId('rights', matchedAssetId), matchedAssetId, rawPath || 'ledger', timestamp, matchedAssetId)
        continue
      }

      // Never fabricate phantom ledger:// assets when the file does not exist on disk
      const absPath = rawPath ? path.resolve(rawPath) : null
      if (!absPath || !fs.existsSync(absPath)) {
        skippedMissingCount++
        continue
      }

      const stats = fs.statSync(absPath)
      if (!stats.isFile()) {
        skippedMissingCount++
        continue
      }

      const sha256 = recordedSha || crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex').toLowerCase()
      const assetId = `asset_${sha256.slice(0, 24)}`
      const versionId = `ver_${sha256.slice(0, 32)}`
      const ext = path.extname(absPath).toLowerCase() || '.png'
      const filename = path.basename(absPath, ext)
      const relPath = rawPath.replace(/\\/g, '/')
      const locId = stableId('loc', absPath)

      insertAsset.run(
        assetId,
        filename,
        relPath,
        sha256,
        safeString(row.category, 'generated'),
        safeString(row.mood, 'neutral'),
        JSON.stringify(Array.isArray(row.tags) ? row.tags : []),
        timestamp,
        now,
      )

      insertVersion.run(
        versionId,
        assetId,
        sha256,
        `image/${ext.replace('.', '')}`,
        ext,
        stats.size,
        timestamp,
        JSON.stringify({ model: safeString(row.model), provider: safeString(row.provider), line: entry.line }),
      )

      insertLocation.run(
        locId,
        assetId,
        versionId,
        path.dirname(absPath),
        absPath,
        relPath,
        now,
      )

      const promptText = safeString(row.prompt || (row.generation && row.generation.prompt))
      let promptId = null
      if (promptText) {
        promptId = stableId('prompt', `${assetId}:${promptText}`)
        insertPrompt.run(
          promptId,
          assetId,
          safeString(row.sidecar_path || rawPath),
          promptText,
          safeString(row.negative_prompt),
          safeString(row.model),
          JSON.stringify(row.settings || {}),
          timestamp,
        )
      }

      insertGenEvent.run(
        stableId('gen', `${assetId}:${entry.line}:${timestamp}`),
        assetId,
        versionId,
        promptId,
        safeString(row.model || (row.generation && row.generation.model)),
        safeString(row.provider || (row.generation && row.generation.provider)),
        row.seed !== undefined && row.seed !== null ? String(row.seed) : null,
        JSON.stringify(row.generation || {}),
        timestamp,
      )

      insertProvEvent.run(
        stableId('prov', `${assetId}:ledger-absorbed:${entry.line}`),
        assetId,
        versionId,
        safeString(row.agent || row.agent_session, 'image-generation-ledger'),
        rawPath,
        JSON.stringify({ line: entry.line, sha256 }),
        timestamp,
      )

      insertRightsRecordIfAbsent.run(stableId('rights', assetId), assetId, rawPath, timestamp, assetId)

      bySha.set(sha256, assetId)
      byPath.set(normPath(absPath), { assetId, sha: sha256 })
      newlyIndexed++
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  return {
    status: 'SUCCESS',
    totalLedgerRows: ledger.rows.length,
    unparseableRows: ledger.unparseable,
    alreadyIndexed,
    newlyIndexed,
    skippedMissingCount,
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  const root = process.cwd()
  const db = openVisDatabase(root, { indexPath: 'data/vis.sqlite' })
  const ledgerPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultLedgerPath(root)
  const summary = absorbLedgerIntoDb(db, ledgerPath)
  console.log(JSON.stringify(summary, null, 2))
}
