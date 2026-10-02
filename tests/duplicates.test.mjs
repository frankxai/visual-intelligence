import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { findDuplicates, openVisDatabase } from '../core/vis-core.mjs'

test('duplicate groups ignore empty files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-duplicates-'))
  const db = openVisDatabase(root)
  try {
    const now = '2026-09-26T00:00:00.000Z'
    const insertAsset = db.prepare(`
      INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, first_seen_at, last_seen_at)
      VALUES (?, 'image', ?, ?, ?, ?, ?)`)
    const insertVersion = db.prepare(`
      INSERT INTO asset_version (version_id, asset_id, sha256, media_type, byte_size, created_at)
      VALUES (?, ?, ?, 'image', ?, ?)`)
    insertAsset.run('empty-a', 'empty-a', 'a.jpg', 'e3b0c442', now, now)
    insertAsset.run('empty-b', 'empty-b', 'b.jpg', 'e3b0c442', now, now)
    insertAsset.run('real-a', 'real-a', 'a.jpg', 'abc123', now, now)
    insertAsset.run('real-b', 'real-b', 'b.jpg', 'abc123', now, now)
    insertVersion.run('v-empty-a', 'empty-a', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 0, now)
    insertVersion.run('v-empty-b', 'empty-b', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 0, now)
    insertVersion.run('v-real-a', 'real-a', 'abc123', 1200, now)
    insertVersion.run('v-real-b', 'real-b', 'abc123', 1200, now)

    const groups = findDuplicates(db, { limit: 10 })
    assert.equal(groups.length, 1)
    assert.equal(groups[0].sha256, 'abc123')
    assert.equal(groups[0].asset_count, 2)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
