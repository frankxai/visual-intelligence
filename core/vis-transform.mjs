/**
 * Web-standard Cloudinary-parity image transformation & responsive delivery engine.
 * Zero Node-only imports so both Cloudflare Workers (`workers/vis-media`) and Node 22
 * share the exact same canonical spec grammar, DoS limits, format negotiation, and HMAC signing.
 */

export const TRANSFORM_LIMITS = Object.freeze({
  maxWidth: 4096,
  maxHeight: 4096,
  maxPixels: 16_777_216,
  maxDpr: 3,
  minQuality: 10,
  maxQuality: 100,
  maxBlur: 100,
  maxSharpen: 10,
  maxSpecLength: 256,
})

export const NAMED_TRANSFORMS = Object.freeze({
  thumb: {
    description: 'Compact 320px thumbnail in auto WebP/AVIF',
    spec: 'c_fit,w_320,h_320,q_auto,f_auto',
    c: 'fit',
    w: 320,
    h: 320,
    q: 'auto',
    f: 'auto',
  },
  preview: {
    description: 'Operator review preview up to 1600px',
    spec: 'c_fit,w_1600,h_1600,q_auto,f_auto',
    c: 'fit',
    w: 1600,
    h: 1600,
    q: 'auto',
    f: 'auto',
  },
  hero_desktop: {
    description: 'Desktop 16:9 hero banner (1920x1080)',
    spec: 'c_fill,w_1920,h_1080,g_auto,q_auto,f_auto',
    c: 'fill',
    w: 1920,
    h: 1080,
    g: 'auto',
    q: 'auto',
    f: 'auto',
  },
  hero_mobile: {
    description: 'Mobile 4:5 portrait hero (800x1000)',
    spec: 'c_fill,w_800,h_1000,g_face,q_auto,f_auto',
    c: 'fill',
    w: 800,
    h: 1000,
    g: 'face',
    q: 'auto',
    f: 'auto',
  },
  og_card: {
    description: 'OpenGraph 1200x630 social sharing card',
    spec: 'c_fill,w_1200,h_630,g_auto,q_85,f_auto',
    c: 'fill',
    w: 1200,
    h: 630,
    g: 'auto',
    q: 85,
    f: 'auto',
  },
  avatar_sm: {
    description: 'Small square character or creator avatar (128x128)',
    spec: 'c_thumb,w_128,h_128,g_face,dpr_2,q_auto,f_auto',
    c: 'thumb',
    w: 128,
    h: 128,
    g: 'face',
    dpr: 2,
    q: 'auto',
    f: 'auto',
  },
  avatar_lg: {
    description: 'High-resolution square avatar (512x512)',
    spec: 'c_thumb,w_512,h_512,g_face,q_auto,f_auto',
    c: 'thumb',
    w: 512,
    h: 512,
    g: 'face',
    q: 'auto',
    f: 'auto',
  },
  lore_card: {
    description: 'Arcanea 3:4 lore card rendition (900x1200)',
    spec: 'c_fill,w_900,h_1200,g_auto,q_auto,f_auto',
    c: 'fill',
    w: 900,
    h: 1200,
    g: 'auto',
    q: 'auto',
    f: 'auto',
  },
  product_card: {
    description: 'GenCreator 4:3 product showcase card (1200x900)',
    spec: 'c_fill,w_1200,h_900,g_center,q_auto,f_auto',
    c: 'fill',
    w: 1200,
    h: 900,
    g: 'center',
    q: 'auto',
    f: 'auto',
  },
  square_1080: {
    description: 'Social 1:1 square feed master derivative (1080x1080)',
    spec: 'c_fill,w_1080,h_1080,g_auto,q_auto,f_auto',
    c: 'fill',
    w: 1080,
    h: 1080,
    g: 'auto',
    q: 'auto',
    f: 'auto',
  },
  cover_3000: {
    description: 'Streaming/Music IS 3000x3000 album artwork deliverable',
    spec: 'c_fill,w_3000,h_3000,g_center,q_95,f_jpeg',
    c: 'fill',
    w: 3000,
    h: 3000,
    g: 'center',
    q: 95,
    f: 'jpeg',
  },
  lqip: {
    description: 'Ultra-light blurred placeholder (32px wide)',
    spec: 'c_scale,w_32,q_30,f_webp,e_blur:20',
    c: 'scale',
    w: 32,
    q: 30,
    f: 'webp',
    e: 'blur:20',
  },
})

