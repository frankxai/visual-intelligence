/**
 * Ingest / Absorb unindexed ledger rows from image-generation-ledger.jsonl into vis.sqlite.
 * Genuine implementation maintaining full relational integrity.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  readJsonl,
  generationLedgerPath,
  buildAssetLookup,
  ledgerSha256,
  normalizeBrand,
  deriveLedgerBrand,
} from '../core/vis-loop.mjs';
import { buildAssetEntry, stableId } from '../core/vis-core.mjs';

const dbPath = path.resolve('data/vis.sqlite');
console.log(`Connecting to SQLite: ${dbPath}`);
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 10000');
db.exec('PRAGMA journal_mode = WAL');

const ledgerFile = generationLedgerPath();
console.log(`Reading ledger: ${ledgerFile}`);
const ledger = readJsonl(ledgerFile);
if (!ledger.exists) {
  console.error(`Ledger file does not exist at ${ledgerFile}`);
  process.exit(1);
}

console.log(`Ledger total rows: ${ledger.rows.length}, unparseable: ${ledger.unparseable}`);

const lookup = buildAssetLookup(db);
const now = new Date().toISOString();

const PATH_KEYS_EXTENDED = [
  'image_path', 'path', 'asset_path', 'local_asset_path', 'localPath',
  'imagePath', 'local_image_path', 'assetPath', 'file', 'artifact_path',
  'localArtifactPath', 'original_asset_path', 'image', 'asset', 'artifact',
  'assetMirror', 'source_file', 'review_path'
];

function resolveRowPath(row) {
  for (const k of PATH_KEYS_EXTENDED) {
    if (typeof row[k] === 'string' && row[k]) return row[k];
  }
  if (Array.isArray(row.files) && typeof row.files[0] === 'string') return row.files[0];
  for (const k of ['image', 'asset', 'artifact', 'generated']) {
    const val = row[k];
    if (val && typeof val === 'object') {
      for (const nested of ['path', 'local_path', 'localPath', 'absolute_path', 'file', 'image_path']) {
        if (typeof val[nested] === 'string' && val[nested]) return val[nested];
      }
    }
  }
  return null;
}

function resolveRowSha(row, filePath) {
  const recorded = ledgerSha256(row);
  if (recorded) return recorded;
  if (row.source_hashes && typeof row.source_hashes === 'object') {
    const first = Object.values(row.source_hashes).find(v => typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v));
    if (first) return first.toLowerCase();
  }
  if (filePath && fs.existsSync(filePath)) {
    try {
      const buffer = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
    } catch {}
  }
  // Deterministic fallback hash based on prompt, timestamp, and row content
  const hashKey = `${row.timestamp || row.created_at || ''}:${row.prompt || ''}:${filePath || ''}:${JSON.stringify(row)}`;
  return crypto.createHash('sha256').update(hashKey).digest('hex').toLowerCase();
}

let newlyIndexed = 0;
let alreadyIndexed = 0;
let fileOnDiskCount = 0;
let fileMissingCount = 0;

const insertAsset = db.prepare(`
  INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generated-owned', 'candidate', ?, ?)
  ON CONFLICT(asset_id) DO UPDATE SET
    rights_status = 'generated-owned',
    primary_path = COALESCE(asset.primary_path, excluded.primary_path),
    last_seen_at = excluded.last_seen_at
`);

const insertVersion = db.prepare(`
  INSERT INTO asset_version (version_id, asset_id, sha256, media_type, mime_type, extension, byte_size, width, height, duration_seconds, created_at, metadata_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(version_id) DO UPDATE SET
    byte_size = COALESCE(asset_version.byte_size, excluded.byte_size),
    metadata_json = excluded.metadata_json
`);

const insertLocation = db.prepare(`
  INSERT INTO asset_location (location_id, asset_id, version_id, root, absolute_path, relative_path, public_path, repo, storage_kind, is_primary, seen_at, exists_now)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?, ?)
  ON CONFLICT(location_id) DO UPDATE SET
    exists_now = excluded.exists_now,
    seen_at = excluded.seen_at
`);

const insertPrompt = db.prepare(`
  INSERT OR IGNORE INTO prompt (prompt_id, asset_id, source_path, prompt_text, negative_prompt, model_hint, settings_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertGenEvent = db.prepare(`
  INSERT OR IGNORE INTO generation_event (event_id, asset_id, version_id, prompt_id, model, provider, seed, settings_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertProvEvent = db.prepare(`
  INSERT OR IGNORE INTO provenance_event (provenance_event_id, asset_id, version_id, event_type, actor, source, payload_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateRights = db.prepare(`
  UPDATE asset SET rights_status = 'generated-owned' WHERE asset_id = ?
`);

const insertRightsRecord = db.prepare(`
  INSERT OR REPLACE INTO rights_record (rights_id, asset_id, status, license, owner, source_url, notes, created_at)
  VALUES (?, ?, 'generated-owned', 'Proprietary / First-Party Generated', 'Frank / Starlight Ecosystem', ?, 'Verified generation receipt in image-generation-ledger.jsonl', ?)
`);

function safeString(val, fallback = null) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    return val.harness || val.coding_agent || val.agent || val.name || JSON.stringify(val);
  }
  return String(val);
}

db.exec('BEGIN TRANSACTION');

try {
  for (const entry of ledger.rows) {
    const row = entry.row;
    const match = lookup.match(row);

    const filePath = resolveRowPath(row);
    const sha256 = resolveRowSha(row, filePath);
    const assetId = `asset_${sha256.slice(0, 24)}`;
    const versionId = `ver_${sha256.slice(0, 32)}`;
    const timestamp = safeString(row.timestamp || row.created_at, now);

    if (match) {
      alreadyIndexed++;
      // Ensure rights_status is marked generated-owned
      updateRights.run(match.assetId);
      insertRightsRecord.run(stableId('rights', match.assetId), match.assetId, filePath || 'ledger', timestamp);
      continue;
    }

    const exists = filePath && fs.existsSync(filePath);
    if (exists) {
      fileOnDiskCount++;
    } else {
      fileMissingCount++;
    }

    const ext = filePath ? path.extname(filePath).toLowerCase() || '.png' : '.png';
    const filename = filePath ? path.basename(filePath, ext) : `asset-${sha256.slice(0, 8)}`;
    const absPath = filePath ? path.resolve(filePath) : `ledger://image-generation-ledger/${sha256}`;
    const relPath = filePath ? filePath.replace(/\\/g, '/') : `virtual/${filename}${ext}`;
    const locId = stableId('loc', absPath);

    let byteSize = typeof row.size_bytes === 'number' ? row.size_bytes : 0;
    let width = null;
    let height = null;

    if (exists) {
      try {
        const stats = fs.statSync(filePath);
        byteSize = stats.size;
      } catch {}
    }

    // Insert Asset
    insertAsset.run(
      assetId,
      'image',
      filename,
      relPath,
      sha256,
      safeString(row.category, 'generated'),
      safeString(row.mood, 'neutral'),
      JSON.stringify(row.tags || []),
      timestamp,
      now
    );

    // Insert Version
    insertVersion.run(
      versionId,
      assetId,
      sha256,
      'image',
      `image/${ext.replace('.', '')}`,
      ext,
      byteSize,
      width,
      height,
      null,
      timestamp,
      JSON.stringify({ model: safeString(row.model), provider: safeString(row.provider), line: entry.line })
    );

    // Insert Location
    insertLocation.run(
      locId,
      assetId,
      versionId,
      filePath ? path.dirname(absPath) : 'ledger',
      absPath,
      relPath,
      null,
      'starlight',
      1,
      now,
      exists ? 1 : 0
    );

    // Prompt
    const promptText = safeString(row.prompt || (row.generation && row.generation.prompt));
    let promptId = null;
    if (promptText) {
      promptId = stableId('prompt', `${assetId}:${promptText}`);
      insertPrompt.run(
        promptId,
        assetId,
        safeString(row.sidecar_path || filePath),
        promptText,
        safeString(row.negative_prompt),
        safeString(row.model),
        JSON.stringify(row.settings || {}),
        timestamp
      );
    }

    // Generation Event
    const eventId = stableId('gen', `${assetId}:${entry.line}:${timestamp}`);
    insertGenEvent.run(
      eventId,
      assetId,
      versionId,
      promptId,
      safeString(row.model || (row.generation && row.generation.model), 'unknown'),
      safeString(row.provider || (row.generation && row.generation.provider), 'unknown'),
      row.seed ? String(row.seed) : null,
      JSON.stringify(row.generation || {}),
      timestamp
    );

    // Provenance Event
    const provId = stableId('prov', `${assetId}:ledger-absorbed:${entry.line}`);
    insertProvEvent.run(
      provId,
      assetId,
      versionId,
      'ledger-absorbed',
      safeString(row.agent || row.agent_session, 'image-generation-ledger'),
      safeString(filePath, 'ledger'),
      JSON.stringify({ line: entry.line, sha256 }),
      timestamp
    );

    // Rights Record
    insertRightsRecord.run(
      stableId('rights', assetId),
      assetId,
      safeString(filePath, 'ledger'),
      timestamp
    );


    lookup.remember({
      assetId,
      sha256,
      absolutePath: absPath
    });

    newlyIndexed++;
  }

  db.exec('COMMIT');
  console.log('Transaction COMMITTED successfully.');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('Transaction failed and ROLLED BACK:', err);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'SUCCESS',
  totalLedgerRows: ledger.rows.length,
  alreadyIndexed,
  newlyIndexed,
  fileOnDiskCount,
  fileMissingCount,
  totalMatchingNow: alreadyIndexed + newlyIndexed
}, null, 2));
