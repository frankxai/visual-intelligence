import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import worker, { signPath as workerSign } from '../workers/vis-media/src/index.js'
import { createLocalStorage, createWorkerStorage, masterKey, renditionKey, sha256File, signPath } from '../core/vis-storage.mjs'

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

function setup() {
  const env = { MEDIA: memoryBucket(), PREVIEW_SIGNING_KEY: 'sign-test-key', ADMIN_TOKEN: 'admin-test-token' }
  const base = 'https://vis-media.test'
  const fetchImpl = (url, init) => worker.fetch(new Request(url, init), env)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-storage-'))
  const master = path.join(dir, 'master.png')
  fs.writeFileSync(master, crypto.randomBytes(4096))
  const thumb = path.join(dir, 'thumb.webp')
  fs.writeFileSync(thumb, Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), crypto.randomBytes(64)]))
  const storage = createWorkerStorage({ baseUrl: base, adminToken: env.ADMIN_TOKEN, signingKey: env.PREVIEW_SIGNING_KEY, fetchImpl })
  return { env, base, fetchImpl, dir, master, thumb, storage, sha: sha256File(master) }
}

test('node and worker sign the same path identically', async () => {
  const exp = 2000000000
  assert.equal(signPath('k', '/r/a/thumb', exp), await workerSign('k', '/r/a/thumb', exp))
})

test('worker adapter: put and fetch a master by hash, round-trip verified', async () => {
  const { storage, master, sha, dir, env } = setup()
  await storage.putMaster(sha, master)
  assert.ok(env.MEDIA.store.has(masterKey(sha)))
  const out = await storage.getMaster(sha, path.join(dir, 'back.png'))
  assert.equal(sha256File(out), sha)
  await assert.rejects(storage.putMaster('0'.repeat(64), master), /do not match/)
})

test('rendition URL: 200 with signature; 401 without, tampered, or expired', async () => {
  const { storage, thumb, sha, fetchImpl, base, env } = setup()
  await storage.putRendition(sha, 'thumb', thumb)
  const url = await storage.renditionUrl(sha, 'thumb')
  const ok = await fetchImpl(url)
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('content-type'), 'image/webp')
  assert.deepEqual(Buffer.from(await ok.arrayBuffer()), fs.readFileSync(thumb))

  assert.equal((await fetchImpl(`${base}/r/${sha}/thumb`)).status, 401)
  assert.equal((await fetchImpl(url.replace(/sig=./, 'sig=A'))).status, 401)
  assert.equal((await fetchImpl(url.replace(`/${sha}/thumb`, `/${sha}/preview`))).status, 401, 'signature is bound to the path')
  const past = Math.floor(Date.now() / 1000) - 10
  assert.equal((await fetchImpl(`${base}/r/${sha}/thumb?exp=${past}&sig=${signPath(env.PREVIEW_SIGNING_KEY, `/r/${sha}/thumb`, past)}`)).status, 401)
  const signedMissing = await storage.renditionUrl(sha, 'preview')
  assert.equal((await fetchImpl(signedMissing)).status, 404, 'no stored preview and no IMAGES binding')
})

test('admin routes: bearer required, masters cannot be deleted, test/ objects can', async () => {
  const { storage, master, sha, fetchImpl, base, env } = setup()
  await storage.putMaster(sha, master)
  assert.equal((await fetchImpl(`${base}/o/${masterKey(sha)}`)).status, 401)
  assert.equal((await fetchImpl(`${base}/o/${masterKey(sha)}`, { headers: { authorization: 'Bearer wrong' } })).status, 401)
  const auth = { authorization: `Bearer ${env.ADMIN_TOKEN}` }
  assert.equal((await fetchImpl(`${base}/o/${masterKey(sha)}`, { method: 'DELETE', headers: auth })).status, 403)
  for (const probe of ['/o/../secrets', '/o/masters/%2e%2e/%2e%2e/secrets', '/o/masters/..%2fsecrets']) {
    assert.ok([400, 404].includes((await fetchImpl(`${base}${probe}`, { headers: auth })).status), `traversal ${probe}`)
  }
  assert.equal((await fetchImpl(`${base}/o/other/key`, { headers: auth })).status, 400)
  assert.equal((await fetchImpl(`${base}/`)).status, 404, 'no listing route')

  const put = await fetchImpl(`${base}/o/test/probe.txt`, { method: 'PUT', headers: { ...auth, 'x-content-sha256': crypto.createHash('sha256').update('probe').digest('hex') }, body: 'probe' })
  assert.equal(put.status, 201)
  assert.equal((await fetchImpl(`${base}/o/test/probe.txt`, { method: 'DELETE', headers: auth })).status, 204)
  assert.deepEqual([...env.MEDIA.store.keys()].filter(k => k.startsWith('test/')), [])
})

test('local adapter keeps the same key layout', async () => {
  const { master, thumb, sha, dir } = setup()
  const local = createLocalStorage({ dir: path.join(dir, 'store') })
  await local.putMaster(sha, master)
  await local.putRendition(sha, 'thumb', thumb)
  assert.ok(fs.existsSync(path.join(dir, 'store', ...masterKey(sha).split('/'))))
  assert.ok(fs.existsSync(path.join(dir, 'store', ...renditionKey(sha, 'thumb').split('/'))))
  assert.equal(await local.renditionUrl(sha, 'thumb'), `/r/${sha}/thumb`)
  const back = await local.getMaster(sha, path.join(dir, 'back.bin'))
  assert.equal(sha256File(back), sha)
})

test('masters are immutable and must be stored under their own hash', async () => {
  const { storage, master, sha, fetchImpl, base, env } = setup()
  await storage.putMaster(sha, master)
  const again = await storage.putMaster(sha, master)
  assert.equal(again.existing, true, 'second put is a no-op, not an overwrite')
  const auth = { authorization: `Bearer ${env.ADMIN_TOKEN}`, 'x-content-sha256': sha }
  const other = 'a'.repeat(64)
  const wrongKey = await fetchImpl(`${base}/o/${masterKey(other)}`, { method: 'PUT', headers: auth, body: 'x' })
  assert.equal(wrongKey.status, 400)
  const overwrite = await fetchImpl(`${base}/o/${masterKey(sha)}`, { method: 'PUT', headers: auth, body: fs.readFileSync(master) })
  assert.equal(overwrite.status, 409)
})

test('a corrupted master is never written to the destination', async () => {
  const { master, sha, dir } = setup()
  const local = createLocalStorage({ dir: path.join(dir, 'store') })
  await local.putMaster(sha, master)
  fs.writeFileSync(path.join(dir, 'store', ...masterKey(sha).split('/')), 'tampered')
  const dest = path.join(dir, 'out', 'master.png')
  await assert.rejects(local.getMaster(sha, dest), /do not match/)
  assert.equal(fs.existsSync(dest), false)
  assert.deepEqual(fs.readdirSync(path.join(dir, 'out')), [], 'no partial file left behind')
})
