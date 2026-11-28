// Content-addressed local cache keyed by sha256. Same bytes are never fetched twice.
// The cache directory is operator-supplied (VIS_CHARACTER_CACHE) and never lives in git.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const SHA256_RE = /^[0-9a-f]{64}$/

export function cacheKey(sha256) {
  if (!SHA256_RE.test(sha256 ?? '')) throw new Error('invalid_sha256')
  return `${sha256.slice(0, 2)}/${sha256}`
}

export function cacheDir() {
  return process.env.VIS_CHARACTER_CACHE || null
}

// A hit is only trusted after re-hashing the stored bytes; a corrupt file counts as a miss.
export async function cacheHas(dir, sha256) {
  if (!dir || !SHA256_RE.test(sha256 ?? '')) return false
  try {
    const bytes = await readFile(join(dir, cacheKey(sha256)))
    return createHash('sha256').update(bytes).digest('hex') === sha256
  } catch { return false }
}

export async function cachePut(dir, sha256, bytes) {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== sha256) throw new Error('sha256_mismatch')
  const target = join(dir, cacheKey(sha256))
  if (await cacheHas(dir, sha256)) return { path: target, stored: false }
  await mkdir(join(dir, sha256.slice(0, 2)), { recursive: true })
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, bytes)
  try { await rename(tmp, target) } catch (e) { await rm(tmp, { force: true }); throw e }
  return { path: target, stored: true }
}

// fetcher() is only called on a cache miss. Bytes are verified against sha256 before storing.
export async function ensureCached(dir, sha256, fetcher) {
  if (await cacheHas(dir, sha256)) return { path: join(dir, cacheKey(sha256)), fetched: false }
  const bytes = await fetcher()
  const { path } = await cachePut(dir, sha256, bytes)
  return { path, fetched: true }
}

export async function cacheRead(dir, sha256) {
  const bytes = await readFile(join(dir, cacheKey(sha256)))
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('cache_corrupt')
  return bytes
}
