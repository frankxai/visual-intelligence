import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import vm from 'node:vm'
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

test('read-only snapshot preserves the index and separates presence from processing records', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-dashboard-evidence-'))
  try {
    const images = path.join(root, 'public', 'images')
    fs.mkdirSync(images, { recursive: true })
    const original = path.join(images, 'known.png')
    fs.writeFileSync(original, PNG_1X1)
    indexProject({ root })
    const db = openVisDatabase(root)
    const assetId = db.prepare('SELECT asset_id FROM asset LIMIT 1').get().asset_id
    const versionId = db.prepare('SELECT version_id FROM asset_version LIMIT 1').get().version_id
    const observedAt = '2026-01-02T03:04:05.000Z'
    db.prepare('UPDATE asset SET last_seen_at = ?').run(observedAt)
    db.prepare(`INSERT INTO asset_location (location_id, asset_id, version_id, root, absolute_path, relative_path, seen_at, exists_now)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run('missing-copy', assetId, versionId, root, path.join(images, 'gone.png'), 'gone.png', observedAt)
    db.prepare(`INSERT INTO publication (publication_id, asset_id, platform, status, created_at)
      VALUES (?, ?, ?, ?, ?)`).run('planned-post', assetId, 'website', 'planned', observedAt)
    db.close()
    const index = path.join(root, 'data', 'vis.sqlite')
    const before = fs.readFileSync(index)
    const result = generateDashboard(root, { readOnly: true, verifyLocations: true, limit: 5 })
    assert.deepEqual(fs.readFileSync(index), before)
    const html = fs.readFileSync(result.outputPath, 'utf8')
    const data = JSON.parse(html.match(/const DATA = (.*);\nconst DUPLICATE_IDS/)[1])
    assert.equal(data.readOnly, true)
    assert.equal(data.catalogueSeenAt, observedAt)
    assert.equal(data.assets[0].location_count, 2)
    assert.deepEqual(data.assets[0].locations.map(l => l.availability).sort(), ['missing', 'present'])
    assert.equal(data.assets[0].publication_count, 1)
    assert.equal(data.assets[0].derivative_count, 0)
    assert.match(html, /May include plans; live URLs are not verified here/)
    assert.match(html, /Read-only snapshot\. No decision was saved/)
    assert.match(html, /role="dialog"/)
    assert.match(html, /id="downloadInventory"/)
    // node --check cannot see JavaScript inside the generated HTML template.
    new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1])
    assert.throws(() => generateDashboard(root, { readOnly: true, verifyLocations: true, limit: 101 }), /100 assets/)
    assert.throws(() => generateDashboard(root, { readOnly: true, limit: -2 }), /Dashboard limit/)
    assert.throws(() => generateDashboard(root, { readOnly: true, output: index }), /cannot replace the index/)
    assert.deepEqual(fs.readFileSync(index), before)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('read-only snapshot refuses a missing index without creating it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-dashboard-no-index-'))
  try {
    assert.throws(() => generateDashboard(root, { readOnly: true }))
    assert.equal(fs.existsSync(path.join(root, 'data', 'vis.sqlite')), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
