import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openVisDatabase } from '../core/vis-core.mjs'
import { absorbLedgerIntoDb } from '../scripts/absorb-ledger.mjs'
import { attributeBrandsInDb, determineBrandFromInputs } from '../scripts/attribute-brands.mjs'
import { reconcileVerifiedFirstPartyRights } from '../scripts/update-first-party-rights.mjs'
import { ingestSisPublicAssets } from '../scripts/ingest-sis-public.mjs'
import { runMetadataTriageAndExport, triageAssetMetadata } from '../scripts/evaluate-and-export.mjs'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2mVxwAAAABJRU5ErkJggg==',
  'base64',
)

function cleanupTmp(db, dir) {
  try {
    if (db) db.close()
  } catch {}
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  } catch {}
}

test('absorb-ledger skips missing files without phantom ledger:// rows and preserves existing rights_record', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-living-ledger-'))
  let db = null
  try {
    db = openVisDatabase(tmp, { indexPath: 'vis.sqlite' })
    const realImg = path.join(tmp, 'queen-hero.png')
    fs.writeFileSync(realImg, PNG_1X1)

    const existingSha = 'a'.repeat(64)
    const existingId = `asset_${existingSha.slice(0, 24)}`
    db.prepare(`
      INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
      VALUES (?, 'image', 'licensed-photo', 'licensed.png', ?, 'photo', 'warm', '[]', 'licensed', 'approved', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')
    `).run(existingId, existingSha)
    db.prepare(`
      INSERT INTO asset_version (version_id, asset_id, sha256, media_type, mime_type, extension, byte_size, created_at, metadata_json)
      VALUES (?, ?, ?, 'image', 'image/png', '.png', 100, '2026-11-01T00:00:00Z', '{}')
    `).run(`ver_${existingSha.slice(0, 32)}`, existingId, existingSha)
    db.prepare(`
      INSERT INTO rights_record (rights_id, asset_id, status, license, owner, source_url, notes, created_at)
      VALUES (?, ?, 'licensed', 'CC-BY-4.0', 'External Photographer', 'https://example.com', 'Human verified', '2026-11-01T00:00:00Z')
    `).run(`rights_${existingId}`, existingId)

    const ledgerFile = path.join(tmp, 'ledger.jsonl')
    const lines = [
      JSON.stringify({ image_path: realImg, prompt: 'Celestial observatory', model: 'gemini-3-image' }),
      JSON.stringify({ image_path: path.join(tmp, 'missing-phantom.png'), prompt: 'Missing file' }),
      JSON.stringify({ sha256: existingSha, image_path: 'licensed.png', prompt: 'Should not overwrite licensed rights' }),
    ]
    fs.writeFileSync(ledgerFile, lines.join('\n'), 'utf8')

    const res = absorbLedgerIntoDb(db, ledgerFile)
    assert.equal(res.newlyIndexed, 1)
    assert.equal(res.alreadyIndexed, 1)
    assert.equal(res.skippedMissingCount, 1)

    const allAssets = db.prepare('SELECT asset_id, primary_path, rights_status FROM asset').all()
    assert.equal(allAssets.length, 2)
    assert.ok(!allAssets.some(a => String(a.primary_path).startsWith('ledger://') || String(a.primary_path).startsWith('virtual/')))

    const preserved = db.prepare('SELECT rights_status FROM asset WHERE asset_id = ?').get(existingId)
    assert.equal(preserved.rights_status, 'licensed')
    const rightsRows = db.prepare('SELECT license, owner FROM rights_record WHERE asset_id = ?').all(existingId)
    assert.equal(rightsRows.length, 1)
    assert.equal(rightsRows[0].owner, 'External Photographer')
  } finally {
    cleanupTmp(db, tmp)
  }
})

test('attribute-brands uses strict segment rules and never defaults unmatched paths to starlight', () => {
  assert.deepEqual(
    determineBrandFromInputs({ primaryPath: 'docs/thesis-analysis/community-finance-review.png' }),
    { brand: null, source: 'unmatched' },
  )
  assert.deepEqual(
    determineBrandFromInputs({ primaryPath: 'C:/repos/Starlight-Intelligence-System/site/public/queen/hero.jpg' }),
    { brand: 'sis', source: 'path' },
  )

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-living-brands-'))
  let db = null
  try {
    db = openVisDatabase(tmp, { indexPath: 'vis.sqlite' })
    db.prepare(`
      INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
      VALUES
        ('asset_1', 'image', 'sis-hero', 'Starlight-Intelligence-System/site/public/hero.png', 'h1', 'hero', 'cosmic', '[]', 'unknown', 'candidate', '2026-11-04T00:00:00Z', '2026-11-04T00:00:00Z'),
        ('asset_2', 'image', 'random-doc', 'notes/business-review-thesis.png', 'h2', 'doc', 'neutral', '[]', 'unknown', 'candidate', '2026-11-04T00:00:00Z', '2026-11-04T00:00:00Z')
    `).run()

    const summary = attributeBrandsInDb(db)
    assert.equal(summary.attributedCount, 1)
    assert.equal(summary.unattributedCount, 1)
    assert.equal(summary.brandCounts.sis, 1)
    assert.equal(summary.brandCounts.starlight, undefined)

    const unmatched = db.prepare('SELECT tags_json FROM asset WHERE asset_id = ?').get('asset_2')
    assert.equal(unmatched.tags_json, '[]')
  } finally {
    cleanupTmp(db, tmp)
  }
})

