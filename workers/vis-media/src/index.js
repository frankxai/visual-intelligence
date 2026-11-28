/**
 * vis-media: private preview & on-the-fly transform Worker in front of an R2 bucket.
 *
 * The bucket stays private. There is no r2.dev URL and no listing.
 *
 *   GET  /health
 *   GET  /r/<sha256>/<thumb|preview>?exp=<unix>&sig=<b64url>
 *        Signed, time-limited rendition read. 401 without a valid signature.
 *        Serves the stored rendition; if none exists and an IMAGES binding is
 *        configured, resizes the master (up to 20 MB) at the edge.
 *   GET  /t/<sha256>/<spec>?exp=<unix>&sig=<b64url>
 *        Signed Cloudinary-parity edge transformation (e.g. c_fill,w_1200,h_630,g_auto,f_auto).
 *        Checks derived/ cache in R2 first (X-VIS-Cache: HIT); on MISS transforms master
 *        via Cloudflare IMAGES binding and caches to derived/ (X-VIS-Cache: MISS).
 *   PUT  /o/<key>     Bearer ADMIN_TOKEN. Stores masters/, renditions/, derived/, or test/ objects.
 *                     Never overwrites masters/ or renditions/ (409), and a master key must name its own hash.
 *   GET  /o/<key>     Bearer ADMIN_TOKEN. Streams one object (masters included).
 *   HEAD /o/<key>     Bearer ADMIN_TOKEN. Existence and checksum.
 *   DELETE /o/<key>   Bearer ADMIN_TOKEN. Only keys under test/ or derived/ can be deleted (masters/renditions return 403).
 */

import {
  TransformError,
  computeSpecHash,
  derivedKey,
  negotiateFormat,
  parseTransformSpec,
  toCloudflareImageTransform,
} from '../../../core/vis-transform.mjs'

const SHA = /^[a-f0-9]{64}$/
const KINDS = { thumb: 320, preview: 1600 }
const KEY = /^(masters|renditions|derived|test)\/[A-Za-z0-9._\-/]{1,300}$/
const MAX_IMAGES_INPUT = 20 * 1024 * 1024

export function masterKey(sha) {
  return `masters/${sha.slice(0, 2)}/${sha}`
}

export function renditionKey(sha, kind) {
  return `renditions/${sha.slice(0, 2)}/${sha}.${kind}.webp`
}

function getMediaBucket(env) {
  // Support both canonical `MEDIA` (wrangler.jsonc) and legacy deployed `VIS_BUCKET` binding.
  return env.MEDIA || env.VIS_BUCKET
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return Response.json({ ok: true, service: 'vis-media', access: 'private-signed', transforms: true })
      }
      if (parts[0] === 'r' && parts.length === 3 && request.method === 'GET') {
        return await readRendition(url, parts[1], parts[2], env)
      }
      if (parts[0] === 't' && parts.length === 3 && request.method === 'GET') {
        return await readTransformed(request, url, parts[1], parts[2], env, ctx)
      }
      if (parts[0] === 'o' && parts.length > 1) {
        return await objectRoute(request, url.pathname.slice(3), env)
      }
      return error(404, 'not found')
    } catch (err) {
      if (err instanceof TransformError) {
        return error(err.status || 400, err.message)
      }
      console.log(JSON.stringify({ level: 'error', message: err.message, path: url.pathname }))
      return error(500, 'internal error')
    }
  },
}

