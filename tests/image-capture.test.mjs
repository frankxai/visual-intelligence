import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'
import { createSchema, buildAssetEntry, upsertAssetGraph, traceAsset } from '../core/vis-core.mjs'
import { captureImages, normalizeCapture, exportCaptureIndex } from '../core/adapters/image-capture-adapter.mjs'
import { parseArgs } from '../scripts/image-capture.mjs'

const now = '2026-11-15T12:00:00.000Z'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64')
const sha = crypto.createHash('sha256').update(png).digest('hex')
const exact = value => ({ value, status: 'exact', evidence_ref: 'synthetic:tool-response' })
const item = (source_item_id = 'image-1', extra = {}) => ({ source_item_id, filename: 'gemini-model-from-name.png', discovered_at: now, ...extra })
const batch = (items = [item()], extra = {}) => ({ schema_version: 'vis.image-capture.v1', batch_id: 'page-1', source: { provider: 'fixture', scope: 'private-account-a' }, mode: 'backfill', captured_at: now, cursor: { previous: null, next: 'page-2' }, coverage: { exhausted: false, note: 'Synthetic bounded page' }, items, ...extra })
function database(t) { const db = new DatabaseSync(':memory:'); createSchema(db); t.after(() => db.close()); return db }
function fixture(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-image-capture-')); t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })); fs.writeFileSync(path.join(root, 'original.png'), png); return root }
const count = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n

test('metadata-only capture preserves unknowns and created time, never inventing assets or model', t => {
  const db = database(t)
  const receipt = captureImages(db, batch(), { execute: true })
  assert.equal(receipt.counts.metadata_only, 1)
  assert.equal(receipt.rows[0].created_at, null)
  assert.equal(receipt.rows[0].generation.resolved_model.value, null)
  assert.equal(receipt.rows[0].generation.reason.value, null)
  assert.equal(count(db, 'asset'), 0)
  assert.equal(count(db, 'generation_event'), 0)
  assert.equal(receipt.all_history_verified, false)
  assert.equal(exportCaptureIndex(db).observations.length, 1)
})

test('dry run changes neither catalog nor schema and does not advance cursor', t => {
  const db = database(t)
  const before = db.prepare('SELECT name FROM sqlite_master ORDER BY name').all()
  const receipt = captureImages(db, batch())
  assert.deepEqual(db.prepare('SELECT name FROM sqlite_master ORDER BY name').all(), before)
  assert.equal(receipt.cursor.committed, null)
  assert.equal(receipt.cursor.proposed, 'page-2')
  assert.equal(receipt.dry_run, true)
})

test('retries are idempotent; conflicting batch IDs and stale cursors fail closed', t => {
  const db = database(t)
  const original = batch()
  captureImages(db, original, { execute: true })
  assert.equal(captureImages(db, original, { execute: true }).replayed, true)
  assert.equal(count(db, 'image_capture_observation'), 1)
  assert.throws(() => captureImages(db, batch([item('different')]), { execute: true }), /different content/)
  assert.throws(() => captureImages(db, batch([], { batch_id: 'stale' }), { execute: true }), /Stale source cursor/)
  const next = batch([], { batch_id: 'page-2', cursor: { previous: 'page-2', next: null, revision: 1 }, coverage: { exhausted: true, note: 'Only this fixture scope exhausted' } })
  assert.equal(captureImages(db, next, { execute: true }).cursor.committed, null)
  assert.equal(captureImages(db, original, { execute: true }).replayed, true)
  assert.equal(count(db, 'image_capture_batch'), 2)
  assert.equal(db.prepare('SELECT cursor FROM image_capture_source').get().cursor, null)
})

test('identical bytes share existing canonical identity while all sources and locations survive', t => {
  const db = database(t)
  const root = fixture(t)
  const entry = buildAssetEntry(root, root, path.join(root, 'original.png'))
  upsertAssetGraph(db, entry)
  fs.copyFileSync(path.join(root, 'original.png'), path.join(root, 'copy.png'))
  const a = item('a', { source_uri: 'fixture://first', local_path: 'original.png', expected_sha256: sha, generation: { user_prompt: exact('A synthetic amber star.'), resolved_model: exact('fixture-model'), reason: exact('Icon study') } })
  const b = item('b', { source_uri: 'fixture://second', local_path: 'copy.png', relations: [{ type: 'references', source_item_id: 'a', evidence_ref: 'fixture:relation' }] })
  const result = captureImages(db, batch([a, b]), { execute: true, mediaRoot: root })
  assert.equal(result.counts.linked, 2)
  assert.equal(result.counts.duplicate_bytes, 1)
  assert.equal(count(db, 'asset'), 1)
  assert.equal(result.rows[0].asset_id, result.rows[1].asset_id)
  assert.equal(result.rows[0].measured_sha256, sha)
  const observations = exportCaptureIndex(db).observations
  assert.equal(observations[0].source_uri, 'fixture://first')
  assert.equal(observations[1].source_uri, 'fixture://second')
  assert.equal(observations[1].relations[0].source_item_id, 'a')
  const trace = traceAsset(db, entry.assetId)
  assert.equal(trace.provenance.filter(p => p.event_type === 'image-source-captured').length, 2)
  assert.equal(count(db, 'generation_event'), 0, 'evidence claims stay typed in provenance; no lossy flattening')
})

test('unindexed local bytes remain pending; declared remote checksum is never treated as measured', t => {
  const db = database(t)
  const root = fixture(t)
  const receipt = captureImages(db, batch([item('local', { local_path: 'original.png' }), item('remote', { expected_sha256: sha })]), { execute: true, mediaRoot: root })
  assert.equal(receipt.rows[0].state, 'pending-library-ingest')
  assert.equal(receipt.rows[1].measured_sha256, null)
  assert.equal(receipt.rows[1].state, 'metadata-only')
  assert.equal(count(db, 'asset'), 0)
})

test('a new capture links bytes after normal VIS ingestion without rewriting historical observations', t => {
  const db = database(t)
  const root = fixture(t)
  const input = batch([item('local', { local_path: 'original.png' })])
  captureImages(db, input, { execute: true, mediaRoot: root })
  upsertAssetGraph(db, buildAssetEntry(root, root, path.join(root, 'original.png')))
  const receipt = captureImages(db, { ...input, batch_id: 'linked-later', cursor: { previous: 'page-2', next: 'page-2', revision: 1 } }, { execute: true, mediaRoot: root })
  assert.equal(receipt.rows[0].state, 'linked')
  assert.equal(exportCaptureIndex(db).observations.length, 2)
  assert.equal(count(db, 'asset'), 1)
})

test('hash failure leaves all items and checkpoint untouched, including first-use schema', t => {
  const db = database(t)
  const root = fixture(t)
  assert.throws(() => captureImages(db, batch([item('valid', { local_path: 'original.png' }), item('bad', { local_path: 'original.png', expected_sha256: '0'.repeat(64) })]), { execute: true, mediaRoot: root }), /SHA-256 mismatch/)
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'image_capture_source'").get(), undefined)
  captureImages(db, batch(), { execute: true })
  assert.throws(() => captureImages(db, batch([item('bad', { local_path: 'original.png', expected_sha256: '0'.repeat(64) })], { batch_id: 'failed-page', cursor: { previous: 'page-2', next: 'page-3', revision: 1 } }), { execute: true, mediaRoot: root }), /SHA-256 mismatch/)
  assert.equal(count(db, 'image_capture_observation'), 1)
  assert.equal(db.prepare('SELECT cursor FROM image_capture_source').get().cursor, 'page-2')
})

test('SQL failures roll back source cursor, receipt and all observations atomically', t => {
  const db = database(t)
  captureImages(db, batch(), { execute: true })
  db.exec("CREATE TRIGGER fail_capture BEFORE INSERT ON image_capture_observation BEGIN SELECT RAISE(ABORT, 'fixture failure'); END")
  assert.throws(() => captureImages(db, batch([item('second')], { batch_id: 'page-2', cursor: { previous: 'page-2', next: 'page-3', revision: 1 } }), { execute: true }), /fixture failure/)
  assert.equal(count(db, 'image_capture_batch'), 1)
  assert.equal(count(db, 'image_capture_observation'), 1)
  assert.equal(db.prepare('SELECT cursor FROM image_capture_source').get().cursor, 'page-2')
})

test('requested and observed model remain distinct across request/completion events', t => {
  const db = database(t)
  const request = batch([item('run-1', { generation: { requested_model: exact('requested-model'), user_prompt: exact('A star'), reason: exact('Brand icon exploration') }, metadata: { request_id: 'run-1', generation_phase: 'requested', project_id: 'brand', reference_source_item_ids: ['reference-a'] } })], { mode: 'event', cursor: { previous: null, next: null } })
  captureImages(db, request, { execute: true })
  captureImages(db, batch([item('run-1', { generation: { requested_model: exact('requested-model'), resolved_model: exact('actual-model') }, metadata: { request_id: 'run-1', generation_phase: 'completed' } })], { batch_id: 'run-1-complete', mode: 'event', cursor: { previous: null, next: null, revision: 1 } }), { execute: true })
  const observations = exportCaptureIndex(db).observations
  assert.equal(observations.length, 2)
  assert.equal(observations.find(o => o.metadata.generation_phase === 'requested').generation.resolved_model.status, 'unknown')
  assert.equal(observations.find(o => o.metadata.generation_phase === 'completed').generation.resolved_model.value, 'actual-model')
})

test('reconstructed prompt remains reconstructed and cannot silently become original', () => {
  const input = batch([item('a', { generation: { user_prompt: { value: 'Approximate recollection', status: 'reconstructed', evidence_ref: 'fixture:notes' } } })])
  assert.equal(normalizeCapture(input).items[0].generation.user_prompt.status, 'reconstructed')
  assert.throws(() => normalizeCapture(batch([item('a', { generation: { user_prompt: { value: 'Something', status: 'unknown', evidence_ref: null } } })])), /unknown claims/)
  assert.throws(() => normalizeCapture(batch([item('a', { generation: { resolved_model: { value: 'guessed-model', status: 'exact' } } })])), /evidence_ref/)
  assert.throws(() => normalizeCapture(batch([item('a', { generation: { model: exact('a'), resolved_model: exact('b') } })])), /alias conflicts/)
})

test('source scope isolates identical source IDs and independent cursors', t => {
  const db = database(t)
  captureImages(db, batch(), { execute: true })
  captureImages(db, batch([item()], { source: { provider: 'fixture', scope: 'account-b' } }), { execute: true })
  assert.equal(count(db, 'image_capture_source'), 2)
  assert.equal(count(db, 'image_capture_observation'), 2)
})

test('monotonic checkpoint revision rejects stale null-cursor ABA even at equal timestamps', t => {
  const db = database(t)
  captureImages(db, batch(), { execute: true })
  captureImages(db, batch([], { batch_id: 'exhausted', cursor: { previous: 'page-2', next: null, revision: 1 }, coverage: { exhausted: true, note: 'Fixture exhausted' } }), { execute: true })
  assert.throws(() => captureImages(db, batch([item('late')], { batch_id: 'late-first-page' }), { execute: true }), /Stale source cursor\/revision/)
  assert.equal(db.prepare('SELECT revision FROM image_capture_source').get().revision, 2)
  assert.equal(JSON.parse(db.prepare('SELECT coverage_json FROM image_capture_source').get().coverage_json).exhausted, true)
  const resume = batch([], { batch_id: 'intentional-rescan', cursor: { previous: null, next: 'fresh-page', revision: 2 } })
  assert.equal(captureImages(db, resume).cursor.revision_committed, 2)
  assert.equal(db.prepare('SELECT revision FROM image_capture_source').get().revision, 2)
  assert.equal(captureImages(db, resume, { execute: true }).cursor.revision_committed, 3)
  assert.equal(captureImages(db, resume, { execute: true }).replayed, true)
  assert.equal(db.prepare('SELECT revision FROM image_capture_source').get().revision, 3)
})

test('path traversal, escaped symlinks and missing authorized root are rejected', t => {
  const db = database(t)
  const root = fixture(t)
  const child = path.join(root, 'allowed'); fs.mkdirSync(child)
  fs.symlinkSync(path.join(root, 'original.png'), path.join(child, 'escape.png'))
  for (const local_path of ['../original.png', 'escape.png', path.join(root, 'original.png')]) {
    assert.throws(() => captureImages(db, batch([item('a', { local_path })]), { mediaRoot: child }), /escapes mediaRoot|must be relative/)
  }
  assert.throws(() => captureImages(db, batch([item('a', { local_path: 'original.png' })])), /explicit mediaRoot/)
})

test('invalid and oversized pages are rejected before a cursor can advance', () => {
  assert.throws(() => normalizeCapture(batch([item(), item()])), /Duplicate source_item_id/)
  assert.throws(() => normalizeCapture(batch(Array.from({ length: 251 }, (_, i) => item(String(i))))), /at most 250/)
  assert.throws(() => normalizeCapture(batch([], { cursor: { next: 'skipped' } })), /explicitly declare/)
  assert.throws(() => normalizeCapture(batch([item('a', { metadata: { large: 'a'.repeat(4 * 1024 * 1024) } })])), /4 MiB/)
  assert.throws(() => normalizeCapture(batch([item('a', { prompt: 'untyped' })])), /unsupported field prompt/)
})

test('CLI dry run does not create a database; execute writes private receipt/index; replay is stable', t => {
  const root = fixture(t)
  const manifest = path.join(root, 'page.json'), db = path.join(root, 'vis.sqlite'), receipt = path.join(root, 'receipt.json'), index = path.join(root, 'index.json')
  fs.writeFileSync(manifest, JSON.stringify(batch()))
  const script = fileURLToPath(new URL('../scripts/image-capture.mjs', import.meta.url))
  const run = args => JSON.parse(execFileSync(process.execPath, [script, '--manifest', manifest, '--db', db, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  assert.equal(run(['--out', receipt]).dry_run, true)
  assert.equal(fs.existsSync(db), false)
  assert.equal(run(['--execute', '--out', receipt, '--index-out', index]).counts.metadata_only, 1)
  assert.equal(JSON.parse(fs.readFileSync(index)).observations.length, 1)
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(receipt).mode & 0o777, 0o600)
    assert.equal(fs.statSync(db).mode & 0o777, 0o600)
  }
  assert.equal(run(['--execute']).replayed, true)
  assert.equal(run([]).dry_run, true)
  assert.throws(() => parseArgs(['--db', 'a', '--db', 'b']), /Duplicate/)
  assert.throws(() => parseArgs(['--db']), /Missing value/)
})

test('CLI rejects output symlink/hardlink aliases without damaging database or manifest', t => {
  const root = fixture(t)
  const manifest = path.join(root, 'page.json'), db = path.join(root, 'vis.sqlite')
  fs.writeFileSync(manifest, JSON.stringify(batch()))
  const catalog = new DatabaseSync(db); createSchema(catalog); catalog.close()
  const script = fileURLToPath(new URL('../scripts/image-capture.mjs', import.meta.url))
  const databaseBefore = fs.readFileSync(db), manifestBefore = fs.readFileSync(manifest)
  for (const target of [db, manifest]) {
    for (const method of ['symlinkSync', 'linkSync']) {
      const output = path.join(root, `${path.basename(target)}-${method}.json`)
      fs[method](target, output)
      assert.throws(() => execFileSync(process.execPath, [script, '--manifest', manifest, '--db', db, '--out', output], { stdio: 'pipe' }), /including aliases/)
      assert.deepEqual(fs.readFileSync(db), databaseBefore)
      assert.deepEqual(fs.readFileSync(manifest), manifestBefore)
    }
  }
})

test('CLI rejects prospective aliases through symlinked parents and dangling DB links', t => {
  const root = fixture(t)
  const manifest = path.join(root, 'page.json')
  fs.writeFileSync(manifest, JSON.stringify(batch()))
  fs.symlinkSync(root, path.join(root, 'alias'), 'dir')
  const script = fileURLToPath(new URL('../scripts/image-capture.mjs', import.meta.url))
  const db = path.join(root, 'not-yet-created.sqlite')
  assert.throws(() => execFileSync(process.execPath, [script, '--manifest', manifest, '--db', db, '--out', path.join(root, 'alias', 'not-yet-created.sqlite')], { stdio: 'pipe' }), /including aliases/)
  fs.symlinkSync(db, path.join(root, 'dangling-db'))
  assert.throws(() => execFileSync(process.execPath, [script, '--manifest', manifest, '--db', path.join(root, 'dangling-db'), '--execute', '--out', db], { stdio: 'pipe' }), /including aliases/)
  assert.equal(fs.existsSync(db), false)
})

test('CLI atomically replaces unrelated output links without overwriting their target', t => {
  const root = fixture(t)
  const manifest = path.join(root, 'page.json'), db = path.join(root, 'vis.sqlite'), target = path.join(root, 'keep.txt')
  fs.writeFileSync(manifest, JSON.stringify(batch()))
  fs.writeFileSync(target, 'keep this content')
  const script = fileURLToPath(new URL('../scripts/image-capture.mjs', import.meta.url))
  for (const method of ['symlinkSync', 'linkSync']) {
    const out = path.join(root, `${method}.json`)
    fs[method](target, out)
    execFileSync(process.execPath, [script, '--manifest', manifest, '--db', db, '--out', out], { stdio: 'pipe' })
    assert.equal(fs.readFileSync(target, 'utf8'), 'keep this content')
    assert.equal(JSON.parse(fs.readFileSync(out)).dry_run, true)
    assert.equal(fs.lstatSync(out).isSymbolicLink(), false)
    assert.notEqual(fs.statSync(out).ino, fs.statSync(target).ino)
  }
})
