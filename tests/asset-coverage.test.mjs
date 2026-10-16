import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createSchema } from '../core/vis-core.mjs'
import { auditIndex, buildCoverage } from '../scripts/asset-coverage.mjs'

function fixture() {
  const db = new DatabaseSync(':memory:')
  createSchema(db)
  const insert = db.prepare(`INSERT INTO asset (asset_id, media_type, title, source_hash, first_seen_at, last_seen_at)
    VALUES (?, 'image', ?, ?, '2026-09-01T00:00:00Z', '2026-09-26T00:00:00Z')`)
  insert.run('a', 'First image', 'hash-a')
  insert.run('b', 'Second image', 'hash-b')
  return db
}

test('coverage counts assets once and distinguishes blank prompts, planned uploads, and source usage', () => {
  const db = fixture()
  try {
    db.exec(`INSERT INTO prompt (prompt_id, asset_id, prompt_text, created_at) VALUES
      ('p1', 'a', 'a real prompt', '2026-09-26'), ('p2', 'a', 'an edit', '2026-09-26'), ('p3', 'b', '   ', '2026-09-26');
      INSERT INTO generation_event (event_id, asset_id, model, provider, created_at) VALUES
      ('g1', 'a', 'reported-model', 'reported-provider', '2026-09-26'), ('g2', 'b', NULL, NULL, '2026-09-26');
      INSERT INTO asset_usage (usage_id, asset_id, source_file, reference_text, detected_at) VALUES
      ('u1', 'b', 'page.tsx', '/images/b.png', '2026-09-26'), ('u2', 'b', 'post.mdx', '/images/b.png', '2026-09-26');
      INSERT INTO storage_object (storage_object_id, asset_id, provider, status, created_at) VALUES
      ('s1', 'a', 'drive', 'planned', '2026-09-26');
      INSERT INTO publication (publication_id, asset_id, platform, status, url, created_at) VALUES
      ('pub1', 'b', 'website', 'planned', 'https://example.com', '2026-09-26');`)
    const report = buildCoverage(db, { now: new Date('2026-10-16T00:00:00Z') })
    const images = report.coverage_by_media_type[0]
    assert.equal(images.assets, 2)
    assert.equal(images.with_prompt_text, 1)
    assert.equal(images.with_model_and_provider, 1)
    assert.equal(images.with_source_usage, 1)
    assert.equal(images.with_recorded_upload, 0)
    assert.equal(images.with_publication_receipt, 0)
    assert.equal(report.record_counts.prompt, 3)
    assert.equal(report.freshness.days_since_last_asset_observation, 20)
    assert.equal(report.queues.image_prompt_gap_sample[0].asset_id, 'b')
    assert.equal(report.queues.image_prompt_gap_sample[0].source_usage_edges, 2)
  } finally { db.close() }
})

test('recorded publication requires publication status, URL, and date', () => {
  const db = fixture()
  try {
    db.exec(`INSERT INTO publication (publication_id, asset_id, platform, status, url, published_at, created_at) VALUES
      ('pub1', 'a', 'website', 'published', 'https://example.com/a', '2026-09-26', '2026-09-26'),
      ('pub2', 'b', 'website', 'published', 'https://example.com/b', NULL, '2026-09-26');`)
    assert.equal(buildCoverage(db).coverage_by_media_type[0].with_publication_receipt, 1)
  } finally { db.close() }
})

test('audit opens an existing database read-only without changing its bytes or schema', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-coverage-'))
  const index = path.join(dir, 'test.sqlite')
  try {
    const db = new DatabaseSync(index)
    createSchema(db)
    db.close()
    const before = fs.readFileSync(index)
    assert.equal(auditIndex(index, { sampleLimit: 0 }).record_counts.asset, 0)
    assert.deepEqual(fs.readFileSync(index), before)
    assert.throws(() => auditIndex(path.join(dir, 'missing.sqlite')))
    assert.equal(fs.existsSync(path.join(dir, 'missing.sqlite')), false)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('unsupported schemas and invalid sample limits fail without initialization', () => {
  const db = new DatabaseSync(':memory:')
  try {
    assert.throws(() => buildCoverage(db), /Unsupported VIS index/)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n, 0)
    assert.throws(() => buildCoverage(db, { sampleLimit: -1 }), /sampleLimit/)
    assert.throws(() => buildCoverage(db, { sampleLimit: 101 }), /sampleLimit/)
  } finally { db.close() }
})
