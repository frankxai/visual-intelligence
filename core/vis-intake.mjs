import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, createPublicKey, verify } from 'node:crypto'
import {
  buildAssetEntry,
  recordProvenance,
  upsertAssetGraph,
  loadConfig,
  expandPathTokens,
} from './vis-core.mjs'
import { createLocalStorage, masterKey, sha256File } from './vis-storage.mjs'
import { libraryConfig, recordRenditions, renderLadder } from './vis-library.mjs'
import { bindReview } from './vis-review.mjs'

const hash = (b) => createHash('sha256').update(b).digest('hex')
export const SOURCE_KINDS = ['chatgpt-image', 'figma-export', 'creator-media', 'diagram', 'video', 'original']
const formats = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'image/svg+xml': '.svg',
}
const nonempty = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 1500
const digest = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
export { manifestBytes } from './vis-intake-contract.mjs'
import { manifestBytes } from './vis-intake-contract.mjs'
function validate(m, policy, envelope) {
  const data = manifestBytes(m)
  if (
    m.schema !== 'vis.intake.v1' ||
    m.workspace !== policy.workspace ||
    !SOURCE_KINDS.includes(m.sourceKind) ||
    !Object.hasOwn(formats, m.mime) ||
    !digest(m.sha256) ||
    !Number.isSafeInteger(m.bytes) ||
    m.bytes <= 0 ||
    m.bytes > 128 * 1024 * 1024 ||
    !['title', 'sourceRef', 'sourceVersion', 'sourceOwner', 'actor', 'run', 'brand'].every((k) =>
      nonempty(m[k]),
    ) ||
    !['rightsRef', 'consentRef', 'model', 'parent', 'folioRef', 'promptRef'].every(
      (k) => m[k] === null || nonempty(m[k]),
    ) ||
    !(m.costMicros === null || (Number.isSafeInteger(m.costMicros) && m.costMicros >= 0)) ||
    !(m.costMicros === null ? m.currency === null : /^[A-Z]{3}$/.test(m.currency))
  )
    throw Error('Invalid intake contract')
  const source = new URL(m.sourceRef)
  if (!['https:', 'urn:'].includes(source.protocol) || source.username || source.password || source.search)
    throw Error('Stable source pointer required')
  const principal = policy.ingesters?.find(
    (k) => k.actor === m.actor && k.brands.includes(m.brand) && k.sourceKinds.includes(m.sourceKind),
  )
  if (!principal || typeof envelope.signature !== 'string') throw Error('Intake scope denied')
  const key = createPublicKey(principal.publicKey)
  if (
    key.asymmetricKeyType !== 'ed25519' ||
    !verify(null, data, key, Buffer.from(envelope.signature, 'base64url'))
  )
    throw Error('Intake signature invalid')
  return hash(data)
}
async function checkFormat(file, mime) {
  if (mime === 'image/svg+xml' || mime === 'video/mp4') {
    const fd = fs.openSync(file, 'r'),
      b = Buffer.alloc(4096)
    try {
      fs.readSync(fd, b, 0, b.length, 0)
    } finally {
      fs.closeSync(fd)
    }
    const ok =
      mime === 'video/mp4'
        ? b.toString('ascii', 4, 8) === 'ftyp'
        : /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/.test(b.toString('utf8'))
    if (!ok) throw Error('Container signature mismatch')
    return { level: 'container-only', width: null, height: null }
  }
  const sharp = (await import('sharp')).default
  const image = sharp(file, { limitInputPixels: 32000000, failOn: 'warning' })
  const info = await image.metadata()
  if ('image/' + info.format !== mime || !info.width || !info.height) throw Error('Decoded MIME mismatch')
  await image.clone().resize({ width: 1, height: 1 }).raw().toBuffer()
  return { level: 'decoded-raster', width: info.width, height: info.height }
}

