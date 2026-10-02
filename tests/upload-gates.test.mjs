import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openVisDatabase, planStorageUpload, executeStorageUpload } from '../core/vis-core.mjs'

function seed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-upload-gates-'))
  const db = openVisDatabase(dir, { indexPath: 'data/vis.sqlite' })
  const now = new Date().toISOString()
  const insert = db.prepare(`INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
    VALUES (?, 'image', ?, ?, ?, 'heroes', 'calm', '["hero","frankx"]', ?, ?, ?, ?)`)
  insert.run('ok', 'ok', 'public/images/ok.webp', 'h1', 'owned', 'approved', now, now)
  insert.run('unknown', 'unknown', 'public/images/unknown.webp', 'h2', 'unknown', 'approved', now, now)
  insert.run('candidate', 'candidate', 'public/images/candidate.webp', 'h3', 'owned', 'candidate', now, now)
  return { db, dir }
}

test('plans list only publishable assets unless review is asked for', () => {
  const { db } = seed()
  try {
    const ids = planStorageUpload(db, { target: 'vercel-blob' }).plan.items.map(i => i.asset_id)
    assert.deepEqual(ids, ['ok'])
    const all = planStorageUpload(db, { target: 'vercel-blob', includeUnreviewed: true }).plan.items.map(i => i.asset_id).sort()
    assert.deepEqual(all, ['candidate', 'ok', 'unknown'])
  } finally { db.close() }
})

test('execute is a human gate and refuses R2 keys and IPFS pins', async () => {
  const { db } = seed()
  const saved = process.env.VIS_ENABLE_PUBLISH
  try {
    delete process.env.VIS_ENABLE_PUBLISH
    const plan = planStorageUpload(db, { target: 'vercel-blob' })
    await assert.rejects(executeStorageUpload(db, plan), /human gate/)
    process.env.VIS_ENABLE_PUBLISH = '1'
    await assert.rejects(executeStorageUpload(db, { target: 'cloudflare-r2', plan: { items: [] } }), /Direct R2 upload/)
    await assert.rejects(executeStorageUpload(db, { target: 'ipfs', plan: { items: [] } }), /irreversible/)
  } finally {
    if (saved === undefined) delete process.env.VIS_ENABLE_PUBLISH; else process.env.VIS_ENABLE_PUBLISH = saved
    db.close()
  }
})

test('execute re-checks rights against the live record before any upload', async () => {
  const { db } = seed()
  const saved = process.env.VIS_ENABLE_PUBLISH
  try {
    process.env.VIS_ENABLE_PUBLISH = '1'
    const stale = { target: 'vercel-blob', plan: { items: [{ asset_id: 'unknown' }, { asset_id: 'candidate' }] } }
    const result = await executeStorageUpload(db, stale)
    assert.equal(result.uploaded_count, 0)
    assert.deepEqual(result.refused.map(r => r.asset_id).sort(), ['candidate', 'unknown'])
  } finally {
    if (saved === undefined) delete process.env.VIS_ENABLE_PUBLISH; else process.env.VIS_ENABLE_PUBLISH = saved
    db.close()
  }
})
