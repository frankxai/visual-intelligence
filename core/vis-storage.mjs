/**
 * VIS storage adapters. One contract, four operations:
 *   putMaster(sha, filePath)          store the original bytes
 *   getMaster(sha, destPath)          fetch the original to a local file
 *   putRendition(sha, kind, filePath) store a thumb or preview
 *   renditionUrl(sha, kind)           a URL the grid can show
 *
 * `local` keeps everything on this machine. `worker` talks to the user's own
 * vis-media Worker, which holds the R2 binding; this process only holds the
 * Worker's admin token and signing key, never R2 account keys.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

const SHA = /^[a-f0-9]{64}$/
const KINDS = new Set(['thumb', 'preview'])

export function masterKey(sha) {
  return `masters/${sha.slice(0, 2)}/${sha}`
}

export function renditionKey(sha, kind) {
  return `renditions/${sha.slice(0, 2)}/${sha}.${kind}.webp`
}

function check(sha, kind) {
  if (!SHA.test(sha)) throw new Error(`invalid sha256: ${sha}`)
  if (kind !== undefined && !KINDS.has(kind)) throw new Error(`invalid rendition kind: ${kind}`)
}

export function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

// Write to a temp file, verify the hash, then rename. A mismatch never leaves a file at destPath.
async function writeVerified(destPath, sha, write) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  const tmp = `${destPath}.partial-${process.pid}-${Date.now()}`
  try {
    await write(tmp)
    if (sha256File(tmp) !== sha) throw new Error('master bytes do not match sha256')
    fs.renameSync(tmp, destPath)
    return destPath
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

export function createLocalStorage({ dir, urlBase = '/r' }) {
  const target = key => path.join(dir, ...key.split('/'))
  const copy = (from, key) => {
    const to = target(key)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
    return { key, bytes: fs.statSync(to).size }
  }
  return {
    kind: 'local',
    async putMaster(sha, filePath) {
      check(sha)
      if (sha256File(filePath) !== sha) throw new Error('master bytes do not match sha256')
      return copy(filePath, masterKey(sha))
    },
    async getMaster(sha, destPath) {
      check(sha)
      return writeVerified(destPath, sha, async tmp => fs.copyFileSync(target(masterKey(sha)), tmp))
    },
    async putRendition(sha, kind, filePath) {
      check(sha, kind)
      return copy(filePath, renditionKey(sha, kind))
    },
    async renditionUrl(sha, kind) {
      check(sha, kind)
      return `${urlBase}/${sha}/${kind}`
    },
  }
}

export function createWorkerStorage({ baseUrl, adminToken, signingKey, ttlSeconds = 3600, fetchImpl = fetch }) {
  if (!baseUrl || !adminToken || !signingKey) throw new Error('worker storage needs baseUrl, adminToken, and signingKey')
  const base = baseUrl.replace(/\/$/, '')
  const auth = { authorization: `Bearer ${adminToken}` }
  const put = async (key, filePath, sha, contentType) => {
    const res = await fetchImpl(`${base}/o/${key}`, {
      method: 'PUT',
      headers: { ...auth, 'content-type': contentType, 'x-content-sha256': sha },
      body: fs.readFileSync(filePath),
    })
    if (res.status === 409) return { key, existing: true }
    if (res.status !== 201) throw new Error(`PUT ${key} failed: ${res.status} ${await res.text()}`)
    return res.json()
  }
  return {
    kind: 'worker',
    async putMaster(sha, filePath) {
      check(sha)
      if (sha256File(filePath) !== sha) throw new Error('master bytes do not match sha256')
      return put(masterKey(sha), filePath, sha, 'application/octet-stream')
    },
    async getMaster(sha, destPath) {
      check(sha)
      const res = await fetchImpl(`${base}/o/${masterKey(sha)}`, { headers: auth })
      if (!res.ok) throw new Error(`GET master failed: ${res.status}`)
      return writeVerified(destPath, sha, tmp => pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp)))
    },
    async putRendition(sha, kind, filePath) {
      check(sha, kind)
      return put(renditionKey(sha, kind), filePath, sha256File(filePath), 'image/webp')
    },
    async renditionUrl(sha, kind) {
      check(sha, kind)
      const pathPart = `/r/${sha}/${kind}`
      const exp = Math.floor(Date.now() / 1000) + ttlSeconds
      return `${base}${pathPart}?exp=${exp}&sig=${signPath(signingKey, pathPart, exp)}`
    },
  }
}

export function signPath(secret, pathPart, exp) {
  return crypto.createHmac('sha256', secret).update(`${pathPart}:${exp}`).digest('base64url')
}

export function createStorage(options = {}) {
  if (options.kind === 'worker') return createWorkerStorage(options)
  return createLocalStorage(options)
}
