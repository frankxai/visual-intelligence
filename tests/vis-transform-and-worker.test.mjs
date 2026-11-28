import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import worker, { masterKey } from '../workers/vis-media/src/index.js'
import {
  NAMED_TRANSFORMS,
  TRANSFORM_LIMITS,
  TransformError,
  buildResponsiveDeliveryManifest,
  computeSpecHash,
  createSignedTransformUrl,
  derivedKey,
  negotiateFormat,
  parseTransformSpec,
  toCloudflareImageTransform,
} from '../core/vis-transform.mjs'
import { validateUploadKey } from '../core/vis-r2-dam-plan.mjs'

const SHA = 'a'.repeat(64)

function memoryBucket() {
  const store = new Map()
  const obj = (key, v) => ({
    key,
    size: v.bytes.length,
    httpEtag: `"${v.etag}"`,
    etag: v.etag,
    httpMetadata: v.httpMetadata,
    customMetadata: v.customMetadata,
    get body() { return new Response(v.bytes).body },
  })
  return {
    store,
    async get(key) { const v = store.get(key); return v ? obj(key, v) : null },
    async head(key) { const v = store.get(key); return v ? obj(key, v) : null },
    async put(key, body, opts = {}) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer())
      const actual = crypto.createHash('sha256').update(bytes).digest('hex')
      if (opts.sha256 && opts.sha256 !== actual) throw new Error('checksum mismatch')
      const v = { bytes, etag: actual.slice(0, 16), httpMetadata: opts.httpMetadata, customMetadata: opts.customMetadata }
      store.set(key, v)
      return obj(key, v)
    },
    async delete(key) { store.delete(key) },
  }
}

test('parseTransformSpec enforces canonical order, named preset overrides, aspect ratios, and DoS limits', () => {
  const hero = parseTransformSpec('f_auto,q_auto,t_hero_desktop,w_1280')
  assert.equal(hero.preset, 'hero_desktop')
  assert.equal(hero.w, 1280)
  assert.equal(hero.h, 1080)
  assert.equal(hero.canonical, 'c_fill,w_1280,h_1080,g_auto,q_auto,f_auto')

  const arOnly = parseTransformSpec('c_fill,w_1200,ar_16:9,g_face,e_blur:12,b_0f172a')
  assert.equal(arOnly.h, 675)
  assert.equal(arOnly.canonical, 'c_fill,w_1200,h_675,ar_16:9,g_face,q_auto,f_auto,e_blur:12,b_0f172a')

  assert.equal(Object.keys(NAMED_TRANSFORMS).length, 12)
  assert.equal(TRANSFORM_LIMITS.maxPixels, 16_777_216)

  for (const bad of [
    '',
    '   ',
    'w_5000',
    'h_0',
    'c_fill,w_3000,h_3000,dpr_2',
    'dpr_4',
    'q_5',
    'c_unknown',
    'g_mars',
    'f_gif',
    't_does_not_exist',
    'w_400,w_500',
    'w_400/../etc',
    'e_blur:150',
  ]) {
    assert.throws(() => parseTransformSpec(bad), err => err instanceof TransformError, `expected TransformError for ${bad}`)
  }
})

test('negotiateFormat selects AVIF -> WebP -> JPEG for f_auto with RFC 9110 Accept q-values and Vary: Accept', () => {
  assert.deepEqual(negotiateFormat('auto', 'image/avif,image/webp,*/*'), { format: 'avif', ext: 'avif', mimeType: 'image/avif', varyAccept: true })
  assert.deepEqual(negotiateFormat('auto', 'image/webp,image/png'), { format: 'webp', ext: 'webp', mimeType: 'image/webp', varyAccept: true })
  assert.deepEqual(negotiateFormat('auto', 'image/png,*/*'), { format: 'jpeg', ext: 'jpeg', mimeType: 'image/jpeg', varyAccept: true })
  assert.deepEqual(negotiateFormat('auto', 'image/avif;q=0,image/webp;q=1'), { format: 'webp', ext: 'webp', mimeType: 'image/webp', varyAccept: true })
  assert.deepEqual(negotiateFormat('auto', 'image/webp;q=0.5,image/avif;q=0.9'), { format: 'avif', ext: 'avif', mimeType: 'image/avif', varyAccept: true })
  assert.deepEqual(negotiateFormat('auto', 'image/avif;q=0,image/webp;q=0,*/*;q=0.8'), { format: 'jpeg', ext: 'jpeg', mimeType: 'image/jpeg', varyAccept: true })
  assert.throws(() => negotiateFormat('auto', 'image/avif;q=0,image/webp;q=0,image/jpeg;q=0'), err => err instanceof TransformError && err.status === 406)
  assert.deepEqual(negotiateFormat('png', 'image/avif'), { format: 'png', ext: 'png', mimeType: 'image/png', varyAccept: false })

  const parsed = parseTransformSpec('t_og_card,dpr_2,e_grayscale')
  const cf = toCloudflareImageTransform(parsed, negotiateFormat('webp'))
  assert.equal(cf.transform.width, 2400)
  assert.equal(cf.transform.height, 1260)
  assert.equal(cf.transform.fit, 'cover')
  assert.equal(cf.transform.saturation, 0)
  assert.equal(cf.output.format, 'image/webp')
  assert.equal(cf.output.quality, 85)
})

