/**
 * Deterministic Brand Attribution for assets in vis.sqlite.
 *
 * Guarantees:
 * - Uses explicit repository and brand directory segment rules only (never loose words like
 *   "business", "community", "finance", or "review").
 * - Never defaults unmatched assets to "starlight"; unmatched assets remain unattributed and
 *   are reported separately in unattributedCount.
 */

import path from 'path'
import { pathToFileURL } from 'url'
import { openVisDatabase, stableId } from '../core/vis-core.mjs'

export const STRICT_BRAND_RULES = [
  { match: /(?:^|[\\/])starlight-intelligence-academy(?:[\\/]|$)|(?:^|[\\/])starlight-academy(?:[\\/]|$)/i, brand: 'starlight-intelligence-academy' },
  { match: /(?:^|[\\/])starlight-technology(?:[\\/]|$)/i, brand: 'starlight-technology' },
  { match: /(?:^|[\\/])starlight-intelligence-system(?:[\\/]|$)|brand-packs[\\/]sis(?:[\\/]|$)|verticals[\\/]sis(?:[\\/]|$)/i, brand: 'sis' },
  { match: /(?:^|[\\/])arcanea(?:-[a-z0-9_-]+)?(?:[\\/]|$)/i, brand: 'arcanea' },
  { match: /(?:^|[\\/])frankx(?:\.ai-vercel-website|-[a-z0-9_-]+)?(?:[\\/]|$)|brand-packs[\\/]frankx(?:[\\/]|$)/i, brand: 'frankx' },
  { match: /(?:^|[\\/])agenticincome(?:[\\/]|$)|brand-packs[\\/]agenticincome(?:[\\/]|$)/i, brand: 'agenticincome' },
  { match: /(?:^|[\\/])gencreator(?:\.ai|-[a-z0-9_-]+)?(?:[\\/]|$)|brand-packs[\\/]gencreator(?:[\\/]|$)/i, brand: 'gencreator' },
  { match: /(?:^|[\\/])animelegends(?:[\\/]|$)/i, brand: 'animelegends' },
  { match: /(?:^|[\\/])vibeclubs(?:[\\/]|$)/i, brand: 'vibeclubs' },
  { match: /(?:^|[\\/])realityarchitect(?:[\\/]|$)/i, brand: 'realityarchitect' },
  { match: /(?:^|[\\/])akamoto(?:[\\/]|$)/i, brand: 'akamoto' },
  { match: /(?:^|[\\/])solarcarport(?:\.tech|-[a-z0-9_-]+)?(?:[\\/]|$)/i, brand: 'solarcarport.tech' },
  { match: /(?:^|[\\/])rova(?:[\\/]|$)/i, brand: 'rova' },
  { match: /(?:^|[\\/])(?:starlightintelligence\.ai|starlight-design-intelligence|starlight-command-center|starlight-agent-config)(?:[\\/]|$)|tokens[\\/]brands[\\/]starlight(?:[\\/]|$)/i, brand: 'starlight' },
]

export function determineBrandFromInputs({ primaryPath = null, tagsJson = '[]', locationPaths = [], usagePaths = [] }) {
  try {
    const tags = JSON.parse(tagsJson || '[]')
    const existing = Array.isArray(tags) ? tags.find(t => typeof t === 'string' && t.startsWith('brand:')) : null
    if (existing) {
      const value = existing.slice('brand:'.length).trim()
      if (value && value !== 'unknown') return { brand: value, source: 'existing-tag' }
    }
  } catch {}

  const pathCandidates = [primaryPath, ...locationPaths].filter(Boolean)
  for (const p of pathCandidates) {
    const norm = String(p).replace(/\\/g, '/')
    for (const rule of STRICT_BRAND_RULES) {
      if (rule.match.test(norm)) return { brand: rule.brand, source: 'path' }
    }
  }

  for (const u of usagePaths.filter(Boolean)) {
    const norm = String(u).replace(/\\/g, '/')
    for (const rule of STRICT_BRAND_RULES) {
      if (rule.match.test(norm)) return { brand: rule.brand, source: 'usage-edge' }
    }
  }

  return { brand: null, source: 'unmatched' }
}

