/**
 * Reconcile rights_status = 'generated-owned' strictly for assets with a verified
 * generation receipt (generation_event row or valid .vis.provenance.json sidecar).
 *
 * Never matches by substring (e.g., never flips 'analysis' or 'thesis' via LIKE '%sis%')
 * and never overwrites existing rights_status or rights_record rows.
 */

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { openVisDatabase, stableId } from '../core/vis-core.mjs'

export function findVerifiedSidecar(filePath) {
  if (!filePath || typeof filePath !== 'string') return null
  const candidates = [
    `${filePath}.vis.provenance.json`,
    path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}.vis.provenance.json`),
  ]
  for (const sidecar of candidates) {
    if (!fs.existsSync(sidecar)) continue
    try {
      const parsed = JSON.parse(fs.readFileSync(sidecar, 'utf8'))
      if (parsed && typeof parsed === 'object' && (parsed.model || parsed.generator || parsed.sha256 || parsed.prompt_hash)) {
        return { sidecarPath: sidecar, receipt: parsed }
      }
    } catch {}
  }
  return null
}

export function reconcileVerifiedFirstPartyRights(db, options = {}) {
  const now = options.now || new Date().toISOString()

  const unknownAssets = db.prepare(`
    SELECT a.asset_id, a.primary_path
    FROM asset a
    WHERE a.rights_status = 'unknown'
  `).all()

  const genEvents = new Set(
    db.prepare('SELECT DISTINCT asset_id FROM generation_event').all().map(r => r.asset_id),
  )

  const locStmt = db.prepare('SELECT absolute_path FROM asset_location WHERE asset_id = ?')
  const updateAsset = db.prepare(`
    UPDATE asset SET rights_status = 'generated-owned'
    WHERE asset_id = ? AND rights_status = 'unknown'
  `)
  const insertRightsIfAbsent = db.prepare(`
    INSERT INTO rights_record (rights_id, asset_id, status, license, owner, source_url, notes, created_at)
    SELECT ?, ?, 'generated-owned', 'Proprietary / First-Party Generated', 'Frank / Starlight Ecosystem', ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM rights_record WHERE asset_id = ?)
  `)

  let updatedFromGenerationEvent = 0
  let updatedFromSidecar = 0
  let skippedUnverified = 0

  db.exec('BEGIN TRANSACTION')
  try {
    for (const asset of unknownAssets) {
      if (genEvents.has(asset.asset_id)) {
        updateAsset.run(asset.asset_id)
        insertRightsIfAbsent.run(
          stableId('rights', asset.asset_id),
          asset.asset_id,
          asset.primary_path || 'generation_event',
          'Verified via generation_event receipt in vis.sqlite',
          now,
          asset.asset_id,
        )
        updatedFromGenerationEvent++
        continue
      }

      const locs = locStmt.all(asset.asset_id)
      let verifiedSidecar = null
      for (const l of locs) {
        verifiedSidecar = findVerifiedSidecar(l.absolute_path)
        if (verifiedSidecar) break
      }

      if (verifiedSidecar) {
        updateAsset.run(asset.asset_id)
        insertRightsIfAbsent.run(
          stableId('rights', asset.asset_id),
          asset.asset_id,
          verifiedSidecar.sidecarPath,
          'Verified via .vis.provenance.json sidecar receipt',
          now,
          asset.asset_id,
        )
        updatedFromSidecar++
      } else {
        skippedUnverified++
      }
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  return {
    status: 'SUCCESS',
    checkedUnknownCount: unknownAssets.length,
    updatedFromGenerationEvent,
    updatedFromSidecar,
    totalUpdated: updatedFromGenerationEvent + updatedFromSidecar,
    skippedUnverified,
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  const db = openVisDatabase(process.cwd(), { indexPath: 'data/vis.sqlite' })
  const summary = reconcileVerifiedFirstPartyRights(db)
  console.log(JSON.stringify(summary, null, 2))
}
