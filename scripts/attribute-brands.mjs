/**
 * Deterministic Brand Attribution for all assets in vis.sqlite.
 * Attributes brands using location path heuristics, usage-edge graph, and prompts.
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { stableId } from '../core/vis-core.mjs';

const dbPath = path.resolve('data/vis.sqlite');
console.log(`Connecting to SQLite: ${dbPath}`);
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 10000');
db.exec('PRAGMA journal_mode = WAL');

const BRAND_RULES = [
  // 1. Most specific first
  { match: /starlight-intelligence-academy|starlight-academy/i, brand: 'starlight-intelligence-academy' },
  { match: /starlight-technology|technology-audit/i, brand: 'starlight-technology' },
  { match: /starlight-intelligence-system|brand-packs[\\/]sis|verticals[\\/]sis|[\\/]site[\\/]public[\\/](?:queen|visuals|field-notes|cinematic|motion)|[\\/]site[\\/]public[\\/]brand/i, brand: 'sis' },
  { match: /arcanea/i, brand: 'arcanea' },
  { match: /frankx|ai-architect|ai-architect-coe|monograph|arrival-golden-age|music-first|music-can-i-be-honest|income-funnel|image-system[\\/]income|image-system[\\/]jobs|image-system[\\/]mind|image-system[\\/]excel|image-system[\\/]templates|image-system[\\/]tooling|business|cfo|finance|community/i, brand: 'frankx' },
  { match: /gencreator/i, brand: 'gencreator' },
  { match: /animelegends/i, brand: 'animelegends' },
  { match: /vibeclubs/i, brand: 'vibeclubs' },
  { match: /realityarchitect/i, brand: 'realityarchitect' },
  { match: /akamoto/i, brand: 'akamoto' },
  { match: /solarcarport/i, brand: 'solarcarport.tech' },
  { match: /rova/i, brand: 'rova' },
  { match: /starlightintelligence\.ai|starlight-substrate|starlight-design-intelligence|starlight-command-center|visual-intelligence|starlight-intelligence-web|economy-atlas|agent-file-census|benchmarks|review/i, brand: 'starlight' },
  { match: /starlight/i, brand: 'starlight' },
];

console.log('Fetching assets, locations, and usage edges...');
const assets = db.prepare('SELECT asset_id, primary_path, tags_json FROM asset').all();
const locations = db.prepare('SELECT asset_id, absolute_path, relative_path FROM asset_location').all();
const usages = db.prepare('SELECT asset_id, source_file FROM asset_usage').all();
const prompts = db.prepare('SELECT asset_id, prompt_text FROM prompt').all();

const locMap = new Map();
for (const l of locations) {
  if (!locMap.has(l.asset_id)) locMap.set(l.asset_id, []);
  if (l.absolute_path) locMap.get(l.asset_id).push(l.absolute_path);
  if (l.relative_path) locMap.get(l.asset_id).push(l.relative_path);
}

const usageMap = new Map();
for (const u of usages) {
  if (!usageMap.has(u.asset_id)) usageMap.set(u.asset_id, []);
  if (u.source_file) usageMap.get(u.asset_id).push(u.source_file);
}

const promptMap = new Map();
for (const p of prompts) {
  if (!promptMap.has(p.asset_id)) promptMap.set(p.asset_id, []);
  if (p.prompt_text) promptMap.get(p.asset_id).push(p.prompt_text);
}

function determineBrand(assetId, primaryPath, tagsJson) {
  try {
    const tags = JSON.parse(tagsJson || '[]');
    const bTag = tags.find(t => t.startsWith('brand:'));
    if (bTag) return { brand: bTag.replace('brand:', ''), source: 'existing-tag' };
  } catch {}

  const candidates = [];
  if (primaryPath) candidates.push(primaryPath);
  const locs = locMap.get(assetId) || [];
  candidates.push(...locs);

  for (const p of candidates) {
    const norm = p.replace(/\\/g, '/');
    for (const rule of BRAND_RULES) {
      if (rule.match.test(norm)) return { brand: rule.brand, source: 'path' };
    }
  }

  const uses = usageMap.get(assetId) || [];
  for (const u of uses) {
    const norm = u.replace(/\\/g, '/');
    for (const rule of BRAND_RULES) {
      if (rule.match.test(norm)) return { brand: rule.brand, source: 'usage-edge' };
    }
  }

  const pTexts = promptMap.get(assetId) || [];
  for (const pt of pTexts) {
    for (const rule of BRAND_RULES) {
      if (rule.match.test(pt)) return { brand: rule.brand, source: 'prompt' };
    }
  }

  return { brand: 'starlight', source: 'default-starlight' };
}

const updateAssetTags = db.prepare(`
  UPDATE asset SET tags_json = ? WHERE asset_id = ?
`);

const selectAnnot = db.prepare(`
  SELECT custom_tags_json FROM asset_annotation WHERE asset_id = ?
`);

const insertAnnot = db.prepare(`
  INSERT INTO asset_annotation (asset_id, rating, color_label, curation_status, notes, custom_tags_json, updated_by, updated_at)
  VALUES (?, NULL, NULL, 'uncurated', NULL, ?, 'vis-brand-gate', ?)
`);

const updateAnnot = db.prepare(`
  UPDATE asset_annotation SET custom_tags_json = ?, updated_at = ? WHERE asset_id = ?
`);

const insertProv = db.prepare(`
  INSERT OR IGNORE INTO provenance_event (provenance_event_id, asset_id, version_id, event_type, actor, source, payload_json, created_at)
  VALUES (?, ?, NULL, 'brand-attributed', 'vis-brand-attribution', 'deterministic-rules', ?, ?)
`);

const now = new Date().toISOString();
const brandCounts = {};
let taggedCount = 0;

db.exec('BEGIN TRANSACTION');

try {
  for (const a of assets) {
    const res = determineBrand(a.asset_id, a.primary_path, a.tags_json);
    const brand = res.brand;
    brandCounts[brand] = (brandCounts[brand] || 0) + 1;

    const brandTag = `brand:${brand}`;

    // 1. Update Asset tags
    let aTags = [];
    try { aTags = JSON.parse(a.tags_json || '[]'); } catch {}
    if (!aTags.includes(brandTag)) {
      aTags = aTags.filter(t => !t.startsWith('brand:'));
      aTags.push(brandTag);
      updateAssetTags.run(JSON.stringify(aTags), a.asset_id);
    }

    // 2. Update Annotation custom_tags
    const currentAnnot = selectAnnot.get(a.asset_id);
    if (!currentAnnot) {
      insertAnnot.run(a.asset_id, JSON.stringify([brandTag]), now);
    } else {
      let customTags = [];
      try { customTags = JSON.parse(currentAnnot.custom_tags_json || '[]'); } catch {}
      if (!customTags.includes(brandTag)) {
        customTags = customTags.filter(t => !t.startsWith('brand:'));
        customTags.push(brandTag);
        updateAnnot.run(JSON.stringify(customTags), now, a.asset_id);
      }
    }

    // 3. Provenance event
    insertProv.run(
      stableId('prov', `${a.asset_id}:brand:${brand}`),
      a.asset_id,
      JSON.stringify({ brand, source: res.source }),
      now
    );

    taggedCount++;
  }

  db.exec('COMMIT');
  console.log('Transaction COMMITTED successfully.');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('Brand attribution transaction failed:', err);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'SUCCESS',
  totalAssetsProcessed: taggedCount,
  brandCounts
}, null, 2));
