// Offline, source-bound intake into the existing VIS graph. Storage locations and
// tenant bindings are operator configuration; neither is taken from a package.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomUUID, sign, verify, createPublicKey, createPrivateKey } from 'node:crypto'
import { recordProvenance, upsertAssetGraph, DEFAULT_CONFIG, stableId } from './vis-core.mjs'
import { createLibrarySchema, libraryConfig, renderLadder, renditionPath } from './vis-library.mjs'

const LIMIT = 128 * 1024 * 1024
const FORMATS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/wav': '.wav',
  'audio/flac': '.flac',
  'application/pdf': '.pdf'
}
const SOURCES = ['chatgpt-image', 'figma-export', 'creator-media', 'diagram', 'video', 'original']
const RIGHTS = ['unknown', 'needs-review', 'owned', 'generated-owned', 'licensed', 'blocked']
const CONSENT = ['unknown', 'granted', 'not-required', 'denied']
const digest = (input) => createHash('sha256').update(input).digest('hex')
function check(ok, message) {
  if (!ok) throw new Error(message)
}
function nonempty(value, label, max = 1024) {
  check(
    typeof value === 'string' && value.trim() && value.length <= max && !/[\x00-\x1f]/.test(value),
    'Invalid ' + label
  )
  return value
}
function nullable(value, label) {
  return value == null ? null : nonempty(value, label)
}
function choice(value, options, label) {
  check(options.includes(value), 'Invalid ' + label)
  return value
}
function micros(value, label) {
  if (value == null) return null
  check(Number.isSafeInteger(value) && value >= 0, 'Invalid ' + label)
  return value
}
function fields(value, names, label) {
  check(value && typeof value === 'object' && !Array.isArray(value), 'Invalid ' + label)
  check(
    Object.keys(value).every((k) => names.includes(k)),
    'Unknown ' + label + ' field'
  )
}
function comparable(value) {
  if (Array.isArray(value)) return '[' + value.map(comparable).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + comparable(value[k]))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}
function checksum(s) {
  check(typeof s === 'string' && /^[a-f0-9]{64}$/.test(s), 'Invalid SHA-256')
  return s
}
function workspace(tenant) {
  check(
    typeof tenant === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(tenant),
    'Invalid workspace'
  )
  return tenant
}
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
export function initializeReviewWorkspace(db, tenant) {
  workspace(tenant)
  tx(db, () => {
    createLibrarySchema(db)
    db.exec(`CREATE TABLE IF NOT EXISTS vis_review_workspace (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1), tenant TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS vis_review_intake (
        asset_id TEXT PRIMARY KEY REFERENCES asset(asset_id), version TEXT NOT NULL REFERENCES asset_version(version_id),
        sha256 TEXT NOT NULL, record_json TEXT NOT NULL, created_at TEXT NOT NULL,
        json_source_uri TEXT GENERATED ALWAYS AS (json_extract(record_json,'$.input.source_uri')) VIRTUAL,
        json_source_version TEXT GENERATED ALWAYS AS (json_extract(record_json,'$.input.source_version')) VIRTUAL,
        UNIQUE(json_source_uri, json_source_version));
      CREATE TABLE IF NOT EXISTS vis_review_rendition_digest(
        asset_id TEXT NOT NULL REFERENCES asset(asset_id), version TEXT NOT NULL REFERENCES asset_version(version_id),
        kind TEXT NOT NULL, sha256 TEXT NOT NULL, PRIMARY KEY(asset_id,version,kind));`)
    const saved = db.prepare('SELECT tenant FROM vis_review_workspace WHERE singleton=1').get()
    if (saved) return assertReviewWorkspace(db, tenant)
    check(
      !db.prepare('SELECT 1 FROM asset LIMIT 1').get(),
      'A populated database requires verified migration before tenant enrolment'
    )
    db.prepare('INSERT INTO vis_review_workspace VALUES (1,?)').run(tenant)
  })
}
export function assertReviewWorkspace(db, tenant) {
  workspace(tenant)
  check(
    db.prepare('SELECT tenant FROM vis_review_workspace WHERE singleton=1').get()?.tenant === tenant,
    'Workspace binding required'
  )
}

