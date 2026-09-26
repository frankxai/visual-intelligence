import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { applyStalePrimaryRepairs, linkPublicAssetUsage, openVisDatabase, planStalePrimaryRepairs } from '../core/vis-core.mjs'

test('truth repair points a missing primary at the one unambiguous public file and records the page', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-truth-'))
  const repo = path.join(root, 'starlight-intelligence-web')
  fs.mkdirSync(path.join(repo, 'public', 'assets'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'app'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'public', 'assets', 'orb.png'), 'png')
  fs.writeFileSync(path.join(repo, 'app', 'page.tsx'), 'export const image = "/assets/orb.png"\n')
  const db = openVisDatabase(root)
  try {
    const now = '2026-09-26T00:00:00.000Z'
    db.prepare(`
      INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, rights_status, approval_status, first_seen_at, last_seen_at)
      VALUES ('orb', 'image', 'orb', '../starlight-intelligence-web/assets/orb.png', 'abc', 'starlight-intelligence-web', 'generated-owned', 'approved', ?, ?)`).run(now, now)
    db.prepare(`
      INSERT INTO asset_version (version_id, asset_id, sha256, media_type, byte_size, created_at)
      VALUES ('v1', 'orb', 'abc', 'image', 3, ?)`).run(now)
    db.prepare(`
      INSERT INTO asset_location (location_id, asset_id, version_id, root, absolute_path, relative_path, seen_at, exists_now)
      VALUES ('live', 'orb', 'v1', 'root', ?, 'orb.png', ?, 1)`).run(path.join(repo, 'public', 'assets', 'orb.png'), now)
    db.prepare(`
      INSERT INTO asset_location (location_id, asset_id, version_id, root, absolute_path, relative_path, seen_at, exists_now)
      VALUES ('gone', 'orb', 'v1', 'root', ?, 'orb.png', ?, 0)`).run(path.join(root, 'starlight-intelligence-web', 'assets', 'orb.png'), now)

    const planned = planStalePrimaryRepairs(db)
    assert.equal(planned.length, 1)
    assert.match(planned[0].to, /public\/assets\/orb\.png$/)
    applyStalePrimaryRepairs(db, planned, now)
    const primary = db.prepare('SELECT primary_path FROM asset WHERE asset_id = ?').get('orb')
    assert.match(primary.primary_path, /public\/assets\/orb\.png$/)
    const linked = linkPublicAssetUsage(db, repo, now)
    assert.equal(linked, 1)
    const usage = db.prepare('SELECT reference_text, source_file FROM asset_usage').get()
    assert.equal(usage.reference_text, '/assets/orb.png')
    assert.equal(usage.source_file, 'app/page.tsx')
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
