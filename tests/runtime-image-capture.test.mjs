import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'
import { createSchema, buildAssetEntry, upsertAssetGraph, traceAsset } from '../core/vis-core.mjs'
import { captureImages, exportCaptureIndex } from '../core/adapters/image-capture-adapter.mjs'
import { projectRuntimeImageRecords } from '../core/adapters/runtime-image-capture-adapter.mjs'

const timestamp = '2026-11-16T10:00:00.000Z'
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64')
const prefix = 'media-capture/SYNTHETIC_ATTEMPT'
const unknown = () => ({ value: null, status: 'unknown', evidence_ref: null })
const exact = (value, suffix) => ({ value, status: 'exact', evidence_ref: `creator-command-object:${prefix}/requested.json#/${suffix}` })

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-runtime-capture-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const request = {
    schema: 'starlight.imageGeneration.v1', request_id: 'SYNTHETIC_ATTEMPT', generation_phase: 'requested',
    run_id: 'synthetic-run', project_id: 'synthetic-project', brand: 'synthetic', created_at: timestamp,
    generation: { user_prompt: unknown(), effective_prompt: exact('A small amber star.', 'generation/effective_prompt'), revised_prompt: unknown(), requested_model: exact('routed-model', 'generation/requested_model'), resolved_model: unknown(), provider: exact('fixture-provider', 'generation/provider'), reason: exact('Illustrate a synthetic article.', 'generation/reason') },
    concept: { summary: exact('Synthetic star study', 'metadata/caller_intent'), characters: ['synthetic-star'], stories: [], worlds: [], intended_uses: ['article-card'] },
    reference_source_item_ids: ['fixture-reference'],
    metadata: { caller_intent: 'Synthetic star study', requested_params: { width: 1 }, routing_policy: 'Synthetic routing policy', skipped_providers: [], source_key: `${prefix}/requested.json` },
  }
  const write = record => {
    const filename = `${record.generation_phase}.json`
    const bytes = Buffer.from(JSON.stringify(record, null, 2))
    fs.writeFileSync(path.join(root, filename), bytes)
    return { object_key: `${prefix}/${filename}`, record_path: filename, expected_record_sha256: digest(bytes) }
  }
  const requested = write(request)
  const completed = { ...request, generation_phase: 'completed', request_ref: { key: requested.object_key, sha256: requested.expected_record_sha256 }, provider_response: { model: null, revised_prompt: null }, output: { key: `${prefix}/original`, display_projection_key: 'display/card.jpg', display_projection_verified: false, sha256: digest(png), content_type: 'image/png', size_bytes: png.length, stored: true }, metadata: { ...request.metadata, source_key: `${prefix}/completed.json`, legacy_adapter_model: 'never-promote-this-model', cost_micro_usd: 1 } }
  const completion = write(completed)
  const failed = { ...request, generation_phase: 'failed', request_ref: completed.request_ref, failure: { code: 'IMAGE_ATTEMPT_FAILED', stage: 'settlement' }, completed_image_ref: { requestId: request.request_id, requestKey: requested.object_key, requestSha256: requested.expected_record_sha256, outcomeKey: completion.object_key, outcomeSha256: completion.expected_record_sha256, originalKey: completed.output.key, originalSha256: completed.output.sha256, phase: 'completed', requestedModel: 'routed-model', resolvedModel: null, resolvedModelEvidence: 'not-reported' }, metadata: { ...request.metadata, source_key: `${prefix}/failed.json` } }
  const failure = write(failed)
  fs.writeFileSync(path.join(root, 'original.png'), png)
  const input = { schema_version: 'vis.runtime-image-capture-input.v1', batch_id: 'synthetic-runtime-page', source: { provider: 'fixture-runtime', scope: 'synthetic-bucket' }, captured_at: timestamp, cursor: { previous: null, next: null, revision: 0 }, coverage: { exhausted: false, note: 'Synthetic local record copies only' }, records: [requested, { ...completion, local_path: 'original.png' }, failure] }
  return { root, request, completed, failed, input, write }
}

