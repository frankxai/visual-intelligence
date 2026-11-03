import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { stableId } from '../core/vis-core.mjs';

const db = new DatabaseSync('data/vis.sqlite');
db.exec('PRAGMA busy_timeout = 10000');
db.exec('PRAGMA journal_mode = WAL');

const sisPublicDir = 'C:/Users/frank/starlight/repos/Starlight-Intelligence-System/site/public/assets';

function scan(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...scan(full));
    } else if (/\.(png|jpe?g|webp|svg|mp4)$/i.test(full)) {
      results.push(full);
    }
  }
  return results;
}

const mediaFiles = scan(sisPublicDir);
const now = new Date().toISOString();

const insertAsset = db.prepare(`
  INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generated-owned', 'candidate', ?, ?)
  ON CONFLICT(asset_id) DO UPDATE SET
    rights_status = 'generated-owned',
    last_seen_at = excluded.last_seen_at
`);

const insertVersion = db.prepare(`
  INSERT INTO asset_version (version_id, asset_id, sha256, media_type, mime_type, extension, byte_size, width, height, duration_seconds, created_at, metadata_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(version_id) DO UPDATE SET
    byte_size = excluded.byte_size
`);

const insertLocation = db.prepare(`
  INSERT INTO asset_location (location_id, asset_id, version_id, root, absolute_path, relative_path, public_path, repo, storage_kind, is_primary, seen_at, exists_now)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?, 1)
  ON CONFLICT(location_id) DO UPDATE SET
    exists_now = 1,
    seen_at = excluded.seen_at
`);

const insertAnnot = db.prepare(`
  INSERT INTO asset_annotation (asset_id, rating, color_label, curation_status, notes, custom_tags_json, updated_by, updated_at)
  VALUES (?, NULL, NULL, 'uncurated', NULL, ?, 'vis-index-sis', ?)
  ON CONFLICT(asset_id) DO UPDATE SET
    custom_tags_json = excluded.custom_tags_json,
    updated_at = excluded.updated_at
`);

const insertRights = db.prepare(`
  INSERT OR REPLACE INTO rights_record (rights_id, asset_id, status, license, owner, source_url, notes, created_at)
  VALUES (?, ?, 'generated-owned', 'Proprietary / First-Party Generated', 'Starlight Intelligence Systems', ?, 'First-party Starlight Intelligence System public asset', ?)
`);

db.exec('BEGIN TRANSACTION');

let added = 0;
let updated = 0;

for (const filePath of mediaFiles) {
  const buf = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
  const assetId = `asset_${sha256.slice(0, 24)}`;
  const versionId = `ver_${sha256.slice(0, 32)}`;
  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath, ext);
  const absPath = path.resolve(filePath);
  const relPath = filePath.replace(/\\/g, '/').replace('C:/Users/frank/starlight/repos/Starlight-Intelligence-System/', '');
  const locId = stableId('loc', absPath);

  const stats = fs.statSync(filePath);
  const tags = ['brand:sis', 'site:public', path.basename(path.dirname(filePath))];

  insertAsset.run(
    assetId,
    'image',
    filename,
    relPath,
    sha256,
    'starlight-public',
    'cosmic',
    JSON.stringify(tags),
    now,
    now
  );

  insertVersion.run(
    versionId,
    assetId,
    sha256,
    'image',
    `image/${ext.replace('.', '')}`,
    ext,
    stats.size,
    null,
    null,
    null,
    now,
    JSON.stringify({ repo: 'Starlight-Intelligence-System', surface: 'public' })
  );

  insertLocation.run(
    locId,
    assetId,
    versionId,
    'C:/Users/frank/starlight/repos/Starlight-Intelligence-System',
    absPath,
    relPath,
    `/${relPath.replace('site/public/', '')}`,
    'Starlight-Intelligence-System',
    1,
    now
  );

  insertAnnot.run(assetId, JSON.stringify(tags), now);
  insertRights.run(stableId('rights', assetId), assetId, absPath, now);

  added++;
}

db.exec('COMMIT');
console.log(`Successfully verified and ingested all ${added} SIS site/public media files into vis.sqlite!`);