function normalize(input) {
  fields(
    input,
    [
      'kind',
      'source_uri',
      'source_version',
      'title',
      'brand',
      'maker',
      'sha256',
      'mime_type',
      'rights',
      'consent',
      'rights_expires_at',
      'licence_ref',
      'consent_ref',
      'owner',
      'parents',
      'execution'
    ],
    'intake'
  )
  let uri
  try {
    uri = new URL(nonempty(input.source_uri, 'source_uri', 4096))
  } catch {
    throw new Error('Durable source URI required')
  }
  check(
    ['https:', 'urn:'].includes(uri.protocol) && !uri.username && !uri.password,
    'Durable source URI required'
  )
  check(
    ![...uri.searchParams.keys()].some((k) => /token|sig|cred|secret|expires/i.test(k)) &&
      !/(?:^|\.)(?:oaiusercontent\.com|blob\.core\.windows\.net)$/.test(uri.hostname),
    'Use a durable source record, not a temporary download URL'
  )
  const expires = nullable(input.rights_expires_at, 'rights expiry')
  if (expires)
    check(
      /^\d{4}-\d{2}-\d{2}T.*Z$/.test(expires) && !Number.isNaN(Date.parse(expires)),
      'Invalid rights expiry'
    )
  const parents = input.parents ?? []
  check(Array.isArray(parents) && parents.length <= 32, 'Invalid parents')
  const run = input.execution ?? {}
  fields(
    run,
    [
      'run_id',
      'provider',
      'requested_model',
      'resolved_model',
      'prompt_ref',
      'cost_micros',
      'currency',
      'input_tokens',
      'output_tokens'
    ],
    'execution'
  )
  const cost = micros(run.cost_micros, 'cost')
  check(
    cost == null ? run.currency == null : /^[A-Z]{3}$/.test(run.currency ?? ''),
    'Cost requires a currency'
  )
  return {
    kind: choice(input.kind, SOURCES, 'source kind'),
    source_uri: uri.href,
    source_version: nonempty(input.source_version, 'source_version'),
    title: nonempty(input.title, 'title', 300),
    brand: nonempty(input.brand, 'brand', 160),
    maker: nonempty(input.maker, 'maker', 160),
    sha256: checksum(input.sha256),
    mime_type: choice(input.mime_type, Object.keys(FORMATS), 'MIME type'),
    rights: choice(input.rights ?? 'unknown', RIGHTS, 'rights'),
    owner: nullable(input.owner, 'owner'),
    licence_ref: nullable(input.licence_ref, 'licence reference'),
    consent: choice(input.consent ?? 'unknown', CONSENT, 'consent'),
    consent_ref: nullable(input.consent_ref, 'consent reference'),
    rights_expires_at: expires,
    parents: parents.map((p) => {
      fields(p, ['asset_id', 'version', 'sha256'], 'parent')
      return {
        asset_id: nonempty(p.asset_id, 'parent id'),
        version: nonempty(p.version, 'parent version'),
        sha256: checksum(p.sha256)
      }
    }),
    execution: {
      run_id: nullable(run.run_id, 'run id'),
      provider: nullable(run.provider, 'provider'),
      requested_model: nullable(run.requested_model, 'requested model'),
      resolved_model: nullable(run.resolved_model, 'resolved model'),
      prompt_ref: nullable(run.prompt_ref, 'prompt reference'),
      cost_micros: cost,
      currency: run.currency ?? null,
      input_tokens: micros(run.input_tokens, 'input tokens'),
      output_tokens: micros(run.output_tokens, 'output tokens')
    }
  }
}