test('runtime request/completion/failure project into VIS without fabricated claims or asset identity', t => {
  const f = fixture(t)
  const manifest = projectRuntimeImageRecords(f.input, { recordsRoot: f.root })
  const db = new DatabaseSync(':memory:'); createSchema(db); t.after(() => db.close())
  const entry = buildAssetEntry(f.root, f.root, path.join(f.root, 'original.png')); upsertAssetGraph(db, entry)
  const receipt = captureImages(db, manifest, { execute: true, mediaRoot: f.root })
  assert.equal(receipt.counts.linked, 1)
  assert.equal(receipt.counts.metadata_only, 2)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM asset').get().n, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM generation_event').get().n, 0)
  const observations = exportCaptureIndex(db).observations
  const completed = observations.find(o => o.metadata.generation_phase === 'completed')
  const failed = observations.find(o => o.metadata.generation_phase === 'failed')
  assert.equal(completed.metadata.runtime_capture.request_ref_status, 'matched-local-record')
  assert.deepEqual(completed.metadata.runtime_capture.record.output, f.completed.output)
  assert.equal(completed.generation.resolved_model.value, null)
  assert.equal(completed.generation.requested_model.value, 'routed-model')
  assert.equal(completed.generation.effective_prompt.value, 'A small amber star.')
  assert.equal(completed.generation.user_prompt.value, null)
  assert.deepEqual(failed.metadata.runtime_capture.record.completed_image_ref, f.failed.completed_image_ref)
  assert.equal(failed.metadata.runtime_capture.completion_ref_status, 'matched-local-outcome-and-original-hashes')
  assert.equal(failed.capture.asset_id, null)
  assert.deepEqual(failed.metadata.reference_source_item_ids, ['fixture-reference'])
  assert.equal(traceAsset(db, entry.assetId).provenance.filter(row => row.event_type === 'image-source-captured').length, 1)
  assert.equal(captureImages(db, manifest, { execute: true, mediaRoot: f.root }).replayed, true)
})

test('a declared output checksum never becomes measured without the original bytes', t => {
  const f = fixture(t)
  delete f.input.records[1].local_path
  f.input.records = [f.input.records[1]]
  const manifest = projectRuntimeImageRecords(f.input, { recordsRoot: f.root })
  assert.equal(manifest.items[0].metadata.runtime_capture.request_ref_status, 'source-declared-only')
  const db = new DatabaseSync(':memory:'); createSchema(db); t.after(() => db.close())
  const receipt = captureImages(db, manifest, { execute: true })
  assert.equal(receipt.rows[0].state, 'metadata-only')
  assert.equal(receipt.rows[0].measured_sha256, null)
  assert.equal(receipt.rows[0].asset_id, null)
})

test('provider reported model survives, but requested/legacy model cannot become resolved evidence', t => {
  const f = fixture(t)
  const reported = { ...f.completed, generation: { ...f.completed.generation, resolved_model: { value: 'actual-response-model', status: 'exact', evidence_ref: `creator-command-object:${prefix}/completed.json#/provider_response/model` } }, provider_response: { model: 'actual-response-model', revised_prompt: null } }
  f.input.records = [f.write(reported)]
  assert.equal(projectRuntimeImageRecords(f.input, { recordsRoot: f.root }).items[0].generation.resolved_model.value, 'actual-response-model')
  f.input.records = [f.write({ ...reported, provider_response: { model: null, revised_prompt: null } })]
  assert.throws(() => projectRuntimeImageRecords(f.input, { recordsRoot: f.root }), /must match provider_response/)
  f.input.records = [f.write({ ...f.request, generation: reported.generation })]
  assert.throws(() => projectRuntimeImageRecords(f.input, { recordsRoot: f.root }), /Requested events cannot claim/)
})

