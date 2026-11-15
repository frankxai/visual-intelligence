/** Project authorized local generation-event copies into the existing VIS capture contract. */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { MAX_MANIFEST_BYTES, normalizeCapture } from './image-capture-adapter.mjs'

const FIELDS = ['user_prompt', 'effective_prompt', 'revised_prompt', 'requested_model', 'resolved_model', 'provider', 'reason']
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function check(value, message) { if (!value) throw new Error(message) }
function nonempty(value, label, max = 1024) { check(typeof value === 'string' && value.trim() && value.length <= max, `Invalid ${label}`); return value }
function hash(value, label) { check(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), `Invalid ${label}`); return value }

function readRecord(filename, root) {
  nonempty(filename, 'record_path', 4096)
  check(!path.isAbsolute(filename), 'record_path must be relative to recordsRoot')
  const realRoot = fs.realpathSync(root)
  const resolved = fs.realpathSync(path.resolve(realRoot, filename))
  const rel = path.relative(realRoot, resolved)
  check(rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel), 'record_path escapes recordsRoot')
  const fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const before = fs.fstatSync(fd)
    check(before.isFile() && before.size <= 262144, 'Runtime record must be a regular file at most 256 KiB')
    const bytes = Buffer.alloc(before.size + 1)
    let size = 0, n = 0
    while (size < bytes.length && (n = fs.readSync(fd, bytes, size, bytes.length - size, null)) > 0) size += n
    const after = fs.fstatSync(fd)
    check(size === before.size && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, 'Runtime record changed during capture')
    return bytes.subarray(0, size)
  } finally { fs.closeSync(fd) }
}