const ALLOWED_CROPS = new Set(['fill', 'fit', 'scale', 'crop', 'pad', 'thumb', 'limit'])
const ALLOWED_GRAVITY = new Set([
  'auto', 'center', 'face',
  'north', 'south', 'east', 'west',
  'north_east', 'north_west', 'south_east', 'south_west',
])
const ALLOWED_FORMATS = new Set(['auto', 'avif', 'webp', 'jpeg', 'png'])
const ALLOWED_DPR = new Set([1, 1.5, 2, 3])
const SHA256_RE = /^[a-f0-9]{64}$/
const FORBIDDEN_HOST_RE = /(?:^|\.)(?:workers|r2)\.dev$/i

const CF_FIT_MAP = {
  fill: 'cover',
  thumb: 'cover',
  fit: 'scale-down',
  limit: 'scale-down',
  crop: 'crop',
  pad: 'pad',
  scale: 'contain',
}

const CF_GRAVITY_MAP = {
  auto: 'auto',
  face: 'face',
  center: 'center',
  north: 'top',
  south: 'bottom',
  east: 'right',
  west: 'left',
  north_east: { x: 1, y: 0 },
  north_west: { x: 0, y: 0 },
  south_east: { x: 1, y: 1 },
  south_west: { x: 0, y: 1 },
}

const FORMAT_META = {
  avif: { format: 'avif', ext: 'avif', mimeType: 'image/avif' },
  webp: { format: 'webp', ext: 'webp', mimeType: 'image/webp' },
  jpeg: { format: 'jpeg', ext: 'jpeg', mimeType: 'image/jpeg' },
  png: { format: 'png', ext: 'png', mimeType: 'image/png' },
}

export class TransformError extends Error {
  constructor(code, message = code, status = 400) {
    super(message)
    this.name = 'TransformError'
    this.code = code
    this.status = status
  }
}

/**
 * Formats normalized transform parameters in canonical key order (`c,w,h,ar,g,dpr,q,f,e,b`).
 */
export function formatTransformSpec(parsed) {
  const parts = []
  if (parsed.c) parts.push(`c_${parsed.c}`)
  if (parsed.w !== undefined) parts.push(`w_${parsed.w}`)
  if (parsed.h !== undefined) parts.push(`h_${parsed.h}`)
  if (parsed.ar) parts.push(`ar_${parsed.ar}`)
  if (parsed.g) parts.push(`g_${parsed.g}`)
  if (parsed.dpr !== undefined && parsed.dpr !== 1) parts.push(`dpr_${parsed.dpr}`)
  if (parsed.q !== undefined) parts.push(`q_${parsed.q}`)
  if (parsed.f) parts.push(`f_${parsed.f}`)
  if (parsed.e) parts.push(`e_${parsed.e}`)
  if (parsed.b) parts.push(`b_${parsed.b}`)
  return parts.join(',')
}

/**
 * Parses and validates Cloudinary-style comma-separated transformation strings with strict DoS bounds.
 */
