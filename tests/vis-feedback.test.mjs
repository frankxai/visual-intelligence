import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createSchema, recordCurationFeedback, undoCurationFeedback, drainFeedbackOutbox } from '../core/vis-core.mjs'

function sampleFeedback() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-feedback-sample-'))
  const previous = process.env.VIS_TASTE_LEDGER
  const ledger = path.join(root, 'sample-feedback.jsonl')
  process.env.VIS_TASTE_LEDGER = ledger
  const db = new DatabaseSync(':memory:')
  createSchema(db)
  db.prepare(`INSERT INTO asset (asset_id, media_type, title, source_hash, first_seen_at, last_seen_at)
    VALUES ('sample', 'image', 'Synthetic sample', 'synthetic-hash', '2026-10-01', '2026-10-01')`).run()
  return { db, root, ledger, close() {
    db.close()
    if (previous === undefined) delete process.env.VIS_TASTE_LEDGER
    else process.env.VIS_TASTE_LEDGER = previous
    fs.rmSync(root, { recursive: true, force: true })
  } }
}

test('feedback saves and drains once, including retry after the ledger append', () => {
  const sample = sampleFeedback()
  try {
    const result = recordCurationFeedback(sample.db, { assetId: 'sample', rating: 3, actor: 'synthetic-test', brand: 'sample' })
    assert.equal(result.ok, true)
    assert.equal(result.receipt.ledger_status, 'drained')
    assert.equal(sample.db.prepare("SELECT rights_status FROM asset WHERE asset_id='sample'").get().rights_status, 'unknown')
    const lines = fs.readFileSync(sample.ledger, 'utf8').trim().split('\n')
    assert.equal(lines.length, 1)
    assert.equal(JSON.parse(lines[0]).brand, 'sample')
    // Simulate interruption between appending JSONL and marking the outbox drained.
    sample.db.prepare("UPDATE feedback_outbox SET status='pending', drained_at=NULL").run()
    drainFeedbackOutbox(sample.db)
    assert.equal(fs.readFileSync(sample.ledger, 'utf8').trim().split('\n').length, 1)
    assert.equal(drainFeedbackOutbox(sample.db).syncedCount, 0)
  } finally { sample.close() }
})

test('ledger failures leave a saved decision or undo pending and recover without another decision', () => {
  const sample = sampleFeedback()
  try {
    const blocked = path.join(sample.root, 'not-a-file')
    fs.mkdirSync(blocked)
    process.env.VIS_TASTE_LEDGER = blocked
    const saved = recordCurationFeedback(sample.db, { assetId: 'sample', rating: 3, actor: 'synthetic-test' })
    assert.equal(saved.ok, true)
    assert.equal(saved.receipt.ledger_status, 'pending')
    assert.equal(sample.db.prepare("SELECT rating FROM asset_annotation WHERE asset_id='sample'").get().rating, 3)
    assert.equal(sample.db.prepare("SELECT COUNT(*) AS n FROM feedback_outbox WHERE status='pending'").get().n, 1)
    process.env.VIS_TASTE_LEDGER = sample.ledger
    assert.equal(drainFeedbackOutbox(sample.db).syncedCount, 1)
    process.env.VIS_TASTE_LEDGER = blocked
    const undo = undoCurationFeedback(sample.db, 'sample')
    assert.equal(undo.ok, true)
    assert.equal(undo.ledger_status, 'pending')
    assert.equal(sample.db.prepare("SELECT * FROM asset_annotation WHERE asset_id='sample'").get(), undefined)
    process.env.VIS_TASTE_LEDGER = sample.ledger
    assert.equal(drainFeedbackOutbox(sample.db).syncedCount, 1)
    assert.equal(drainFeedbackOutbox(sample.db).syncedCount, 0)
    assert.equal(fs.readFileSync(sample.ledger, 'utf8').trim().split('\n').length, 2)
  } finally { sample.close() }
})