test('update-first-party-rights requires generation_event or verified sidecar and never matches substring sis', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-living-rights-'))
  let db = null
  try {
    db = openVisDatabase(tmp, { indexPath: 'vis.sqlite' })
    const sidecarAssetImg = path.join(tmp, 'verified-plate.png')
    fs.writeFileSync(sidecarAssetImg, PNG_1X1)
    fs.writeFileSync(`${sidecarAssetImg}.vis.provenance.json`, JSON.stringify({ model: 'gemini-3-image', sha256: 'b'.repeat(64) }))

    db.prepare(`
      INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
      VALUES
        ('asset_thesis', 'image', 'thesis', 'research/thesis-analysis.png', 'h1', 'doc', 'neutral', '[]', 'unknown', 'candidate', '2026-11-04T00:00:00Z', '2026-11-04T00:00:00Z'),
        ('asset_sidecar', 'image', 'plate', 'verified-plate.png', 'h2', 'art', 'cosmic', '[]', 'unknown', 'candidate', '2026-11-04T00:00:00Z', '2026-11-04T00:00:00Z')
    `).run()
    db.prepare(`
      INSERT INTO asset_version (version_id, asset_id, sha256, media_type, mime_type, extension, byte_size, created_at, metadata_json)
      VALUES ('ver_sidecar', 'asset_sidecar', 'h2', 'image', 'image/png', '.png', 68, '2026-11-04T00:00:00Z', '{}')
    `).run()
    db.prepare(`
      INSERT INTO asset_location (location_id, asset_id, version_id, root, absolute_path, relative_path, public_path, repo, storage_kind, is_primary, seen_at, exists_now)
      VALUES ('loc_sidecar', 'asset_sidecar', 'ver_sidecar', ?, ?, 'verified-plate.png', NULL, 'test', 'local', 1, '2026-11-04T00:00:00Z', 1)
    `).run(tmp, sidecarAssetImg)

    const summary = reconcileVerifiedFirstPartyRights(db)
    assert.equal(summary.updatedFromSidecar, 1)
    assert.equal(summary.skippedUnverified, 1)

    const thesis = db.prepare('SELECT rights_status FROM asset WHERE asset_id = ?').get('asset_thesis')
    const sidecar = db.prepare('SELECT rights_status FROM asset WHERE asset_id = ?').get('asset_sidecar')
    assert.equal(thesis.rights_status, 'unknown')
    assert.equal(sidecar.rights_status, 'generated-owned')
  } finally {
    cleanupTmp(db, tmp)
  }
})

test('evaluate-and-export records independent:false, null unrecorded model/r2_url, and preserves human approval_status', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-living-eval-'))
  let db = null
  try {
    db = openVisDatabase(tmp, { indexPath: 'vis.sqlite' })
    const sisAssetsDir = path.join(tmp, 'Starlight-Intelligence-System', 'site', 'public', 'assets', 'queen-premium')
    fs.mkdirSync(sisAssetsDir, { recursive: true })
    fs.writeFileSync(path.join(sisAssetsDir, 'galaxy-deep-field.png'), Buffer.alloc(32000, 1))

    const ingestRes = ingestSisPublicAssets(db, path.join(tmp, 'Starlight-Intelligence-System', 'site', 'public', 'assets'))
    assert.equal(ingestRes.ingestedCount, 1)

    const row = db.prepare('SELECT asset_id FROM asset').get()
    db.prepare("UPDATE asset SET approval_status = 'rejected-by-human' WHERE asset_id = ?").run(row.asset_id)

    const outJson = path.join(tmp, 'catalog.json')
    const evalRes = runMetadataTriageAndExport(db, { exportPath: outJson })
    assert.equal(evalRes.evaluatedCount, 1)

    const item = evalRes.catalog[0]
    assert.equal(item.model, null)
    assert.equal(item.r2_url, null)
    assert.equal(item.r2_promoted, false)
    assert.equal(item.provenance.independent, false)
    assert.equal(item.provenance.visual_inspection, false)

    const evalDbRow = db.prepare('SELECT evaluator, metadata_json FROM eval_record WHERE asset_id = ?').get(row.asset_id)
    assert.equal(evalDbRow.evaluator, 'vis-metadata-triage')
    const meta = JSON.parse(evalDbRow.metadata_json)
    assert.equal(meta.independent, false)
    assert.equal(meta.visual_inspection, false)

    const afterAsset = db.prepare('SELECT approval_status, rights_status FROM asset WHERE asset_id = ?').get(row.asset_id)
    assert.equal(afterAsset.approval_status, 'rejected-by-human')
    assert.equal(afterAsset.rights_status, 'unknown')

    const direct = triageAssetMetadata({ primary_path: 'slop-test.png', byte_size: 1000 })
    assert.equal(direct.role, 'quarantine')
  } finally {
    cleanupTmp(db, tmp)
  }
})