export function parseTransformSpec(spec) {
  if (typeof spec !== 'string') throw new TransformError('invalid_spec', 'Transformation spec must be a string')
  const trimmed = spec.trim()
  if (!trimmed) throw new TransformError('empty_spec', 'Transformation spec must not be empty')
  if (trimmed.length > TRANSFORM_LIMITS.maxSpecLength) {
    throw new TransformError('spec_too_long', `Transformation spec exceeds ${TRANSFORM_LIMITS.maxSpecLength} chars`)
  }
  if (/[\u0000-\u001f\u007f\s/\\]/.test(trimmed)) {
    throw new TransformError('unsafe_spec_characters', 'Transformation spec contains disallowed whitespace or path characters')
  }

  const rawTokens = trimmed.split(',').filter(Boolean)
  if (!rawTokens.length) throw new TransformError('empty_spec', 'Transformation spec must not be empty')

  const state = {}
  const applyPreset = name => {
    const preset = NAMED_TRANSFORMS[name]
    if (!preset) throw new TransformError('unknown_preset', `Unknown named transform preset: ${name}`)
    for (const k of ['c', 'w', 'h', 'ar', 'g', 'dpr', 'q', 'f', 'e', 'b']) {
      if (preset[k] !== undefined) state[k] = preset[k]
    }
    state.preset = name
  }

  // Apply t_<preset> tokens before inline overrides regardless of position
  const orderedTokens = [
    ...rawTokens.filter(t => t.startsWith('t_')),
    ...rawTokens.filter(t => !t.startsWith('t_')),
  ]

  const seenInlineKeys = new Set()
  for (const token of orderedTokens) {
    const idx = token.indexOf('_')
    if (idx <= 0 || idx === token.length - 1) {
      throw new TransformError('invalid_token', `Invalid transformation token: ${token}`)
    }
    const prefix = token.slice(0, idx)
    const val = token.slice(idx + 1)

    if (prefix === 't') {
      if (seenInlineKeys.has('t')) throw new TransformError('duplicate_token', 'Duplicate t_ preset token')
      seenInlineKeys.add('t')
      applyPreset(val)
      continue
    }

    if (seenInlineKeys.has(prefix)) {
      throw new TransformError('duplicate_token', `Duplicate transformation key: ${prefix}_`)
    }
    seenInlineKeys.add(prefix)

    switch (prefix) {
      case 'w':
      case 'h': {
        if (!/^\d{1,5}$/.test(val)) throw new TransformError('invalid_dimension', `Invalid ${prefix} value: ${val}`)
        const n = Number(val)
        const max = prefix === 'w' ? TRANSFORM_LIMITS.maxWidth : TRANSFORM_LIMITS.maxHeight
        if (!Number.isInteger(n) || n < 1 || n > max) {
          throw new TransformError('dimension_out_of_bounds', `${prefix}_${n} must be between 1 and ${max}`)
        }
        state[prefix] = n
        break
      }
      case 'c': {
        if (!ALLOWED_CROPS.has(val)) throw new TransformError('invalid_crop', `Unsupported crop mode: c_${val}`)
        state.c = val
        break
      }
      case 'g': {
        if (!ALLOWED_GRAVITY.has(val)) throw new TransformError('invalid_gravity', `Unsupported gravity: g_${val}`)
        state.g = val
        break
      }
      case 'q': {
        if (val === 'auto') {
          state.q = 'auto'
        } else {
          if (!/^\d{1,3}$/.test(val)) throw new TransformError('invalid_quality', `Invalid quality: q_${val}`)
          const q = Number(val)
          if (q < TRANSFORM_LIMITS.minQuality || q > TRANSFORM_LIMITS.maxQuality) {
            throw new TransformError('quality_out_of_bounds', `q_${q} must be auto or ${TRANSFORM_LIMITS.minQuality}-${TRANSFORM_LIMITS.maxQuality}`)
          }
          state.q = q
        }
        break
      }
      case 'f': {
        if (!ALLOWED_FORMATS.has(val)) throw new TransformError('invalid_format', `Unsupported output format: f_${val}`)
        state.f = val
        break
      }
      case 'dpr': {
        if (!/^\d+(?:\.\d+)?$/.test(val)) throw new TransformError('invalid_dpr', `Invalid DPR: dpr_${val}`)
        const dpr = Number(val)
        if (!ALLOWED_DPR.has(dpr)) {
          throw new TransformError('dpr_out_of_bounds', `dpr_${val} must be one of 1, 1.5, 2, 3`)
        }
        state.dpr = dpr
        break
      }
      case 'ar': {
        const m = val.match(/^(\d{1,3}):(\d{1,3})$/)
        if (!m || Number(m[1]) < 1 || Number(m[2]) < 1) {
          throw new TransformError('invalid_aspect_ratio', `Invalid aspect ratio: ar_${val}`)
        }
        state.ar = `${Number(m[1])}:${Number(m[2])}`
        break
      }
      case 'e': {
        if (val === 'grayscale') {
          state.e = 'grayscale'
        } else {
          const blurMatch = val.match(/^blur(?::(\d{1,3}))?$/)
          const sharpenMatch = val.match(/^sharpen(?::(\d{1,2}))?$/)
          if (blurMatch) {
            const strength = blurMatch[1] ? Number(blurMatch[1]) : 20
            if (strength < 1 || strength > TRANSFORM_LIMITS.maxBlur) {
              throw new TransformError('effect_out_of_bounds', `Blur strength must be 1-${TRANSFORM_LIMITS.maxBlur}`)
            }
            state.e = `blur:${strength}`
          } else if (sharpenMatch) {
            const strength = sharpenMatch[1] ? Number(sharpenMatch[1]) : 2
            if (strength < 1 || strength > TRANSFORM_LIMITS.maxSharpen) {
              throw new TransformError('effect_out_of_bounds', `Sharpen strength must be 1-${TRANSFORM_LIMITS.maxSharpen}`)
            }
            state.e = `sharpen:${strength}`
          } else {
            throw new TransformError('invalid_effect', `Unsupported effect: e_${val}`)
          }
        }
        break
      }
      case 'b': {
        if (val !== 'transparent' && !/^[0-9a-fA-F]{6}$/.test(val)) {
          throw new TransformError('invalid_background', `Invalid background: b_${val}`)
        }
        state.b = val === 'transparent' ? 'transparent' : val.toLowerCase()
        break
      }
      default:
        throw new TransformError('unknown_token', `Unsupported transformation directive: ${token}`)
    }
  }

  const dpr = state.dpr ?? 1
  if (state.ar && state.w && !state.h) {
    const [rw, rh] = state.ar.split(':').map(Number)
    state.h = Math.max(1, Math.round((state.w * rh) / rw))
  } else if (state.ar && state.h && !state.w) {
    const [rw, rh] = state.ar.split(':').map(Number)
    state.w = Math.max(1, Math.round((state.h * rw) / rh))
  }

  const effectiveW = state.w ? Math.round(state.w * dpr) : undefined
  const effectiveH = state.h ? Math.round(state.h * dpr) : undefined
  if (effectiveW !== undefined && effectiveW > TRANSFORM_LIMITS.maxWidth) {
    throw new TransformError('effective_width_exceeded', `Effective DPR width ${effectiveW} exceeds ${TRANSFORM_LIMITS.maxWidth}`)
  }
  if (effectiveH !== undefined && effectiveH > TRANSFORM_LIMITS.maxHeight) {
    throw new TransformError('effective_height_exceeded', `Effective DPR height ${effectiveH} exceeds ${TRANSFORM_LIMITS.maxHeight}`)
  }
  if (effectiveW !== undefined && effectiveH !== undefined && effectiveW * effectiveH > TRANSFORM_LIMITS.maxPixels) {
    throw new TransformError('pixel_budget_exceeded', `Effective output pixels ${effectiveW * effectiveH} exceed ${TRANSFORM_LIMITS.maxPixels}`)
  }

  const normalized = {
    ...(state.preset ? { preset: state.preset } : {}),
    ...(state.c ? { c: state.c } : {}),
    ...(state.w !== undefined ? { w: state.w } : {}),
    ...(state.h !== undefined ? { h: state.h } : {}),
    ...(state.ar ? { ar: state.ar } : {}),
    ...(state.g ? { g: state.g } : {}),
    dpr,
    q: state.q ?? 'auto',
    f: state.f ?? 'auto',
    ...(state.e ? { e: state.e } : {}),
    ...(state.b ? { b: state.b } : {}),
  }

  normalized.canonical = formatTransformSpec(normalized)
  if (!normalized.canonical) {
    throw new TransformError('empty_spec', 'Transformation spec resolved to empty directives')
  }
  return normalized
}

