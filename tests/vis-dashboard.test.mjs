import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { indexProject, openVisDatabase, searchAssets } from '../core/vis-core.mjs'
import { generateDashboard, serveDashboard } from '../web/vis-dashboard.mjs'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2mVxwAAAABJRU5ErkJggg==',
  'base64',
)

test('generates a PWA-ready dashboard shell and local media server', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-dashboard-pwa-'))
  try {
    fs.mkdirSync(path.join(root, 'public', 'images'), { recursive: true })
    fs.writeFileSync(path.join(root, 'public', 'images', 'cover-art.png'), PNG_1X1)
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      imagesDir: 'public/images',
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
      dashboardPath: 'data/vis-dashboard.html',
    }, null, 2))

    indexProject({ root })
    const out = generateDashboard(root, { limit: 25 })
    assert.ok(fs.existsSync(out.outputPath))
    assert.ok(fs.existsSync(path.join(path.dirname(out.outputPath), 'vis-dashboard.webmanifest')))
    assert.ok(fs.existsSync(path.join(path.dirname(out.outputPath), 'vis-dashboard-sw.js')))
    assert.ok(fs.existsSync(path.join(path.dirname(out.outputPath), 'vis-icon.svg')))

    const html = fs.readFileSync(out.outputPath, 'utf8')
    assert.match(html, /rel="manifest"/)
    assert.match(html, /serviceWorker\.register/)
    assert.match(html, /__vis_media/)
    assert.match(html, /Selected command shelf/)
    assert.match(html, /data-derivative-preset/)
    assert.match(html, /vis_derivative_plan_handoff/)
    assert.match(html, /plan_asset_derivatives/)
    assert.match(html, /vis_music_is_batch_handoff/)

    const db = openVisDatabase(root)
    let assetId
    try {
      assetId = searchAssets(db, { query: 'cover art', maxResults: 1 })[0].asset_id
    } finally {
      db.close()
    }

    const served = await serveDashboard(root, { port: 0, limit: 25 })
    try {
      const page = await fetch(served.url)
      assert.equal(page.status, 200)
      assert.match(await page.text(), /Visual Intelligence OS/)

      const media = await fetch(`${served.url}__vis_media/${assetId}`)
      assert.equal(media.status, 200)
      assert.equal(media.headers.get('content-type'), 'image/png')
      assert.ok((await media.arrayBuffer()).byteLength > 0)
    } finally {
      await new Promise((resolve, reject) => served.server.close(error => error ? reject(error) : resolve()))
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
