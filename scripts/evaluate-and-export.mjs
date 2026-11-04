/**
 * Heuristic Metadata Triage & Candidate Catalog Exporter.
 *
 * IMPORTANT:
 * - This script performs deterministic path/size/provenance metadata triage ONLY.
 * - It does NOT open or visually inspect rendered image pixels and therefore sets:
 *     independent: false
 *     visual_inspection: false
 *     same_provider: null
 *     reviewer_family: 'heuristic-metadata-triage'
 * - Flagship promotion still requires real rendered visual inspection and a cross-provider
 *   critique per the estate Generated Visual Gate (§5b).
 * - Never fabricates a default generation model or unbound public CDN URL (r2_url: null).
 * - Never overwrites human or previously decided approval_status values.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pathToFileURL } from 'url'
import { openVisDatabase, stableId } from '../core/vis-core.mjs'

export function triageAssetMetadata(asset) {
  const p = String(asset.primary_path || asset.relative_path || asset.absolute_path || '')
    .toLowerCase()
    .replace(/\\/g, '/')
  const filename = path.basename(p)
  const size = typeof asset.byte_size === 'number' ? asset.byte_size : 0

  let brand = null
  if (asset.tags_json) {
    try {
      const tags = JSON.parse(asset.tags_json)
      const bTag = Array.isArray(tags) ? tags.find(t => typeof t === 'string' && t.startsWith('brand:')) : null
      if (bTag) brand = bTag.slice('brand:'.length)
    } catch {}
  }
  if (!brand) {
    if (/(?:^|\/)starlight-intelligence-system(?:\/|$)|\/queen\/|\/field-notes\//.test(p)) brand = 'sis'
    else if (/(?:^|\/)starlight-technology(?:\/|$)/.test(p)) brand = 'starlight-technology'
    else if (/(?:^|\/)starlight/.test(p)) brand = 'starlight'
  }

  let brandFit = 3
  if (p.includes('queen-premium') || p.includes('memory-palace') || p.includes('field-notes') || p.includes('constellation')) {
    brandFit = 5
  } else if (p.includes('cinematic') || p.includes('architecture-flow') || p.includes('sip-layers')) {
    brandFit = 4
  }

  let craft = 4
  if (size > 0 && size < 25000 && !p.endsWith('.svg')) {
    craft = 2
  } else if (p.includes('queen-premium') || p.includes('cinematic') || p.includes('memory-palace')) {
    craft = 5
  }

  let typography = 4
  if (p.includes('starter_cover') || filename.includes('test') || filename.includes('mockup-bad')) {
    typography = 2
  }

  let lighting = 4
  if (p.includes('starter_cover')) lighting = 3

  let roleUtility = 4
  let role = 'editorial'
  if (p.includes('galaxy-deep-field') || p.includes('02-starlight-queen') || p.includes('03-advanced-3d')) {
    roleUtility = 5
    role = 'hero-candidate'
  } else if (p.includes('starter') || p.includes('scratch') || p.includes('tmp')) {
    roleUtility = 3
    role = 'study'
  }

  let provenanceScore = 3
  if (asset.rights_status === 'generated-owned' && asset.model) {
    provenanceScore = 5
  } else if (asset.rights_status === 'generated-owned') {
    provenanceScore = 4
  }

  if (filename.includes('slop') || filename.includes('corrupt') || filename.includes('bad') || (size > 0 && size < 5000 && !p.endsWith('.svg'))) {
    brandFit = 2
    craft = 2
    typography = 1
    lighting = 2
    roleUtility = 2
    provenanceScore = 2
    role = 'quarantine'
  }

  const totalScore = brandFit + craft + typography + lighting + roleUtility + provenanceScore

  let tier = 'Quarantine (<22)'
  let verdict = 'restart'
  let triageApproval = 'triage-quarantine'
  if (totalScore >= 28) {
    tier = 'Hero Candidate (28-30)'
    verdict = 'review-for-hero'
    triageApproval = 'triage-hero-candidate'
  } else if (totalScore >= 26) {
    tier = 'Editorial Candidate (26-27)'
    verdict = 'review-for-editorial'
    triageApproval = 'triage-editorial-candidate'
  } else if (totalScore >= 22) {
    tier = 'Study/R&D (22-25)'
    verdict = 'iterate'
    role = 'study'
    triageApproval = 'triage-study'
  }

  const critique = `Heuristic metadata triage (${totalScore}/30, tier: ${tier}). Scored from path, byte-size, and provenance records only — pixels were NOT visually inspected. Requires rendered export inspection and an independent cross-provider visual critique before public promotion.`

  return {
    score: totalScore,
    tier,
    verdict,
    role,
    brand,
    triageApproval,
    categoryScores: {
      brand_canon_fit: brandFit,
      craft_composition: craft,
      typography_overlay_cleanliness: typography,
      material_lighting_restraint: lighting,
      surface_role_utility: roleUtility,
      provenance_completeness: provenanceScore,
    },
    critique,
  }
}

export function runMetadataTriageAndExport(db, options = {}) {
  const now = options.now || new Date().toISOString()
  const exportPath = options.exportPath ? path.resolve(options.exportPath) : null

  const rows = db.prepare(`
    SELECT
      a.asset_id,
      a.media_type,
      a.title,
      a.primary_path,
      a.source_hash,
      a.tags_json,
      a.rights_status,
      a.approval_status,
      a.first_seen_at,
      v.sha256,
      v.byte_size,
      l.absolute_path,
      l.relative_path,
      p.prompt_text,
      g.model,
      g.provider
    FROM asset a
    LEFT JOIN asset_version v ON v.asset_id = a.asset_id
    LEFT JOIN asset_location l ON l.asset_id = a.asset_id
    LEFT JOIN prompt p ON p.asset_id = a.asset_id
    LEFT JOIN generation_event g ON g.asset_id = a.asset_id
    WHERE a.tags_json LIKE '%brand:sis%'
       OR a.tags_json LIKE '%brand:starlight%'
       OR a.tags_json LIKE '%brand:starlight-technology%'
  `).all()

  const uniqueAssets = new Map()
  for (const r of rows) {
    if (!uniqueAssets.has(r.asset_id)) uniqueAssets.set(r.asset_id, r)
  }

  const insertEval = db.prepare(`
    INSERT INTO eval_record (eval_id, asset_id, evaluator, score, rubric, verdict, notes, metadata_json, created_at)
    VALUES (?, ?, 'vis-metadata-triage', ?, 'vis-heuristic-metadata-triage-v1', ?, ?, ?, ?)
    ON CONFLICT(eval_id) DO UPDATE SET
      score = excluded.score,
      verdict = excluded.verdict,
      notes = excluded.notes,
      metadata_json = excluded.metadata_json
  `)

  // Never overwrite human or previously finalized approval_status values
  const updateUntriagedApproval = db.prepare(`
    UPDATE asset
    SET approval_status = ?
    WHERE asset_id = ?
      AND (approval_status IS NULL OR approval_status IN ('candidate', 'unreviewed', 'pending'))
  `)

  const catalog = []
  const tierDistribution = {
    'Hero Candidate (28-30)': 0,
    'Editorial Candidate (26-27)': 0,
    'Study/R&D (22-25)': 0,
    'Quarantine (<22)': 0,
  }

  db.exec('BEGIN TRANSACTION')
  try {
    for (const asset of uniqueAssets.values()) {
      const evaluation = triageAssetMetadata(asset)
      tierDistribution[evaluation.tier]++

      const evalId = stableId('eval', `${asset.asset_id}:heuristic-metadata-triage`)
      const metadata = {
        source: 'vis-metadata-triage',
        rubric: 'vis-heuristic-metadata-triage-v1',
        same_provider: null,
        independent: false,
        visual_inspection: false,
        reviewer_family: 'heuristic-metadata-triage',
        gate_score: evaluation.score,
        gate_max: 30,
        tier: evaluation.tier,
        categories: evaluation.categoryScores,
        evaluated_at: now,
      }

      insertEval.run(
        evalId,
        asset.asset_id,
        evaluation.score,
        evaluation.verdict,
        evaluation.critique,
        JSON.stringify(metadata),
        now,
      )

      updateUntriagedApproval.run(evaluation.triageApproval, asset.asset_id)

      const filename = path.basename(asset.primary_path || asset.relative_path || 'asset.png')
      const relPath = String(asset.relative_path || asset.primary_path || '').replace(/\\/g, '/')
      const promptHash = asset.prompt_text
        ? crypto.createHash('sha256').update(asset.prompt_text).digest('hex').slice(0, 16)
        : null

      catalog.push({
        id: asset.asset_id,
        filename,
        relative_path: relPath,
        brand: evaluation.brand,
        role: evaluation.role,
        triage_score: evaluation.score,
        tier: evaluation.tier,
        verdict: evaluation.verdict,
        category_scores: evaluation.categoryScores,
        prompt_hash: promptHash,
        model: asset.model || null,
        date: asset.first_seen_at || now,
        rights_status: asset.rights_status || 'unknown',
        critique_notes: evaluation.critique,
        r2_url: null,
        r2_promoted: false,
        provenance: {
          prompt: asset.prompt_text || null,
          prompt_hash: promptHash,
          model: asset.model || null,
          provider: asset.provider || null,
          date: asset.first_seen_at || now,
          rights_status: asset.rights_status || 'unknown',
          reviewer: 'vis-metadata-triage',
          independent: false,
          visual_inspection: false,
          rubric: 'vis-heuristic-metadata-triage-v1',
        },
      })
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  if (exportPath) {
    fs.mkdirSync(path.dirname(exportPath), { recursive: true })
    fs.writeFileSync(exportPath, JSON.stringify(catalog, null, 2), 'utf8')
  }

  return {
    status: 'SUCCESS',
    evaluatedCount: catalog.length,
    tierDistribution,
    catalog,
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  const root = process.cwd()
  const db = openVisDatabase(root, { indexPath: 'data/vis.sqlite' })
  const exportPath = path.resolve(root, 'data/starlight-approved-assets.json')
  const result = runMetadataTriageAndExport(db, { exportPath })
  console.log(JSON.stringify({
    status: result.status,
    evaluatedCount: result.evaluatedCount,
    tierDistribution: result.tierDistribution,
    exportPath,
  }, null, 2))
}