/**
 * Parses HTTP Accept header media ranges per RFC 9110 and returns q-factor for a given MIME type.
 */
function parseAcceptHeader(acceptHeader) {
  const ranges = []
  for (const part of String(acceptHeader || '').split(',')) {
    const tokens = part.trim().toLowerCase().split(';').map(s => s.trim()).filter(Boolean)
    if (!tokens.length || !tokens[0].includes('/')) continue
    const mediaRange = tokens[0]
    let q = 1
    for (let i = 1; i < tokens.length; i++) {
      const m = tokens[i].match(/^q=(0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/)
      if (m) {
        q = Number(m[1])
        break
      }
    }
    const [type, subtype] = mediaRange.split('/')
    ranges.push({ type, subtype, q })
  }
  return ranges
}

function acceptMatchForMime(ranges, mimeType) {
  const [targetType, targetSub] = mimeType.split('/')
  let bestSpec = 0
  let bestQ = null
  for (const r of ranges) {
    let spec = 0
    if (r.type === targetType && r.subtype === targetSub) spec = 3
    else if (r.type === targetType && r.subtype === '*') spec = 2
    else if (r.type === '*' && r.subtype === '*') spec = 1
    if (spec > bestSpec || (spec === bestSpec && bestSpec > 0 && r.q > bestQ)) {
      bestSpec = spec
      bestQ = r.q
    }
  }
  return bestSpec > 0 ? { q: bestQ, spec: bestSpec } : { q: 0, spec: 0 }
}

/**
 * Negotiates concrete output image format and Vary header behavior from `f_<fmt>` + HTTP `Accept`.
 */
export function negotiateFormat(requestedFormat = 'auto', acceptHeader = '') {
  const req = String(requestedFormat || 'auto').toLowerCase()
  if (req === 'auto') {
    const ranges = parseAcceptHeader(acceptHeader)
    if (!ranges.length) return { ...FORMAT_META.jpeg, varyAccept: true }

    const candidates = [
      { key: 'avif', explicitPref: 3, wildcardPref: 1, ...acceptMatchForMime(ranges, FORMAT_META.avif.mimeType) },
      { key: 'webp', explicitPref: 2, wildcardPref: 2, ...acceptMatchForMime(ranges, FORMAT_META.webp.mimeType) },
      { key: 'jpeg', explicitPref: 1, wildcardPref: 3, ...acceptMatchForMime(ranges, FORMAT_META.jpeg.mimeType) },
    ].filter(c => c.q > 0)

    if (!candidates.length) {
      throw new TransformError('not_acceptable', 'No acceptable output format matched Accept header', 406)
    }
    candidates.sort((a, b) => {
      if (b.q !== a.q) return b.q - a.q
      if (b.spec !== a.spec) return b.spec - a.spec
      return a.spec === 3 ? b.explicitPref - a.explicitPref : b.wildcardPref - a.wildcardPref
    })
    return { ...FORMAT_META[candidates[0].key], varyAccept: true }
  }
  if (FORMAT_META[req]) {
    return { ...FORMAT_META[req], varyAccept: false }
  }
  throw new TransformError('invalid_format', `Unsupported output format: ${requestedFormat}`)
}

/**
 * Computes deterministic 16-char hex cache hash from canonical spec + negotiated format.
 */
export async function computeSpecHash(canonicalSpec, resolvedFormat) {
  const bytes = new TextEncoder().encode(`${canonicalSpec}|${resolvedFormat}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const arr = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < 8; i++) hex += arr[i].toString(16).padStart(2, '0')
  return hex
}

/**
 * Deterministic R2 cache key for derived edge-transformed assets (`derived/` prefix).
 */
export function derivedKey(sha, specHash, ext) {
  if (!SHA256_RE.test(sha || '')) throw new TransformError('invalid_sha256', `Invalid sha256: ${sha}`)
  if (!/^[a-f0-9]{16}$/.test(specHash || '')) throw new TransformError('invalid_spec_hash', `Invalid specHash: ${specHash}`)
  const cleanExt = String(ext || '').toLowerCase()
  if (!['avif', 'webp', 'jpeg', 'jpg', 'png'].includes(cleanExt)) {
    throw new TransformError('invalid_ext', `Invalid derived extension: ${ext}`)
  }
  return `derived/${sha.slice(0, 2)}/${sha}.${specHash}.${cleanExt}`
}

/**
 * Converts a parsed spec + negotiated format into Cloudflare Workers Images binding options.
 */
export function toCloudflareImageTransform(parsed, negotiated) {
  const dpr = parsed.dpr ?? 1
  const transform = {}
  if (parsed.w !== undefined) transform.width = Math.round(parsed.w * dpr)
  if (parsed.h !== undefined) transform.height = Math.round(parsed.h * dpr)
  transform.fit = CF_FIT_MAP[parsed.c || 'fit'] || 'scale-down'
  if (parsed.g && CF_GRAVITY_MAP[parsed.g] !== undefined) {
    transform.gravity = CF_GRAVITY_MAP[parsed.g]
  }
  if (parsed.e === 'grayscale') {
    transform.saturation = 0
  } else if (parsed.e?.startsWith('blur:')) {
    transform.blur = Number(parsed.e.slice(5))
  } else if (parsed.e?.startsWith('sharpen:')) {
    transform.sharpen = Number(parsed.e.slice(8))
  }
  if (parsed.b) {
    transform.background = parsed.b === 'transparent' ? 'rgba(0,0,0,0)' : `#${parsed.b}`
  }

  const quality = parsed.q === 'auto' || parsed.q === undefined ? 82 : parsed.q
  const output = {
    format: negotiated.mimeType,
    ...(negotiated.format === 'png' ? {} : { quality }),
  }

  return { transform, output }
}

/**
 * WebCrypto HMAC-SHA256 path signer compatible with `workers/vis-media/src/index.js` `signPath`.
 */
export async function signTransformPath(secret, pathPart, exp) {
  if (!secret || typeof secret !== 'string') throw new TransformError('missing_signing_key', 'signingKey is required')
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${pathPart}:${exp}`))
  const bytes = new Uint8Array(mac)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function normalizeTransformWorkerBase(workerBase) {
  if (workerBase === undefined || workerBase === null || workerBase === '') return null
  if (typeof workerBase !== 'string') {
    throw new TransformError('invalid_worker_base', 'workerBase must be an HTTPS origin string or omitted')
  }
  let parsed
  try {
    parsed = new URL(workerBase.trim())
  } catch {
    throw new TransformError('invalid_worker_base', `Invalid workerBase URL: ${workerBase}`)
  }
  if (parsed.protocol !== 'https:') {
    throw new TransformError('insecure_worker_base', `workerBase must use https: protocol (received ${parsed.protocol})`)
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TransformError('invalid_worker_base', 'workerBase must not contain credentials, query params, or fragments')
  }
  if (FORBIDDEN_HOST_RE.test(parsed.hostname)) {
    throw new TransformError('forbidden_worker_host', `Private vis-media contract forbids workers.dev / r2.dev endpoints: ${parsed.hostname}`)
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
}

/**
 * Generates an HMAC-SHA256 signed `/t/<sha256>/<canonical>` transformation URL for `vis-media`.
 */
export async function createSignedTransformUrl({
  workerBase,
  sha256,
  spec,
  signingKey,
  ttlSeconds = 3600,
  nowSec = Math.floor(Date.now() / 1000),
}) {
  if (!SHA256_RE.test(sha256 || '')) throw new TransformError('invalid_sha256', `Invalid sha256: ${sha256}`)
  if (!signingKey || typeof signingKey !== 'string') throw new TransformError('missing_signing_key', 'signingKey is required')
  const base = normalizeTransformWorkerBase(workerBase)
  const parsed = parseTransformSpec(spec)
  const pathPart = `/t/${sha256}/${parsed.canonical}`
  const exp = Math.floor(nowSec) + Math.max(1, Math.floor(ttlSeconds))
  const sig = await signTransformPath(signingKey, pathPart, exp)
  const query = `?exp=${exp}&sig=${sig}`
  return {
    url: base ? `${base}${pathPart}${query}` : `${pathPart}${query}`,
    path: `${pathPart}${query}`,
    canonical: parsed.canonical,
    exp,
    sig,
    parsed,
  }
}

/**
 * Generates Cloudinary-parity `<picture>` / `srcset` responsive delivery manifests.
 */
export async function buildResponsiveDeliveryManifest({
  sha256,
  workerBase = null,
  signingKey = null,
  preset = null,
  baseSpec = null,
  widths = [480, 768, 1200, 1600],
  formats = ['avif', 'webp', 'jpeg'],
  sizes = '100vw',
  aspectRatio = null,
  thumbhash = null,
  ttlSeconds = 3600,
  nowSec = Math.floor(Date.now() / 1000),
}) {
  if (!SHA256_RE.test(sha256 || '')) throw new TransformError('invalid_sha256', `Invalid sha256: ${sha256}`)
  const base = normalizeTransformWorkerBase(workerBase)

  const seedSpec = preset
    ? (baseSpec ? `t_${preset},${baseSpec}` : `t_${preset}`)
    : (baseSpec || 'c_fit,q_auto,f_auto')

  const baseParsed = parseTransformSpec(seedSpec)
  const cleanWidths = [...new Set(widths.map(Number).filter(n => Number.isInteger(n) && n >= 16 && n <= TRANSFORM_LIMITS.maxWidth))].sort((a, b) => a - b)
  if (!cleanWidths.length) throw new TransformError('invalid_widths', 'At least one valid width is required')

  const cleanFormats = formats.map(f => String(f).toLowerCase()).filter(f => f !== 'auto' && ALLOWED_FORMATS.has(f))
  if (!cleanFormats.length) throw new TransformError('invalid_formats', 'At least one concrete output format is required')

  let arParts = (aspectRatio || baseParsed.ar || '').split(':').map(Number)
  if (!(arParts.length === 2 && arParts[0] > 0 && arParts[1] > 0) && baseParsed.w && baseParsed.h) {
    let x = Math.abs(baseParsed.w), y = Math.abs(baseParsed.h)
    while (y) { const t = y; y = x % y; x = t }
    const g = x || 1
    arParts = [baseParsed.w / g, baseParsed.h / g]
  }
  const hasAr = arParts.length === 2 && arParts[0] > 0 && arParts[1] > 0

  const buildEntry = async (width, fmt) => {
    const tokens = [`c_${baseParsed.c || (hasAr ? 'fill' : 'fit')}`, `w_${width}`]
    if (hasAr) {
      tokens.push(`h_${Math.max(1, Math.round((width * arParts[1]) / arParts[0]))}`)
    }
    if (baseParsed.g) tokens.push(`g_${baseParsed.g}`)
    tokens.push(`q_${baseParsed.q ?? 'auto'}`)
    tokens.push(`f_${fmt}`)
    const parsed = parseTransformSpec(tokens.join(','))
    if (signingKey) {
      const signed = await createSignedTransformUrl({ workerBase: base, sha256, spec: parsed.canonical, signingKey, ttlSeconds, nowSec })
      return { width, format: fmt, spec: parsed.canonical, url: signed.url, descriptor: `${signed.url} ${width}w` }
    }
    const pathPart = `/t/${sha256}/${parsed.canonical}`
    const url = base ? `${base}${pathPart}` : pathPart
    return { width, format: fmt, spec: parsed.canonical, url, descriptor: `${url} ${width}w` }
  }

  const sources = []
  for (const fmt of cleanFormats) {
    const entries = await Promise.all(cleanWidths.map(w => buildEntry(w, fmt)))
    sources.push({
      format: fmt,
      type: FORMAT_META[fmt].mimeType,
      srcset: entries.map(e => e.descriptor).join(', '),
      sizes,
      urls: entries,
    })
  }

  const fallbackSource = sources[sources.length - 1]
  const fallbackEntry = fallbackSource.urls[Math.min(fallbackSource.urls.length - 1, Math.floor(fallbackSource.urls.length / 2))]

  return {
    schemaVersion: 'vis.responsive-delivery.v1',
    sha256,
    signed: Boolean(signingKey),
    widths: cleanWidths,
    formats: cleanFormats,
    sizes,
    aspectRatio: hasAr ? `${arParts[0]}:${arParts[1]}` : null,
    thumbhash,
    varyAccept: !signingKey && baseParsed.f === 'auto',
    sources,
    img: {
      src: fallbackEntry.url,
      srcset: fallbackSource.srcset,
      sizes,
      width: fallbackEntry.width,
      height: hasAr ? Math.max(1, Math.round((fallbackEntry.width * arParts[1]) / arParts[0])) : null,
    },
    loaderHint: 'Use <picture> with sources in order (avif -> webp -> fallback); require signed URLs in private vis-media mode.',
  }
}
