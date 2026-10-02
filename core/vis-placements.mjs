/**
 * VIS placements — which bytes are live on which site, read from git.
 *
 * A site is a git repository plus the ref that deploys (for frankx.ai,
 * `origin/main`) and the folder served at the web root (`public`). The
 * committed tree is read straight from the object store with
 * `git cat-file --batch`, so a working copy on another branch never leaks
 * into "live", and nothing in that repository is written. Git blob ids are
 * content hashes, so a blob hashed once is never hashed again.
 *
 * Read-only toward the site. Writes only VIS's own database.
 */

import { spawn, execFileSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { expandPathTokens, findProjectRoot, loadConfig, normalizeConfig, recordProvenance, resolveProjectPath } from './vis-core.mjs'
import { createLibrarySchema, openLibraryDatabase } from './vis-library.mjs'

export const PLACEMENT_MEDIA = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.mp4', '.webm', '.mov', '.mp3', '.wav', '.m4a', '.ogg'])

// The tables live in the library schema (core/vis-library.mjs createLibrarySchema).
export function createPlacementSchema(db) {
  createLibrarySchema(db)
}

export function resolvePlacementSites(root, config) {
  return ((config.placements && config.placements.sites) || []).map(site => ({
    label: site.label,
    repo: path.resolve(root, expandPathTokens(site.repo)),
    ref: site.ref || 'origin/main',
    webRoot: (site.webRoot || 'public').replace(/\\/g, '/').replace(/\/$/, ''),
    publicBase: String(site.publicBase || '').replace(/\/$/, ''),
  }))
}

/** Plan, then (execute:true) record what each site's deploy ref serves. */
export async function observePlacements(options = {}) {
  const root = path.resolve(options.root || findProjectRoot())
  const config = normalizeConfig({ ...loadConfig(root), ...(options.config || {}) })
  const sites = resolvePlacementSites(root, config).filter(s => !options.site || s.label === options.site)
  const execute = options.execute === true
  const db = openLibraryDatabase(root, config)
  createPlacementSchema(db)
  const startedAt = nowIso()
  const results = []
  try {
    for (const site of sites) {
      results.push(await observeSite(db, site, { execute }))
    }
    const summary = { schema: 'vis.placement-observe-receipt.v1', dryRun: !execute, startedAt, completedAt: nowIso(), sites: results }
    if (execute) {
      const lib = { receiptsDir: 'data/receipts', ...(config.library || {}) }
      const dir = resolveProjectPath(root, expandPathTokens(options.receiptsDir || lib.receiptsDir))
      fs.mkdirSync(dir, { recursive: true })
      summary.receiptPath = path.join(dir, `placements-${startedAt.replace(/[:.]/g, '-')}.json`)
      fs.writeFileSync(summary.receiptPath, JSON.stringify(summary, null, 2))
    }
    return summary
  } finally {
    db.close()
  }
}

async function observeSite(db, site, { execute }) {
  if (!fs.existsSync(path.join(site.repo, '.git'))) return { site: site.label, error: `not a git repository: ${site.repo}` }
  const git = (...args) => execFileSync('git', ['-C', site.repo, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  let commit
  try { commit = git('rev-parse', '--verify', `${site.ref}^{commit}`).trim() } catch { return { site: site.label, error: `ref not found: ${site.ref}` } }
  const entries = parseLsTree(git('ls-tree', '-r', '-l', '-z', commit, '--', site.webRoot))
    .filter(e => e.type === 'blob' && PLACEMENT_MEDIA.has(path.extname(e.path).toLowerCase()))

  const known = new Set(db.prepare('SELECT blob_id FROM placement_blob').all().map(r => r.blob_id))
  const toHash = [...new Set(entries.map(e => e.blob).filter(b => !known.has(b)))]
  const base = {
    site: site.label,
    ref: site.ref,
    commit,
    mediaFiles: entries.length,
    blobsToHash: toHash.length,
    bytesToHash: entries.filter(e => toHash.includes(e.blob)).reduce((s, e) => s + e.size, 0),
  }
  if (!execute) return base

  const hashes = await hashBlobs(site.repo, toHash)
  const insertBlob = db.prepare('INSERT OR IGNORE INTO placement_blob (blob_id, sha256, byte_size) VALUES (?, ?, ?)')
  for (const [blob, h] of hashes) insertBlob.run(blob, h.sha256, h.size)
  const shaOf = blob => db.prepare('SELECT sha256 FROM placement_blob WHERE blob_id = ?').get(blob)?.sha256

  const ts = nowIso()
  let added = 0
  let changed = 0
  const live = new Set()
  db.exec('BEGIN')
  try {
    for (const e of entries) {
      const sha = shaOf(e.blob)
      if (!sha) continue
      const id = stableId('plc', `${site.label}:${e.path}`)
      live.add(id)
      const rel = e.path.slice(site.webRoot.length).replace(/^\//, '')
      const url = `${site.publicBase}/${rel.split('/').map(encodeURIComponent).join('/')}`
      const prior = db.prepare('SELECT sha256, status FROM asset_placement WHERE placement_id = ?').get(id)
      if (!prior) added++
      else if (prior.sha256 !== sha || prior.status !== 'live') changed++
      db.prepare(`
INSERT INTO asset_placement (placement_id, site, url, repo_path, blob_id, sha256, ref, commit_sha, source, status, first_seen_at, last_seen_at, gone_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'observed', 'live', ?, ?, NULL)
ON CONFLICT(placement_id) DO UPDATE SET url = excluded.url, blob_id = excluded.blob_id, sha256 = excluded.sha256,
  ref = excluded.ref, commit_sha = excluded.commit_sha, status = 'live', last_seen_at = excluded.last_seen_at, gone_at = NULL`).run(
        id, site.label, url, e.path, e.blob, sha, site.ref, commit, ts, ts,
      )
      const asset = db.prepare('SELECT asset_id FROM asset WHERE source_hash = ?').get(sha)
      if (asset && (!prior || prior.sha256 !== sha)) {
        recordProvenance(db, { assetId: asset.asset_id, eventType: 'placement-observed', actor: 'vis-placements', source: url, payload: { site: site.label, commit, repoPath: e.path } })
      }
    }
    const gone = db.prepare("SELECT placement_id FROM asset_placement WHERE site = ? AND status = 'live'").all(site.label)
      .filter(r => !live.has(r.placement_id))
    for (const r of gone) db.prepare("UPDATE asset_placement SET status = 'gone', gone_at = ? WHERE placement_id = ?").run(ts, r.placement_id)
    db.exec('COMMIT')
    const matched = db.prepare(`SELECT COUNT(DISTINCT a.asset_id) AS c FROM asset_placement p JOIN asset a ON a.source_hash = p.sha256 WHERE p.site = ? AND p.status = 'live'`).get(site.label).c
    return { ...base, hashed: hashes.size, added, changed, gone: gone.length, live: live.size, libraryAssetsLive: matched }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** `git ls-tree -r -l -z` → [{ mode, type, blob, size, path }] */
export function parseLsTree(out) {
  return out.split('\0').filter(Boolean).map(line => {
    const tab = line.indexOf('\t')
    const [mode, type, blob, size] = line.slice(0, tab).trim().split(/\s+/)
    return { mode, type, blob, size: Number(size) || 0, path: line.slice(tab + 1) }
  })
}

/** Stream blobs through one `git cat-file --batch` process and SHA-256 each. */
export function hashBlobs(repo, blobIds) {
  return new Promise((resolve, reject) => {
    const result = new Map()
    if (!blobIds.length) return resolve(result)
    const child = spawn('git', ['-C', repo, 'cat-file', '--batch'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let buf = Buffer.alloc(0)
    let current = null
    let queue = [...blobIds]
    let stderr = ''
    child.stderr.on('data', d => { stderr += d })
    child.on('error', reject)
    child.on('close', code => {
      if (result.size === blobIds.length) resolve(result)
      else reject(new Error(`git cat-file stopped after ${result.size}/${blobIds.length} blobs (exit ${code}) ${stderr.slice(0, 300)}`))
    })
    child.stdout.on('data', chunk => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
      for (;;) {
        if (!current) {
          const nl = buf.indexOf(10)
          if (nl < 0) return
          const header = buf.subarray(0, nl).toString('utf8').split(' ')
          buf = buf.subarray(nl + 1)
          if (header[1] === 'missing') return reject(new Error(`missing blob ${header[0]}`))
          current = { id: header[0], size: Number(header[2]), hash: crypto.createHash('sha256'), got: 0 }
        }
        const take = Math.min(current.size - current.got, buf.length)
        if (take > 0) {
          current.hash.update(buf.subarray(0, take))
          current.got += take
          buf = buf.subarray(take)
        }
        if (current.got < current.size) return
        if (buf.length < 1) return
        buf = buf.subarray(1) // trailing newline
        result.set(current.id, { sha256: current.hash.digest('hex'), size: current.size })
        current = null
        if (result.size === blobIds.length) child.stdin.end()
      }
    })
    // Feed requests in modest batches so stdin never blocks on a full pipe.
    const feed = () => {
      while (queue.length) {
        if (!child.stdin.write(`${queue.shift()}\n`)) return child.stdin.once('drain', feed)
      }
    }
    feed()
  })
}

export function listPlacements(db, options = {}) {
  createPlacementSchema(db)
  const where = []
  const params = []
  if (options.sha256) { where.push('p.sha256 = ?'); params.push(options.sha256) }
  if (options.assetId) { where.push('p.sha256 = (SELECT source_hash FROM asset WHERE asset_id = ?)'); params.push(options.assetId) }
  if (options.site) { where.push('p.site = ?'); params.push(options.site) }
  if (options.url) { where.push('p.url = ?'); params.push(options.url) }
  if (options.status !== 'all') { where.push('p.status = ?'); params.push(options.status || 'live') }
  return db.prepare(`
SELECT p.site, p.url, p.repo_path, p.sha256, p.commit_sha, p.source, p.status, p.first_seen_at, p.last_seen_at, p.gone_at,
  (SELECT asset_id FROM asset WHERE source_hash = p.sha256) AS asset_id
FROM asset_placement p ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
ORDER BY p.site, p.url LIMIT ?`).all(...params, Math.min(Number(options.limit || 200), 5000))
}

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`
}

function nowIso() {
  return new Date().toISOString()
}