/** No fetch/authentication. The caller supplies local records and the current VIS checkpoint. */
export function projectRuntimeImageRecords(input, { recordsRoot } = {}) {
  check(plain(input) && input.schema_version === 'vis.runtime-image-capture-input.v1', 'Expected vis.runtime-image-capture-input.v1')
  check(Buffer.byteLength(JSON.stringify(input)) <= MAX_MANIFEST_BYTES, 'Runtime input exceeds 4 MiB')
  for (const key of Object.keys(input)) check(['schema_version', 'batch_id', 'source', 'captured_at', 'cursor', 'coverage', 'records'].includes(key), `Unsupported runtime input field: ${key}`)
  check(recordsRoot, 'An explicit recordsRoot is required')
  check(Array.isArray(input.records) && input.records.length <= 250, 'Runtime input must contain at most 250 records')
  check(Number.isSafeInteger(input.cursor?.revision) && input.cursor.revision >= 0, 'Runtime projection requires explicit cursor.revision')
  let readBytes = 0
  const keys = new Set()
  const loaded = input.records.map(descriptor => {
    check(plain(descriptor), 'Invalid runtime record descriptor')
    for (const key of Object.keys(descriptor)) check(['object_key', 'record_path', 'expected_record_sha256', 'local_path'].includes(key), `Unsupported runtime record field: ${key}`)
    nonempty(descriptor.object_key, 'object_key')
    check(!keys.has(descriptor.object_key), 'Duplicate runtime object_key')
    keys.add(descriptor.object_key)
    const bytes = readRecord(descriptor.record_path, recordsRoot)
    readBytes += bytes.length
    check(readBytes <= MAX_MANIFEST_BYTES, 'Runtime records exceed 4 MiB combined')
    const measuredHash = sha256(bytes)
    if (descriptor.expected_record_sha256 != null) check(hash(descriptor.expected_record_sha256, 'expected_record_sha256') === measuredHash, 'Runtime record SHA-256 mismatch')
    const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    check(plain(record) && record.schema === 'starlight.imageGeneration.v1', 'Unsupported runtime image record schema')
    nonempty(record.request_id, 'request_id', 128)
    check(/^[a-zA-Z0-9_-]+$/.test(record.request_id), 'Invalid runtime request_id')
    check(['requested', 'completed', 'failed'].includes(record.generation_phase), 'Invalid generation_phase')
    const prefix = `media-capture/${record.request_id}`
    check(descriptor.object_key === `${prefix}/${record.generation_phase}.json`, 'Runtime object_key does not match its request and phase')
    for (const field of ['run_id', 'project_id', 'brand']) nonempty(record[field], field)
    check(plain(record.generation), 'Runtime generation claims are required')
    for (const field of FIELDS) check(['exact', 'unknown'].includes(record.generation[field]?.status), `Invalid runtime ${field} claim`)
    if (record.generation_phase === 'requested') check(record.generation.resolved_model.status === 'unknown', 'Requested events cannot claim a resolved model')
    for (const [field, response] of [['resolved_model', 'model'], ['revised_prompt', 'revised_prompt']]) {
      if (record.generation[field].status === 'exact') check(record.provider_response?.[response] === record.generation[field].value, `${field} must match provider_response evidence`)
    }
    check(Array.isArray(record.reference_source_item_ids) && record.reference_source_item_ids.length <= 100, 'Invalid reference_source_item_ids')
    record.reference_source_item_ids.forEach(value => nonempty(value, 'reference source item ID'))
    if (record.generation_phase !== 'requested') {
      check(record.request_ref?.key === `${prefix}/requested.json`, 'Invalid request_ref key')
      hash(record.request_ref.sha256, 'request_ref.sha256')
    }
    if (record.generation_phase === 'completed') {
      check(plain(record.output) && record.output.key === `${prefix}/original` && record.output.stored === true, 'Completed record requires stored attempt-specific original')
      hash(record.output.sha256, 'output.sha256')
      check(typeof record.output.content_type === 'string' && record.output.content_type.startsWith('image/'), 'Completed output must declare an image content type')
      check(Number.isSafeInteger(record.output.size_bytes) && record.output.size_bytes > 0, 'Invalid output.size_bytes')
    } else {
      check(record.output == null && descriptor.local_path == null, 'Only completed events can attach image output bytes')
    }
    if (record.generation_phase === 'failed') check(plain(record.failure) && typeof record.failure.code === 'string' && typeof record.failure.stage === 'string', 'Failed record requires failure evidence')
    if (record.completed_image_ref != null) {
      const ref = record.completed_image_ref
      check(record.generation_phase === 'failed' && plain(ref) && ref.requestId === record.request_id && ref.phase === 'completed' && ref.outcomeKey === `${prefix}/completed.json` && ref.originalKey === `${prefix}/original`, 'Invalid completed_image_ref identity')
      hash(ref.outcomeSha256, 'completed_image_ref.outcomeSha256')
      hash(ref.originalSha256, 'completed_image_ref.originalSha256')
    }
    return { descriptor, record, measuredHash, bytes: bytes.length }
  })
  const byKey = new Map(loaded.map(entry => [entry.descriptor.object_key, entry]))
  const items = loaded.map(({ descriptor, record, measuredHash, bytes }) => {
    const request = record.request_ref ? byKey.get(record.request_ref.key) : null
    if (request) check(request.measuredHash === record.request_ref.sha256, 'request_ref SHA-256 differs from the supplied request record')
    const completion = record.completed_image_ref ? byKey.get(record.completed_image_ref.outcomeKey) : null
    if (completion) check(completion.measuredHash === record.completed_image_ref.outcomeSha256 && completion.record.output.sha256 === record.completed_image_ref.originalSha256, 'completed_image_ref differs from the supplied completion record')
    const completed = record.generation_phase === 'completed'
    return {
      source_item_id: descriptor.object_key,
      source_uri: `creator-command-object:${descriptor.object_key}`,
      filename: path.posix.basename(completed ? record.output.key : descriptor.object_key),
      mime_type: completed ? record.output.content_type : 'application/json',
      created_at: record.created_at,
      discovered_at: input.captured_at,
      generation: record.generation,
      concept: record.concept,
      ...(completed ? { expected_sha256: record.output.sha256, ...(descriptor.local_path ? { local_path: descriptor.local_path } : {}) } : {}),
      metadata: {
        request_id: record.request_id, project_id: record.project_id, run_id: record.run_id,
        brand: record.brand, generation_phase: record.generation_phase,
        reference_source_item_ids: record.reference_source_item_ids,
        runtime_capture: {
          object_key: descriptor.object_key, record_path: descriptor.record_path,
          measured_record_sha256: measuredHash, record_bytes: bytes,
          request_ref_status: request ? 'matched-local-record' : record.request_ref ? 'source-declared-only' : 'not-applicable',
          completion_ref_status: completion ? 'matched-local-outcome-and-original-hashes' : record.completed_image_ref ? 'source-declared-only' : 'not-applicable',
          record,
        },
      },
    }
  })
  return normalizeCapture({ schema_version: 'vis.image-capture.v1', batch_id: input.batch_id, source: input.source,
    mode: 'event', captured_at: input.captured_at, cursor: input.cursor, coverage: input.coverage, items })
}