test('record digest, request lineage, phase keys and failure byte attachments fail closed', t => {
  const f = fixture(t)
  const project = input => projectRuntimeImageRecords(input, { recordsRoot: f.root })
  assert.throws(() => project({ ...f.input, records: [{ ...f.input.records[0], expected_record_sha256: '0'.repeat(64) }] }), /record SHA-256 mismatch/)
  assert.throws(() => project({ ...f.input, records: [{ ...f.input.records[0], object_key: `${prefix}/failed.json` }] }), /does not match/)
  assert.throws(() => project({ ...f.input, records: [{ ...f.input.records[2], local_path: 'original.png' }] }), /Only completed/)
  f.input.records[1] = f.write({ ...f.completed, request_ref: { ...f.completed.request_ref, sha256: '0'.repeat(64) } })
  assert.throws(() => project(f.input), /request_ref SHA-256 differs/)
  assert.throws(() => project({ ...f.input, cursor: { previous: null, next: null } }), /explicit cursor.revision/)
  f.input.records[1] = f.write(f.completed)
  f.input.records[2] = f.write({ ...f.failed, completed_image_ref: { ...f.failed.completed_image_ref, outcomeSha256: '0'.repeat(64) } })
  assert.throws(() => project(f.input), /completed_image_ref differs/)
})

test('local record reader confines traversal and symlinks and bounds record size', t => {
  const f = fixture(t)
  const child = path.join(f.root, 'records'); fs.mkdirSync(child)
  fs.symlinkSync(path.join(f.root, 'requested.json'), path.join(child, 'escape.json'))
  for (const record_path of ['../requested.json', 'escape.json']) {
    assert.throws(() => projectRuntimeImageRecords({ ...f.input, records: [{ ...f.input.records[0], record_path }] }, { recordsRoot: child }), /escapes recordsRoot/)
  }
  fs.writeFileSync(path.join(f.root, 'oversized.json'), ' '.repeat(262145))
  assert.throws(() => projectRuntimeImageRecords({ ...f.input, records: [{ ...f.input.records[0], record_path: 'oversized.json' }] }, { recordsRoot: f.root }), /256 KiB/)
  fs.writeFileSync(path.join(f.root, 'invalid-encoding.json'), Buffer.from([0x22, 0xff, 0x22]))
  assert.throws(() => projectRuntimeImageRecords({ ...f.input, records: [{ object_key: `${prefix}/requested.json`, record_path: 'invalid-encoding.json' }] }, { recordsRoot: f.root }), /encoded data was not valid/)
})

test('runtime CLI projects and captures locally; output aliases cannot overwrite source event copies', t => {
  const f = fixture(t)
  const input = path.join(f.root, 'input.json'), db = path.join(f.root, 'vis.sqlite')
  fs.writeFileSync(input, JSON.stringify(f.input))
  const script = new URL('../scripts/image-capture.mjs', import.meta.url).pathname
  const args = [script, '--runtime-input', input, '--records-root', f.root, '--media-root', f.root, '--db', db]
  const dry = JSON.parse(execFileSync(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }))
  assert.equal(dry.counts.metadata_only, 2)
  assert.equal(dry.counts.pending_library_ingest, 1)
  assert.equal(fs.existsSync(db), false)
  const receipt = JSON.parse(execFileSync(process.execPath, [...args, '--execute'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }))
  assert.equal(receipt.dry_run, false)
  const recordPath = path.join(f.root, 'requested.json'), before = fs.readFileSync(recordPath)
  assert.throws(() => execFileSync(process.execPath, [...args, '--out', recordPath], { stdio: 'pipe' }), /including aliases/)
  assert.deepEqual(fs.readFileSync(recordPath), before)
  for (const link of ['symlinkSync', 'linkSync']) {
    const alias = path.join(f.root, `${link}-event.json`)
    fs[link](recordPath, alias)
    assert.throws(() => execFileSync(process.execPath, [...args, '--out', alias], { stdio: 'pipe' }), /including aliases/)
    assert.throws(() => execFileSync(process.execPath, [...args, '--execute', '--index-out', alias], { stdio: 'pipe' }), /including aliases/)
    assert.deepEqual(fs.readFileSync(recordPath), before)
  }
  assert.throws(() => execFileSync(process.execPath, [...args, '--out', input], { stdio: 'pipe' }), /including aliases/)
  assert.throws(() => execFileSync(process.execPath, [...args, '--out', path.join(f.root, 'original.png')], { stdio: 'pipe' }), /including aliases/)
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'original.png')), png)
})