export function attributeBrandsInDb(db, options = {}) {
  const assets = db.prepare('SELECT asset_id, primary_path, tags_json FROM asset').all()
  const locations = db.prepare('SELECT asset_id, absolute_path, relative_path FROM asset_location').all()
  const usages = db.prepare('SELECT asset_id, source_file FROM asset_usage').all()

  const locMap = new Map()
  for (const l of locations) {
    if (!locMap.has(l.asset_id)) locMap.set(l.asset_id, [])
    if (l.absolute_path) locMap.get(l.asset_id).push(l.absolute_path)
    if (l.relative_path) locMap.get(l.asset_id).push(l.relative_path)
  }

  const usageMap = new Map()
  for (const u of usages) {
    if (!usageMap.has(u.asset_id)) usageMap.set(u.asset_id, [])
    if (u.source_file) usageMap.get(u.asset_id).push(u.source_file)
  }

  const updateAssetTags = db.prepare('UPDATE asset SET tags_json = ? WHERE asset_id = ?')
  const selectAnnot = db.prepare('SELECT custom_tags_json FROM asset_annotation WHERE asset_id = ?')
  const insertAnnot = db.prepare(`
    INSERT INTO asset_annotation (asset_id, rating, color_label, curation_status, notes, custom_tags_json, updated_by, updated_at)
    VALUES (?, NULL, NULL, 'uncurated', NULL, ?, 'vis-brand-gate', ?)
  `)
  const updateAnnot = db.prepare('UPDATE asset_annotation SET custom_tags_json = ?, updated_at = ? WHERE asset_id = ?')
  const insertProv = db.prepare(`
    INSERT OR IGNORE INTO provenance_event (provenance_event_id, asset_id, version_id, event_type, actor, source, payload_json, created_at)
    VALUES (?, ?, NULL, 'brand-attributed', 'vis-brand-attribution', 'strict-segment-rules', ?, ?)
  `)

  const now = options.now || new Date().toISOString()
  const brandCounts = {}
  let attributedCount = 0
  let unattributedCount = 0

  db.exec('BEGIN TRANSACTION')
  try {
    for (const a of assets) {
      const res = determineBrandFromInputs({
        primaryPath: a.primary_path,
        tagsJson: a.tags_json,
        locationPaths: locMap.get(a.asset_id) || [],
        usagePaths: usageMap.get(a.asset_id) || [],
      })

      if (!res.brand) {
        unattributedCount++
        continue
      }

      attributedCount++
      brandCounts[res.brand] = (brandCounts[res.brand] || 0) + 1
      const brandTag = `brand:${res.brand}`

      let aTags = []
      try { aTags = JSON.parse(a.tags_json || '[]') } catch {}
      if (!Array.isArray(aTags)) aTags = []
      if (!aTags.includes(brandTag)) {
        aTags = aTags.filter(t => typeof t === 'string' && !t.startsWith('brand:'))
        aTags.push(brandTag)
        updateAssetTags.run(JSON.stringify(aTags), a.asset_id)
      }

      const currentAnnot = selectAnnot.get(a.asset_id)
      if (!currentAnnot) {
        insertAnnot.run(a.asset_id, JSON.stringify([brandTag]), now)
      } else {
        let customTags = []
        try { customTags = JSON.parse(currentAnnot.custom_tags_json || '[]') } catch {}
        if (!Array.isArray(customTags)) customTags = []
        if (!customTags.includes(brandTag)) {
          customTags = customTags.filter(t => typeof t === 'string' && !t.startsWith('brand:'))
          customTags.push(brandTag)
          updateAnnot.run(JSON.stringify(customTags), now, a.asset_id)
        }
      }

      insertProv.run(
        stableId('prov', `${a.asset_id}:brand:${res.brand}`),
        a.asset_id,
        JSON.stringify({ brand: res.brand, source: res.source }),
        now,
      )
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  return {
    status: 'SUCCESS',
    totalAssetsProcessed: assets.length,
    attributedCount,
    unattributedCount,
    brandCounts,
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  const db = openVisDatabase(process.cwd(), { indexPath: 'data/vis.sqlite' })
  const summary = attributeBrandsInDb(db)
  console.log(JSON.stringify(summary, null, 2))
}