test('createSignedTransformUrl rejects workers.dev and r2.dev and produces valid signed URLs', async () => {
  await assert.rejects(
    () => createSignedTransformUrl({ workerBase: 'https://vis-media.example.workers.dev', sha256: SHA, spec: 't_og_card', signingKey: 'secret' }),
    /workers\.dev/
  )
  await assert.rejects(
    () => createSignedTransformUrl({ workerBase: 'https://pub-123.r2.dev', sha256: SHA, spec: 't_og_card', signingKey: 'secret' }),
    /r2\.dev/
  )

  const signed = await createSignedTransformUrl({
    workerBase: 'https://media.starlightintelligence.ai/',
    sha256: SHA,
    spec: 't_og_card',
    signingKey: 'test-signing-key',
    nowSec: 2000000000,
    ttlSeconds: 600,
  })
  assert.ok(signed.url.startsWith(`https://media.starlightintelligence.ai/t/${SHA}/c_fill,w_1200,h_630,g_auto,q_85,f_auto?exp=2000000600&sig=`))
})

test('workers/vis-media serves /health, authenticates /t/, caches MISS -> HIT in derived/, and protects masters/', async () => {
  const masterBytes = crypto.randomBytes(1024)
  const sha = crypto.createHash('sha256').update(masterBytes).digest('hex')
  const bucket = memoryBucket()
  await bucket.put(masterKey(sha), masterBytes, {
    sha256: sha,
    httpMetadata: { contentType: 'image/png' },
    customMetadata: { sha256: sha },
  })

  let imageTransformCalls = 0
  const env = {
    MEDIA: bucket,
    PREVIEW_SIGNING_KEY: 'worker-secret-key',
    ADMIN_TOKEN: 'worker-admin-token',
    IMAGES: {
      input(stream) {
        return {
          transform(opts) {
            return {
              output(outOpts) {
                imageTransformCalls++
                const bodyText = JSON.stringify({ opts, outOpts, len: stream ? 1 : 0 })
                return {
                  response: ({ headers }) => new Response(bodyText, { headers }),
                }
              },
            }
          },
        }
      },
    },
  }
  const base = 'https://media.starlight.test'
  const callWorker = (url, init = {}) => worker.fetch(new Request(url, init), env)

  const healthRes = await callWorker(`${base}/health`)
  assert.equal(healthRes.status, 200)
  assert.equal((await healthRes.json()).transforms, true)

  const signed = await createSignedTransformUrl({
    workerBase: base,
    sha256: sha,
    spec: 'c_fill,w_800,h_600,g_auto,q_80,f_auto',
    signingKey: env.PREVIEW_SIGNING_KEY,
    ttlSeconds: 600,
  })

  // Unsigned / expired / tampered paths fail closed
  assert.equal((await callWorker(`${base}/t/${sha}/c_fill,w_800,h_600,g_auto,q_80,f_auto`)).status, 401)
  assert.equal((await callWorker(signed.url.replace(sha, 'b'.repeat(64)))).status, 401)

  // First request MISSes R2 derived/ cache, runs IMAGES binding, and writes cache
  const missRes = await callWorker(signed.url, { headers: { Accept: 'image/avif,image/webp' } })
  assert.equal(missRes.status, 200)
  assert.equal(missRes.headers.get('x-vis-cache'), 'MISS')
  assert.equal(missRes.headers.get('content-type'), 'image/avif')
  assert.equal(missRes.headers.get('vary'), 'Accept')
  assert.equal(imageTransformCalls, 1)

  // Verify derived/ key was written under strict content-addressed convention
  const specHash = await computeSpecHash(signed.canonical, 'avif')
  const expectedDerivedKey = derivedKey(sha, specHash, 'avif')
  assert.ok(bucket.store.has(expectedDerivedKey))
  assert.equal(validateUploadKey(expectedDerivedKey, sha).valid, true)

  // Second request HITs R2 cache without invoking IMAGES binding
  const hitRes = await callWorker(signed.url, { headers: { Accept: 'image/avif,image/webp' } })
  assert.equal(hitRes.status, 200)
  assert.equal(hitRes.headers.get('x-vis-cache'), 'HIT')
  assert.equal(imageTransformCalls, 1)

  // Admin can delete derived/ cache object, while masters/ stays immutable (403)
  const adminHeaders = { authorization: `Bearer ${env.ADMIN_TOKEN}` }
  assert.equal((await callWorker(`${base}/o/${masterKey(sha)}`, { method: 'DELETE', headers: adminHeaders })).status, 403)
  assert.equal((await callWorker(`${base}/o/${expectedDerivedKey}`, { method: 'DELETE', headers: adminHeaders })).status, 204)
  assert.equal(bucket.store.has(expectedDerivedKey), false)
})

test('buildResponsiveDeliveryManifest generates signed AVIF/WebP/JPEG picture sources and srcset', async () => {
  const manifest = await buildResponsiveDeliveryManifest({
    sha256: SHA,
    workerBase: 'https://cdn.starlightintelligence.ai',
    signingKey: 'responsive-signing-key',
    widths: [480, 960],
    formats: ['avif', 'webp', 'jpeg'],
    aspectRatio: '16:9',
    sizes: '(max-width: 768px) 100vw, 50vw',
    nowSec: 2000000000,
  })

  assert.equal(manifest.signed, true)
  assert.equal(manifest.sources.length, 3)
  assert.equal(manifest.sources[0].format, 'avif')
  assert.match(manifest.sources[0].srcset, /480w.*960w/)
  assert.equal(manifest.img.height, Math.round((manifest.img.width * 9) / 16))

  const presetManifest = await buildResponsiveDeliveryManifest({
    sha256: SHA,
    preset: 'hero_desktop',
    widths: [480, 960],
    formats: ['webp'],
  })
  assert.equal(presetManifest.aspectRatio, '16:9')
  assert.equal(presetManifest.sources[0].urls[0].spec, 'c_fill,w_480,h_270,g_auto,q_auto,f_webp')
})
