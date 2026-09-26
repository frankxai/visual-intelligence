import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildDamKeepReport, openVisDatabase } from '../core/vis-core.mjs'

test('dam keep proposes a canonical file and refuses mutation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-keep-'))
  const db = openVisDatabase(root)
  try {
    const now = '2026-09-26T00:00:00.000Z'
    const insertAsset = db.prepare(`
      INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, rights_status, approval_status, first_seen_at, last_seen_at)
      VALUES (?, 'image', ?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertVersion = db.prepare(`
      INSERT INTO asset_version (version_id, asset_id, sha256, media_type, byte_size, created_at)
      VALUES (?, ?, ?, 'image', ?, ?)`)
    const insertLocation = db.prepare(`
      INSERT INTO asset_location (location_id, asset_id, version_id, root, absolute_path, relative_path, seen_at, exists_now)
      VALUES (?, ?, ?, 'root', ?, ?, ?, 1)`)
    insertAsset.run('empty-a', 'empty', 'a.jpg', 'e', null, 'unknown', 'candidate', now, now)
    insertAsset.run('empty-b', 'empty', 'b.jpg', 'e', null, 'unknown', 'candidate', now, now)
    insertAsset.run('real-a', 'real', 'repos/site/hero.jpg', 'abc', null, 'unknown', 'candidate', now, now)
    insertAsset.run('real-b', 'real-copy', 'repos/site/.worktrees/old/hero.jpg', 'abc', null, 'unknown', 'candidate', now, now)
    insertAsset.run('ready', 'ready', 'starlight-intelligence-web/assets/orb.png', 'def', 'starlight-intelligence-web', 'generated-owned', 'approved', now, now)
    insertVersion.run('ve-a', 'empty-a', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 0, now)
    insertVersion.run('ve-b', 'empty-b', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 0, now)
    insertVersion.run('vr-a', 'real-a', 'abc123', 1200, now)
    insertVersion.run('vr-b', 'real-b', 'abc123', 1200, now)
    insertVersion.run('vr-ready', 'ready', 'def456', 800, now)
    insertLocation.run('l-a', 'real-a', 'vr-a', 'C:/repos/site/hero.jpg', 'hero.jpg', now)
    insertLocation.run('l-b', 'real-b', 'vr-b', 'C:/repos/site/.worktrees/old/hero.jpg', 'hero.jpg', now)
    insertLocation.run('l-web', 'ready', 'vr-ready', 'C:/repos/starlight-intelligence-web/public/assets/orb.png', 'orb.png', now)
    insertLocation.run('l-academy', 'ready', 'vr-ready', 'C:/repos/starlight-intelligence-academy/public/assets/orb-renamed.png', 'orb-renamed.png', now)

    const report = buildDamKeepReport(db, { now, duplicateLimit: 8 })
    assert.deepEqual(report.refused, ['upload', 'delete', 'approve', 'publish'])
    assert.deepEqual(report.autonomous_actions_taken, ['read-index'])
    assert.equal(report.duplicates.length, 1)
    assert.equal(report.duplicates[0].sha256, 'abc123')
    assert.equal(report.duplicates[0].canonical, 'C:/repos/site/hero.jpg')
    assert.equal(report.duplicates[0].may_delete, false)
    assert.equal(report.queue.some(item => item.id === 'rights-hold' && item.decision === 'hold'), true)
    assert.equal(report.queue.some(item => item.decision === 'propose-canonical' && item.may_delete === false), true)
    assert.equal(report.approved.length, 1)
    assert.equal(report.approved[0].uses, 0)
    const copy = report.live_copies.find(item => item.asset_id === 'ready')
    assert.equal(copy.canonical, 'C:/repos/starlight-intelligence-web/public/assets/orb.png')
    assert.equal(copy.may_delete, false)
    assert.equal(report.queue.some(item => item.id === 'approved-unused' && item.decision === 'hold'), true)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
