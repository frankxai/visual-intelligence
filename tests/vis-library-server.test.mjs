import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { ingestLibrary, openLibraryDatabase, proposeForAsset, listLibrary } from '../core/vis-library.mjs'
import { loadConfig } from '../core/vis-core.mjs'
import { serveLibrary } from '../web/vis-library-server.mjs'

async function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-lib-server-'))
  const project = path.join(base, 'project')
  const assets = path.join(base, 'assets')
  fs.mkdirSync(project, { recursive: true })
  fs.mkdirSync(path.join(assets, 'a'), { recursive: true })
  await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 90, g: 10, b: 160 } } }).png().toFile(path.join(assets, 'a', 'one.png'))
  await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 10, g: 160, b: 90 } } }).png().toFile(path.join(assets, 'a', 'two.png'))
  fs.writeFileSync(path.join(project, 'vis.config.json'), JSON.stringify({
    library: { roots: [{ label: 'assets', path: assets }], minFreeDiskGB: 0 },
  }))
  await ingestLibrary({ root: project, execute: true })
  const { server, url } = await serveLibrary(project, { port: 0 })
  return { project, server, url }
}

const post = (url, body, headers = { 'x-vis-operator': '1' }) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

test('operator screen: renditions only, guarded writes, closed publish gate', async t => {
  const { project, server, url } = await setup()
  t.after(() => server.close())

  const page = await fetch(url)
  assert.equal(page.status, 200)
  const rebound = await new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.get({ hostname: '127.0.0.1', port: u.port, path: '/', headers: { host: 'evil.example' } }, res => {
      res.resume()
      resolve(res.statusCode)
    })
    req.on('error', reject)
  })
  assert.equal(rebound, 403, 'a rebinding Host cannot read the library')
  assert.match(await page.text(), /VIS Library/)
  assert.equal((await fetch(url + 'vendor/thumbhash.js')).status, 200)

  const lib = await (await fetch(url + 'api/library')).json()
  assert.equal(lib.total, 2)
  const id = lib.assets[0].asset_id

  const thumb = await fetch(`${url}r/${id}/thumb`)
  assert.equal(thumb.status, 200)
  assert.equal(thumb.headers.get('content-type'), 'image/webp')
  assert.equal((await fetch(`${url}r/${id}/master`)).status, 404, 'master is never served')
  assert.equal((await fetch(`${url}r/${id}/..%2F..%2Fvis.config.json`)).status, 404)

  const detail = await (await fetch(`${url}api/asset/${id}`)).json()
  assert.equal(detail.rights_status, 'unknown')
  assert.ok(detail.renditions.every(r => !('path' in r)), 'rendition disk paths are not exposed')

  assert.equal((await post(`${url}api/asset/${id}/rights`, { rights: 'owned' }, {})).status, 403, 'no operator header')
  assert.equal((await post(`${url}api/asset/${id}/rights`, { rights: 'owned' }, { 'x-vis-operator': '1', origin: 'https://evil.example' })).status, 403, 'cross origin')

  const blocked = await post(`${url}api/asset/${id}/publish`, {})
  assert.equal(blocked.status, 409, 'unknown rights cannot publish')
  assert.match((await blocked.json()).gate.blockers.join(' '), /rights/)

  for (const rating of [3, 4, 3]) assert.equal((await post(`${url}api/asset/${id}/rank`, { rating })).status, 200)
  assert.equal((await (await fetch(`${url}api/asset/${id}`)).json()).annotation.rating, 3, 're-ranking to an earlier value sticks')
  assert.equal((await post(`${url}api/asset/${id}/rank`, { rating: 5 })).status, 200)
  const db = openLibraryDatabase(project, loadConfig(project))
  try {
    const other = listLibrary(db).assets.find(a => a.asset_id !== id)
    proposeForAsset(db, { assetId: other.asset_id, kind: 'tags', rule: 'test', payload: { tags: ['hero'] }, execute: true })
  } finally { db.close() }
  const queue = await (await fetch(url + 'api/proposals')).json()
  assert.equal(queue.proposals.length, 1)
  assert.equal((await post(`${url}api/proposals/${queue.proposals[0].proposal_id}/decide`, { decision: 'accepted' })).status, 200)

  assert.equal((await post(`${url}api/asset/${id}/rights`, { rights: 'owned' })).status, 200)
  const after = await (await fetch(`${url}api/asset/${id}`)).json()
  assert.equal(after.rights_status, 'owned')
  assert.equal(after.annotation.rating, 5)
  assert.equal(after.publications.length, 0)
  const ranked = await (await fetch(url + 'api/library?sort=rank')).json()
  assert.equal(ranked.assets[0].asset_id, id)
})
