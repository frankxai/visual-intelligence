/**
 * Ingest public media files from Starlight-Intelligence-System/site/public/assets
 * into vis.sqlite without hardcoding workstation paths or overwriting existing rights.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pathToFileURL } from 'url'
import { openVisDatabase, stableId } from '../core/vis-core.mjs'

export function resolveSisPublicDir(projectRoot = process.cwd(), overrideDir = null) {
  if (overrideDir) return path.resolve(overrideDir)
  if (process.env.SIS_PUBLIC_DIR) return path.resolve(process.env.SIS_PUBLIC_DIR)
  return path.resolve(projectRoot, '../Starlight-Intelligence-System/site/public/assets')
}

function scanMediaFiles(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      results.push(...scanMediaFiles(full))
    } else if (/\.(png|jpe?g|webp|svg|mp4)$/i.test(full)) {
      results.push(full)
    }
  }
  return results
}

export function ingestSisPublicAssets(db, sisPublicDir, options = {}) {
  const mediaFiles = scanMediaFiles(sisPublicDir)
  const now = options.now || new Date().toISOString()
  const sisRepoRoot = path.resolve(sisPublicDir, '../../..')

  const insertAsset = db.prepare(`
    INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, 'starlight-public', 'cosmic', ?, 'unknown', 'candidate', ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at
  `)

  const insertVersion = db.prepare(`
    INSERT INTO asset_version (version_id, asset_id, sha256, media_type, mime_type, extension, byte_size, width, height, duration_seconds, created_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
    ON CONFLICT(version_id) DO UPDATE SET
      byte_size = excluded.byte_size
  `)

  const insertLocation = db.prepare(`
    INSERT INTO asset_location (location_id, asset_id, version_id, root, absolute_path, relative_path, public_path, repo, storage_kind, is_primary, seen_at, exists_now)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Starlight-Intelligence-System', 'local', 1, ?, 1)
    ON CONFLICT(location_id) DO UPDATE SET
      exists_now = 1,
      seen_at = excluded.seen_at
  `)

  const insertAnnot = db.prepare(`
    INSERT OR IGNORE INTO asset_annotation (asset_id, rating, color_label, curation_status, notes, custom_tags_json, updated_by, updated_at)
    VALUES (?, NULL, NULL, 'uncurated', NULL, ?, 'vis-index-sis', ?)
  `)

  db.exec('BEGIN TRANSACTION')
  let ingestedCount = 0
  try {
    for (const filePath of mediaFiles) {
      const buf = fs.readFileSync(filePath)
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase()
      const assetId = `asset_${sha256.slice(0, 24)}`
      const versionId = `ver_${sha256.slice(0, 32)}`
      const ext = path.extname(filePath).toLowerCase()
      const mediaType = ext === '.mp4' ? 'video' : 'image'
      const mimeType = ext === '.mp4' ? 'video/mp4' : ext === '.svg' ? 'image/svg+xml' : `image/${ext.replace('.', '').replace('jpg', 'jpeg')}`
      const filename = path.basename(filePath, ext)
      const absPath = path.resolve(filePath)
      const relPath = path.relative(sisRepoRoot, absPath).replace(/\\/g, '/')
      const publicPath = `/${relPath.replace(/^site\/public\//, '')}`
      const locId = stableId('loc', absPath)
      const stats = fs.statSync(absPath)
      const tags = ['brand:sis', 'site:public', path.basename(path.dirname(absPath))]

      insertAsset.run(
        assetId,
        mediaType,
        filename,
        relPath,
        sha256,
        JSON.stringify(tags),
        now,
        now,
      )

      insertVersion.run(
        versionId,
        assetId,
        sha256,
        mediaType,
        mimeType,
        ext,
        stats.size,
        now,
        JSON.stringify({ repo: 'Starlight-Intelligence-System', surface: 'public' }),
      )

      insertLocation.run(
        locId,
        assetId,
        versionId,
        sisRepoRoot,
        absPath,
        relPath,
        publicPath,
        now,
      )

      insertAnnot.run(assetId, JSON.stringify(tags), now)
      ingestedCount++
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  return {
    status: 'SUCCESS',
    sisPublicDir,
    ingestedCount,
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  const root = process.cwd()
  const db = openVisDatabase(root, { indexPath: 'data/vis.sqlite' })
  const dir = resolveSisPublicDir(root, process.argv[2] || null)
  const summary = ingestSisPublicAssets(db, dir)
  console.log(JSON.stringify(summary, null, 2))
}