function detect(bytes) {
  const has = (s, off = 0) => bytes.subarray(off, off + s.length).equals(Buffer.from(s, 'latin1'))
  if (has('\x89PNG\r\n\x1a\n')) return 'image/png'
  if (has('\xff\xd8\xff')) return 'image/jpeg'
  if (has('RIFF') && has('WEBP', 8)) return 'image/webp'
  if (has('GIF89a') || has('GIF87a')) return 'image/gif'
  if (has('ftyp', 4)) return 'video/mp4'
  if (has('\x1a\x45\xdf\xa3')) return 'video/webm'
  if (has('RIFF') && has('WAVE', 8)) return 'audio/wav'
  if (has('fLaC')) return 'audio/flac'
  if (has('%PDF-')) return 'application/pdf'
  if (/^\s*(?:<\?xml[^?]*\?>\s*)?<svg(?:\s|>)/i.test(bytes.subarray(0, 1024).toString('utf8')))
    return 'image/svg+xml'
  return null
}

async function inspect(bytes, input) {
  check(
    Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= LIMIT,
    'Invalid or oversized original'
  )
  check(digest(bytes) === input.sha256, 'Original checksum mismatch')
  check(detect(bytes) === input.mime_type, 'Original MIME mismatch')
  const result = {
    width: null,
    height: null,
    technical_pass: false,
    validation: 'signature-only',
    malware_status: 'unscanned'
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(input.mime_type)) return result
  const { default: sharp } = await import('sharp')
  const decoder = sharp(bytes, { failOn: 'warning', limitInputPixels: 16_777_216 })
  const meta = await decoder.metadata()
  result.width = meta.width
  result.height = meta.height
  if ((meta.pages ?? 1) > 1) {
    result.validation = 'animation-requires-review'
    return result
  }
  // Forces a full pixel decode. Metadata alone can succeed on a truncated file.
  await decoder.raw().toBuffer()
  return { ...result, technical_pass: true, validation: 'decoded-static-raster' }
}