async function readRendition(url, sha, kind, env) {
  if (!SHA.test(sha) || !(kind in KINDS)) return error(404, 'not found')
  const ok = await verifySignature(env.PREVIEW_SIGNING_KEY, `/r/${sha}/${kind}`, url.searchParams.get('exp'), url.searchParams.get('sig'))
  if (!ok) return error(401, 'signature required')

  const bucket = getMediaBucket(env)
  if (!bucket) return error(500, 'media bucket binding missing')

  const headers = { 'content-type': 'image/webp', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' }
  const stored = await bucket.get(renditionKey(sha, kind))
  if (stored) return new Response(stored.body, { headers: { ...headers, etag: stored.httpEtag } })

  if (!env.IMAGES) return error(404, 'rendition not stored')
  const master = await bucket.get(masterKey(sha))
  if (!master) return error(404, 'not found')
  if (master.size > MAX_IMAGES_INPUT) return error(413, 'master too large to resize at the edge')
  const out = await env.IMAGES.input(master.body)
    .transform({ width: KINDS[kind], height: KINDS[kind], fit: 'scale-down' })
    .output({ format: 'image/webp' })
  return out.response({ headers })
}

async function readTransformed(request, url, sha, rawSpec, env, ctx) {
  if (!SHA.test(sha)) return error(404, 'not found')
  let decodedSpec
  try {
    decodedSpec = decodeURIComponent(rawSpec)
  } catch {
    return error(400, 'invalid transform encoding')
  }

  // Verify HMAC against either rawSpec or decodedSpec so percent-encoded URLs behave deterministically
  const sig = url.searchParams.get('sig')
  const exp = url.searchParams.get('exp')
  const ok = (await verifySignature(env.PREVIEW_SIGNING_KEY, `/t/${sha}/${decodedSpec}`, exp, sig)) ||
    (decodedSpec !== rawSpec && (await verifySignature(env.PREVIEW_SIGNING_KEY, `/t/${sha}/${rawSpec}`, exp, sig)))
  if (!ok) return error(401, 'signature required')

  const parsed = parseTransformSpec(decodedSpec)
  const negotiated = negotiateFormat(parsed.f, request.headers.get('accept') || '')
  const specHash = await computeSpecHash(parsed.canonical, negotiated.format)
  const cacheKey = derivedKey(sha, specHash, negotiated.ext)

  const bucket = getMediaBucket(env)
  if (!bucket) return error(500, 'media bucket binding missing')

  const baseHeaders = {
    'content-type': negotiated.mimeType,
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
    'x-vis-transform': parsed.canonical,
    ...(negotiated.varyAccept ? { vary: 'Accept' } : {}),
  }

  const cached = await bucket.get(cacheKey)
  if (cached) {
    return new Response(cached.body, {
      headers: {
        ...baseHeaders,
        'x-vis-cache': 'HIT',
        ...(cached.httpEtag ? { etag: cached.httpEtag } : {}),
      },
    })
  }

  if (!env.IMAGES) return error(404, 'transform rendition not stored')
  const master = await bucket.get(masterKey(sha))
  if (!master) return error(404, 'not found')
  if (master.size > MAX_IMAGES_INPUT) return error(413, 'master too large to transform at the edge')

  const cfOpts = toCloudflareImageTransform(parsed, negotiated)
  const out = await env.IMAGES.input(master.body)
    .transform(cfOpts.transform)
    .output(cfOpts.output)
  const rendered = out.response ? out.response({ headers: baseHeaders }) : out
  const bytes = new Uint8Array(await rendered.arrayBuffer())

  const cacheWrite = bucket.put(cacheKey, bytes, {
    httpMetadata: { contentType: negotiated.mimeType },
    customMetadata: {
      parent_sha256: sha,
      transform: parsed.canonical,
      format: negotiated.format,
    },
  }).catch(() => null)

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(cacheWrite)
  } else {
    await cacheWrite
  }

  return new Response(bytes, {
    headers: {
      ...baseHeaders,
      'x-vis-cache': 'MISS',
    },
  })
}

async function objectRoute(request, key, env) {
  if (!(await bearerMatches(request, env.ADMIN_TOKEN))) return error(401, 'admin token required')
  if (!KEY.test(key) || key.includes('..')) return error(400, 'invalid key')
  const bucket = getMediaBucket(env)
  if (!bucket) return error(500, 'media bucket binding missing')
  if (request.method === 'PUT') {
    const sha = request.headers.get('x-content-sha256')
    if (!sha || !SHA.test(sha)) return error(400, 'x-content-sha256 header required')
    if (key.startsWith('masters/') && key !== masterKey(sha)) return error(400, 'master key must match its sha256')
    // Content-addressed masters and approved renditions are immutable: replacing one would be a silent delete.
    if ((key.startsWith('masters/') || key.startsWith('renditions/')) && (await bucket.head(key))) {
      return error(409, 'object exists and is immutable')
    }
    const put = await bucket.put(key, request.body, {
      sha256: sha,
      httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' },
      customMetadata: { sha256: sha },
    })
    return Response.json({ key, size: put.size, etag: put.etag }, { status: 201 })
  }
  if (request.method === 'GET') {
    const obj = await bucket.get(key)
    if (!obj) return error(404, 'not found')
    return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', etag: obj.httpEtag } })
  }
  if (request.method === 'HEAD') {
    const obj = await bucket.head(key)
    if (!obj) return new Response(null, { status: 404 })
    return new Response(null, { headers: { 'x-content-sha256': obj.customMetadata?.sha256 || '', 'content-length': String(obj.size) } })
  }
  if (request.method === 'DELETE') {
    if (!key.startsWith('test/') && !key.startsWith('derived/')) {
      return error(403, 'only test/ or derived/ cache objects can be deleted here')
    }
    await bucket.delete(key)
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
