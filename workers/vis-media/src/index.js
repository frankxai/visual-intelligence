/**
 * vis-media: private preview Worker in front of an R2 bucket.
 *
 * The bucket stays private. There is no r2.dev URL and no listing.
 *
 *   GET  /r/<sha256>/<thumb|preview>?exp=<unix>&sig=<b64url>
 *        Signed, time-limited rendition read. 401 without a valid signature.
 *        Serves the stored rendition; if none exists and an IMAGES binding is
 *        configured, resizes the master (up to 20 MB) at the edge.
 *   PUT  /o/<key>     Bearer ADMIN_TOKEN. Stores masters/ or renditions/ objects.
 *                     Never overwrites them (409), and a master key must name its own hash.
 *   GET  /o/<key>     Bearer ADMIN_TOKEN. Streams one object (masters included).
 *   HEAD /o/<key>     Bearer ADMIN_TOKEN. Existence and checksum.
 *   DELETE /o/test/…  Bearer ADMIN_TOKEN. Only keys under test/ can be deleted.
 */

const SHA = /^[a-f0-9]{64}$/
const KINDS = { thumb: 320, preview: 1600 }
const KEY = /^(masters|renditions|test)\/[A-Za-z0-9._\-/]{1,300}$/
const MAX_IMAGES_INPUT = 20 * 1024 * 1024

export function masterKey(sha) {
  return `masters/${sha.slice(0, 2)}/${sha}`
}

export function renditionKey(sha, kind) {
  return `renditions/${sha.slice(0, 2)}/${sha}.${kind}.webp`
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    try {
      if (parts[0] === 'r' && parts.length === 3 && request.method === 'GET') return await readRendition(url, parts[1], parts[2], env)
      if (parts[0] === 'o' && parts.length > 1) return await objectRoute(request, url.pathname.slice(3), env)
      return error(404, 'not found')
    } catch (err) {
      console.log(JSON.stringify({ level: 'error', message: err.message, path: url.pathname }))
      return error(500, 'internal error')
    }
  },
}

async function readRendition(url, sha, kind, env) {
  if (!SHA.test(sha) || !(kind in KINDS)) return error(404, 'not found')
  const ok = await verifySignature(env.PREVIEW_SIGNING_KEY, `/r/${sha}/${kind}`, url.searchParams.get('exp'), url.searchParams.get('sig'))
  if (!ok) return error(401, 'signature required')

  const headers = { 'content-type': 'image/webp', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' }
  const stored = await env.MEDIA.get(renditionKey(sha, kind))
  if (stored) return new Response(stored.body, { headers: { ...headers, etag: stored.httpEtag } })

  if (!env.IMAGES) return error(404, 'rendition not stored')
  const master = await env.MEDIA.get(masterKey(sha))
  if (!master) return error(404, 'not found')
  if (master.size > MAX_IMAGES_INPUT) return error(413, 'master too large to resize at the edge')
  const out = await env.IMAGES.input(master.body)
    .transform({ width: KINDS[kind], height: KINDS[kind], fit: 'scale-down' })
    .output({ format: 'image/webp' })
  return out.response({ headers })
}

async function objectRoute(request, key, env) {
  if (!(await bearerMatches(request, env.ADMIN_TOKEN))) return error(401, 'admin token required')
  if (!KEY.test(key) || key.includes('..')) return error(400, 'invalid key')
  if (request.method === 'PUT') {
    const sha = request.headers.get('x-content-sha256')
    if (!sha || !SHA.test(sha)) return error(400, 'x-content-sha256 header required')
    if (key.startsWith('masters/') && key !== masterKey(sha)) return error(400, 'master key must match its sha256')
    // Content-addressed objects are immutable: replacing one would be a silent delete.
    if (!key.startsWith('test/') && (await env.MEDIA.head(key))) return error(409, 'object exists and is immutable')
    const put = await env.MEDIA.put(key, request.body, {
      sha256: sha,
      httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' },
      customMetadata: { sha256: sha },
    })
    return Response.json({ key, size: put.size, etag: put.etag }, { status: 201 })
  }
  if (request.method === 'GET') {
    const obj = await env.MEDIA.get(key)
    if (!obj) return error(404, 'not found')
    return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', etag: obj.httpEtag } })
  }
  if (request.method === 'HEAD') {
    const obj = await env.MEDIA.head(key)
    if (!obj) return new Response(null, { status: 404 })
    return new Response(null, { headers: { 'x-content-sha256': obj.customMetadata?.sha256 || '', 'content-length': String(obj.size) } })
  }
  if (request.method === 'DELETE') {
    if (!key.startsWith('test/')) return error(403, 'only test/ objects can be deleted here')
    await env.MEDIA.delete(key)
    return new Response(null, { status: 204 })
  }
  return error(405, 'method not allowed')
}

export async function signPath(secret, path, exp) {
  const key = await hmacKey(secret)
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${path}:${exp}`))
  return b64url(new Uint8Array(mac))
}

async function verifySignature(secret, path, exp, sig) {
  if (!secret || !exp || !sig || !/^\d+$/.test(exp)) return false
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false
  let bytes
  try { bytes = fromB64url(sig) } catch { return false }
  const key = await hmacKey(secret)
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${path}:${exp}`))
}

async function bearerMatches(request, token) {
  const header = request.headers.get('authorization') || ''
  if (!token || !header.startsWith('Bearer ')) return false
  // Compare HMACs of both values so the comparison time does not depend on the secret.
  const key = await hmacKey('vis-media-bearer')
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(header.slice(7))),
    crypto.subtle.sign('HMAC', key, enc.encode(token)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function b64url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromB64url(value) {
  const s = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(s, c => c.charCodeAt(0))
}

function error(status, message) {
  return Response.json({ error: message }, { status })
}