// Local orchestration only. The caller supplies one customer-owned root. No remote writes or signing keys.
export async function importOriginal({ db, project, policy, objectRoot, file, envelope }) {
  const m = envelope.manifest,
    manifestHash = validate(m, policy, envelope)
  bindReview(db, policy.workspace, policy.enrollmentDigest)
  const stats = fs.statSync(file)
  if (!stats.isFile() || stats.size !== m.bytes) throw Error('Byte count mismatch')
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-intake-'))
  try {
    const staged = path.join(stage, 'original' + formats[m.mime])
    fs.copyFileSync(file, staged, fs.constants.COPYFILE_EXCL)
    if (sha256File(staged) !== m.sha256) throw Error('Original digest mismatch')
    const technical = await checkFormat(staged, m.mime)
    const entry = buildAssetEntry(stage, stage, staged)
    if (!entry || entry.sha256 !== m.sha256) throw Error('VIS identity unavailable')
    if (
      m.parent &&
      (!db.prepare('SELECT 1 FROM asset WHERE asset_id=?').get(m.parent) || m.parent === entry.assetId)
    )
      throw Error('Invalid parent')
    const storage = createLocalStorage({ dir: objectRoot })
    const stored = await storage.putMaster(m.sha256, staged)
    const restored = path.join(stage, 'readback')
    await storage.getMaster(m.sha256, restored)
    const lib = libraryConfig(loadConfig(project))
    const renditions =
      technical.level === 'decoded-raster' &&
      !db.prepare('SELECT 1 FROM asset_rendition WHERE asset_id=?').get(entry.assetId)
        ? await renderLadder(
            staged,
            m.sha256,
            path.resolve(project, expandPathTokens(lib.renditionsDir)),
            lib,
          )
        : []
    const eventId = 'intake_' + manifestHash
    db.exec('BEGIN IMMEDIATE')
    try {
      const previous = db
        .prepare('SELECT asset_id FROM provenance_event WHERE provenance_event_id=?')
        .get(eventId)
      if (!previous) {
        entry.title = m.title
        entry.root = path.resolve(objectRoot)
        entry.mediaRoot = entry.root
        entry.relativePath = stored.key
        entry.mediaRelativePath = stored.key
        entry.absolutePath = path.join(entry.root, stored.key)
        entry.publicPath = null
        entry.repo = null
        upsertAssetGraph(db, entry)
        recordRenditions(db, project, entry, renditions)
        if (m.parent) {
          const cycle = db
            .prepare(
              `WITH RECURSIVE descendants(id) AS (
            SELECT derived_asset_id FROM asset_derivative WHERE source_asset_id=? UNION
            SELECT d.derived_asset_id FROM asset_derivative d JOIN descendants c ON c.id=d.source_asset_id
          ) SELECT 1 FROM descendants WHERE id=?`,
            )
            .get(entry.assetId, m.parent)
          if (cycle) throw Error('Lineage cycle')
          db.prepare('INSERT OR IGNORE INTO asset_derivative VALUES(?,?,?,?,?)').run(
            'der_' + hash(JSON.stringify([m.parent, entry.assetId])),
            m.parent,
            entry.assetId,
            JSON.stringify({ sourceRef: m.sourceRef }),
            new Date().toISOString(),
          )
        }
        recordProvenance(db, {
          eventId,
          assetId: entry.assetId,
          versionId: entry.versionId,
          actor: m.actor,
          source: m.sourceRef,
          eventType: 'verified-original-intake',
          payload: {
            envelope,
            technical,
            objectKey: stored.key,
            restoredSha256: m.sha256,
            malware: 'unassessed',
          },
        })
      }
      db.exec('COMMIT')
      return {
        asset: entry.assetId,
        version: entry.versionId,
        sha256: m.sha256,
        duplicate: Boolean(previous),
        objectKey: stored.key,
        technical,
        eventId,
      }
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true })
  }
}

export async function exportOriginal({ db, policy, objectRoot, eventId, directory }) {
  bindReview(db, policy.workspace, policy.enrollmentDigest)
  const row = db
    .prepare(
      "SELECT payload_json FROM provenance_event WHERE provenance_event_id=? AND event_type='verified-original-intake'",
    )
    .get(eventId)
  if (!row) throw Error('Intake receipt unavailable')
  const { envelope, objectKey } = JSON.parse(row.payload_json),
    m = envelope.manifest
  if (m.workspace !== policy.workspace || objectKey !== masterKey(m.sha256))
    throw Error('Export scope mismatch')
  fs.mkdirSync(directory, { recursive: false, mode: 0o700 })
  try {
    await createLocalStorage({ dir: objectRoot }).getMaster(m.sha256, path.join(directory, 'original'))
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(envelope, null, 2), {
      flag: 'wx',
      mode: 0o600,
    })
  } catch (e) {
    fs.rmSync(directory, { recursive: true, force: true })
    throw e
  }
}