function regularRead(file, limit) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
  try {
    const stat = fs.fstatSync(fd)
    check(stat.isFile() && stat.size > 0 && stat.size <= limit, 'Invalid file or size')
    const bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset)
      check(n > 0, 'Truncated file')
      offset += n
    }
    check(fs.fstatSync(fd).size === bytes.length, 'File size changed')
    return bytes
  } finally {
    fs.closeSync(fd)
  }
}
function directory(dir) {
  const absolute = path.resolve(dir)
  check(
    fs.realpathSync(absolute) === absolute && fs.statSync(absolute).isDirectory(),
    'Storage must be an existing non-symlink directory'
  )
  return absolute
}
function putBytes(dir, name, bytes) {
  const root = directory(dir)
  const target = path.join(root, name)
  const tmp = path.join(root, '.vis-' + randomUUID())
  const fd = fs.openSync(tmp, 'wx', 0o600)
  try {
    try {
      fs.writeFileSync(fd, bytes)
      fs.fchmodSync(fd, 0o400)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    try {
      fs.linkSync(tmp, target)
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    check(
      digest(regularRead(target, Math.max(LIMIT, bytes.length))) === digest(bytes),
      'Stored object checksum mismatch'
    )
    return target
  } finally {
    fs.unlinkSync(tmp)
  }
}
function readRecord(db, tenant, assetId) {
  assertReviewWorkspace(db, tenant)
  const row = db
    .prepare(
      `SELECT i.*,v.sha256 AS graph_hash,v.asset_id AS graph_id,a.rights_status,
    a.source_hash AS original_hash FROM vis_review_intake i JOIN asset_version v ON v.version_id=i.version
    JOIN asset a ON a.asset_id=i.asset_id WHERE i.asset_id=?`
    )
    .get(assetId)
  if (!row) return null
  check(
    row.graph_id === assetId && row.graph_hash === row.sha256 && row.original_hash === row.sha256,
    'VIS version mismatch'
  )
  return { row, record: JSON.parse(row.record_json) }
}
function restored(record) {
  const key = record.input.sha256 + FORMATS[record.input.mime_type]
  const bytes = regularRead(path.join(directory(record.storage_dir), key), LIMIT)
  check(digest(bytes) === record.input.sha256, 'Stored object checksum mismatch')
  return bytes
}
function publicRecord({ row, record }) {
  return {
    ...record.input,
    ...record.technical,
    asset_id: row.asset_id,
    version: row.version,
    sha256: row.sha256,
    rights: row.rights_status === 'blocked' ? 'blocked' : record.input.rights
  }
}
export function getReviewIntakeMetadata(db, tenant, assetId) {
  const found = readRecord(db, tenant, assetId)
  return found ? publicRecord(found) : null
}
export function getReviewIntake(db, tenant, assetId) {
  const found = readRecord(db, tenant, assetId)
  if (!found) return null
  restored(found.record)
  return publicRecord(found)
}
export function readReviewRendition(db, { tenant, assetId, kind, sha256, root }) {
  const entry = getReviewIntake(db, tenant, assetId)
  if (!entry || !['thumb', 'preview'].includes(kind) || entry.sha256 !== sha256) return null
  const expected = db
    .prepare('SELECT sha256 FROM vis_review_rendition_digest WHERE asset_id=? AND version=? AND kind=?')
    .get(assetId, entry.version, kind)
  if (!expected) return null
  const file = renditionPath(root, db, assetId, kind)
  if (!file) return null
  directory(path.dirname(file))
  const bytes = regularRead(file, LIMIT)
  check(digest(bytes) === expected.sha256, 'Rendition checksum mismatch')
  return bytes
}

export async function ingestReviewAsset(db, { tenant, storageDir, root, manifest, bytes, actor }) {
  assertReviewWorkspace(db, tenant)
  nonempty(actor, 'ingesting actor', 160)
  const input = normalize(manifest)
  // Caller may own the input buffer. Pin a private snapshot across asynchronous decode.
  check(Buffer.isBuffer(bytes) && bytes.length <= LIMIT, 'Invalid or oversized original')
  bytes = Buffer.from(bytes)
  const technical = await inspect(bytes, input)
  const storeRoot = directory(storageDir)
  const workspaceDir = path.join(storeRoot, 'workspace-' + digest(tenant))
  fs.mkdirSync(workspaceDir, { recursive: true, mode: 0o700 })
  const storage = directory(workspaceDir)
  const mediaType = input.mime_type === 'application/pdf' ? 'document' : input.mime_type.split('/')[0]
  const assetId = 'asset_' + input.sha256.slice(0, 24)
  const version =
    'ver_' + createHash('sha256').update(bytes).update('\0').update(mediaType).digest('hex').slice(0, 32)
  const extension = FORMATS[input.mime_type]
  const objectName = input.sha256 + extension
  for (const p of input.parents) {
    const parent = getReviewIntake(db, tenant, p.asset_id)
    check(
      p.asset_id !== assetId && parent && parent.version === p.version && parent.sha256 === p.sha256,
      'Missing or stale parent'
    )
  }
  function duplicate() {
    const prior = readRecord(db, tenant, assetId)
    if (!prior) return false
    check(
      prior.row.sha256 === input.sha256 &&
        comparable(prior.record.input) === comparable(input) &&
        prior.record.storage_dir === storage,
      'Conflicting immutable intake'
    )
    restored(prior.record)
    return true
  }
  const hasRecord = duplicate()
  if (hasRecord) {
    if (
      root &&
      technical.technical_pass &&
      !db
        .prepare(
          "SELECT 1 FROM vis_review_rendition_digest WHERE asset_id=? AND version=? AND kind='preview'"
        )
        .get(assetId, version)
    ) {
      await renderReviewRenditions(db, root, path.join(storage, objectName), assetId, input.sha256)
    }
    return getReviewIntake(db, tenant, assetId)
  }
  const file = path.join(storage, objectName)
  const now = new Date().toISOString()
  const graph = {
    assetId,
    versionId: version,
    sha256: input.sha256,
    sourceHash: input.sha256,
    mediaType,
    mimeType: input.mime_type,
    extension,
    title: input.title,
    relativePath: objectName,
    mediaRelativePath: objectName,
    absolutePath: file,
    root: storage,
    repo: 'vis-review',
    publicPath: null,
    category: 'intake',
    mood: null,
    tags: [input.brand],
    createdAt: now,
    modifiedAt: now,
    width: technical.width,
    height: technical.height,
    durationSeconds: null,
    byteSize: bytes.length,
    sidecars: []
  }
  tx(db, () => {
    if (duplicate()) return
    const collision = db.prepare('SELECT source_hash FROM asset WHERE asset_id=?').get(assetId)
    check(!collision || collision.source_hash === input.sha256, 'Asset identity conflict')
    const versionRow = db
      .prepare('SELECT asset_id,sha256 FROM asset_version WHERE version_id=?')
      .get(version)
    check(
      !versionRow || (versionRow.asset_id === assetId && versionRow.sha256 === input.sha256),
      'Version identity conflict'
    )
    check(
      !db
        .prepare('SELECT 1 FROM vis_review_intake WHERE json_source_uri=? AND json_source_version=?')
        .get(input.source_uri, input.source_version),
      'Conflicting immutable source version'
    )
    putBytes(storage, objectName, bytes)
    // Preserve metadata/primary location of an already indexed version.
    if (!versionRow) upsertAssetGraph(db, graph, DEFAULT_CONFIG)
    const record = { input, technical, storage_dir: storage }
    db.prepare(
      'INSERT INTO vis_review_intake(asset_id,version,sha256,record_json,created_at) VALUES (?,?,?,?,?)'
    ).run(assetId, version, input.sha256, JSON.stringify(record), now)
    db.prepare('INSERT OR IGNORE INTO library_file_state VALUES (?,?,?,?,?,?,?)').run(
      file,
      'vis-review',
      bytes.length,
      Math.trunc(fs.statSync(file).mtimeMs),
      input.sha256,
      assetId,
      now
    )
    db.prepare(
      `INSERT INTO storage_object(storage_object_id,asset_id,version_id,provider,key,checksum,status,metadata_json,created_at)
      VALUES (?,?,?,'customer-local',?,?,'verified','{}',?)`
    ).run(stableId('obj', assetId + version), assetId, version, objectName, input.sha256, now)
    for (const p of input.parents) {
      db.prepare('INSERT OR IGNORE INTO asset_derivative VALUES (?,?,?,?,?)').run(
        stableId('der', p.version + version),
        p.asset_id,
        assetId,
        JSON.stringify({ parent_version: p.version, parent_sha256: p.sha256, derived_version: version }),
        now
      )
    }
    recordProvenance(db, {
      assetId,
      versionId: version,
      eventType: 'review-intake',
      actor,
      source: input.source_uri,
      payload: { ...input, technical, storage_key: objectName },
      createdAt: now
    })
  })
  if (root && technical.technical_pass) await renderReviewRenditions(db, root, file, assetId, input.sha256)
  return getReviewIntake(db, tenant, assetId)
}

// An interrupted commit can leave a file before its database receipt. Retrying
// reuses verified bytes. Report discrepancies without deleting anything.
export function auditReviewStorage(db, { tenant, storageDir }) {
  assertReviewWorkspace(db, tenant)
  const store = path.join(directory(storageDir), 'workspace-' + digest(tenant))
  const records = db
    .prepare('SELECT record_json FROM vis_review_intake')
    .all()
    .map((row) => JSON.parse(row.record_json))
    .filter((r) => r.storage_dir === store)
  const expected = new Set(records.map((r) => r.input.sha256 + FORMATS[r.input.mime_type]))
  const objects = fs.existsSync(store) ? fs.readdirSync(directory(store)) : []
  const invalid = []
  for (const r of records) {
    try {
      restored(r)
    } catch {
      invalid.push(r.input.sha256)
    }
  }
  return {
    verified: records.length - invalid.length,
    invalid,
    untracked: objects.filter((name) => !expected.has(name))
  }
}

async function renderReviewRenditions(db, root, file, assetId, hash) {
  const { loadConfig, resolveProjectPath, expandPathTokens } = await import('./vis-core.mjs')
  const config = libraryConfig(loadConfig(root))
  const dir = resolveProjectPath(root, expandPathTokens(config.renditionsDir))
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  directory(dir)
  const targetDir = path.join(dir, hash.slice(0, 2))
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 })
  directory(targetDir)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-render-'))
  try {
    const original = regularRead(file, LIMIT)
    check(digest(original) === hash, 'Original changed before render')
    const isolated = putBytes(tempDir, 'original' + path.extname(file), original)
    const out = await renderLadder(isolated, hash, tempDir, config)
    const version = db
      .prepare('SELECT version FROM vis_review_intake WHERE asset_id=?')
      .get(assetId).version
    const insert =
      db.prepare(`INSERT OR IGNORE INTO asset_rendition (rendition_id,asset_id,sha256,kind,storage,path,data_text,mime_type,width,height,byte_size,created_at)
      VALUES (?,?,?,?,'local',?,?,?,?,?,?,?)`)
    tx(db, () => {
      for (const r of out) {
        let target = null
        if (r.path) {
          const bytes = regularRead(r.path, LIMIT)
          target = putBytes(targetDir, hash + '.' + r.kind + '.webp', bytes)
          const prior = db
            .prepare(
              'SELECT sha256 FROM vis_review_rendition_digest WHERE asset_id=? AND version=? AND kind=?'
            )
            .get(assetId, version, r.kind)
          check(!prior || prior.sha256 === digest(bytes), 'Rendition digest conflict')
          db.prepare('INSERT OR IGNORE INTO vis_review_rendition_digest VALUES (?,?,?,?)').run(
            assetId,
            version,
            r.kind,
            digest(bytes)
          )
        }
        insert.run(
          stableId('rnd', hash + ':' + r.kind + ':local'),
          assetId,
          hash,
          r.kind,
          target ? path.relative(root, target) : null,
          r.data ?? null,
          r.mime ?? null,
          r.width ?? null,
          r.height ?? null,
          r.bytes,
          new Date().toISOString()
        )
      }
    })
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function edKey(key, privateKey) {
  const parsed = privateKey ? createPrivateKey(key) : createPublicKey(key)
  check(parsed.asymmetricKeyType === 'ed25519', 'An Ed25519 key is required')
  return parsed
}
// Package filenames are derived locally, never resolved from a manifest path.
export function exportReviewAsset(db, { tenant, assetId, packageDir, privateKey }) {
  const found = readRecord(db, tenant, assetId)
  check(found, 'Unknown review intake')
  const bytes = restored(found.record)
  const payload = {
    schema: 'vis.review-package.v1',
    workspace: tenant,
    asset_id: assetId,
    version: found.row.version,
    input: found.record.input
  }
  const signature = sign(null, Buffer.from(comparable(payload)), edKey(privateKey, true)).toString('base64')
  putBytes(packageDir, 'original.bin', bytes)
  putBytes(packageDir, 'manifest.json', Buffer.from(JSON.stringify({ payload, signature }, null, 2) + '\n'))
  return { asset_id: assetId, version: found.row.version, sha256: found.row.sha256 }
}
export async function importReviewAsset(db, { tenant, root, actor, packageDir, storageDir, publicKey }) {
  assertReviewWorkspace(db, tenant)
  const pkg = directory(packageDir)
  const { payload, signature } = JSON.parse(
    regularRead(path.join(pkg, 'manifest.json'), 256 * 1024).toString('utf8')
  )
  check(
    typeof signature === 'string' &&
      verify(
        null,
        Buffer.from(comparable(payload)),
        edKey(publicKey, false),
        Buffer.from(signature, 'base64')
      ),
    'Invalid package signature'
  )
  check(
    payload.schema === 'vis.review-package.v1' && payload.workspace === tenant,
    'Package workspace/schema mismatch'
  )
  const manifest = normalize(payload.input)
  const bytes = regularRead(path.join(pkg, 'original.bin'), LIMIT)
  const mediaType = manifest.mime_type === 'application/pdf' ? 'document' : manifest.mime_type.split('/')[0]
  const version =
    'ver_' + createHash('sha256').update(bytes).update('\0').update(mediaType).digest('hex').slice(0, 32)
  check(
    payload.asset_id === 'asset_' + manifest.sha256.slice(0, 24) && payload.version === version,
    'Package identity mismatch'
  )
  return ingestReviewAsset(db, { tenant, storageDir, root, actor, manifest, bytes })
}

export function readReviewInput(file) {
  return regularRead(file, LIMIT)
}
export function readReviewManifest(file) {
  return JSON.parse(regularRead(file, 256 * 1024).toString('utf8'))
}
