import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  createCurationPacket,
  detectCategory,
  detectDimensions,
  detectMediaRole,
  detectSuitability,
  getSummary,
  indexProject,
  loadConfig,
  openVisDatabase,
  recordPublication,
  searchAssets,
  traceAsset,
} from '../core/vis-core.mjs'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2mVxwAAAABJRU5ErkJggg==',
  'base64',
)

test('indexes assets, usage, trace, and dry-run publication records', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-core-'))
  try {
    fs.mkdirSync(path.join(root, 'public', 'images', 'characters'), { recursive: true })
    fs.mkdirSync(path.join(root, 'app'), { recursive: true })
    fs.writeFileSync(path.join(root, 'public', 'images', 'characters', 'hero-agent.png'), PNG_1X1)
    fs.writeFileSync(path.join(root, 'public', 'images', 'characters', 'hero-agent.prompt.md'), 'Prompt: luminous Starlight agent portrait')
    fs.writeFileSync(path.join(root, 'app', 'page.tsx'), 'export default function Page(){ return <img src="/images/characters/hero-agent.png" /> }')
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      imagesDir: 'public/images',
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
      dashboardPath: 'data/vis-dashboard.html',
      contentDirs: ['app'],
      maxFileSizeKB: 2000,
    }, null, 2))

    const result = indexProject({ root })
    assert.equal(result.scannedFiles, 1)
    assert.equal(result.logicalAssets, 1)
    assert.equal(result.usageEdges, 1)

    const db = openVisDatabase(root)
    try {
      const summary = getSummary(db)
      assert.equal(summary.assets, 1)
      assert.equal(summary.prompts, 1)

      const [asset] = searchAssets(db, { query: 'hero agent', maxResults: 5 })
      assert.ok(asset.asset_id.startsWith('asset_'))
      assert.equal(asset.media_type, 'image')
      assert.equal(asset.width, 1)
      assert.equal(asset.height, 1)

      const trace = traceAsset(db, asset.asset_id)
      assert.equal(trace.asset.usage.length, 1)
      assert.equal(trace.asset.prompts.length, 1)

      const packet = createCurationPacket(db, asset.asset_id, { intendedUse: 'homepage hero' })
      assert.match(packet.codex_prompt, /visual:\/\/asset\//)
      assert.match(packet.codex_prompt, /homepage hero/)

      const publication = recordPublication(db, {
        assetId: asset.asset_id,
        platform: 'website',
        route: '/',
      })
      assert.equal(publication.dryRun, true)
      assert.equal(summary.publications, 0)
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('classifies music release assets without flattening them into generic visuals', () => {
  const root = path.join(os.tmpdir(), 'vis-music-root')
  const mediaRoot = path.join(root, 'verticals', 'music-is', 'proof-folders')
  const masterPath = path.join(mediaRoot, 'Arcanea Records', 'single-release', 'final-master.wav')
  const coverPath = path.join(mediaRoot, 'Arcanea Records', 'single-release', 'cover-art.png')

  assert.equal(detectCategory(masterPath, mediaRoot, root), 'music-releases')
  assert.equal(detectMediaRole(masterPath, 'audio', ['music']), 'song-master')
  assert.equal(detectMediaRole(coverPath, 'image', ['music']), 'cover-art')
  assert.deepEqual(detectSuitability(['music'], 'sonic', 6400, 'audio', 'song-master'), [
    'release-master',
    'music-is-handoff',
  ])
})

test('reports malformed VIS config with a useful error', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-bad-config-'))
  try {
    fs.writeFileSync(path.join(root, 'vis.config.json'), '{ bad json')
    assert.throws(() => loadConfig(root), /Invalid VIS config JSON/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('reads SVG dimensions from comma or whitespace separated viewBox values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-svg-'))
  try {
    const svgPath = path.join(root, 'art.svg')
    fs.writeFileSync(svgPath, '<svg viewBox="0, 0, 1024, 512"></svg>')
    assert.deepEqual(detectDimensions(svgPath, Buffer.alloc(0), '.svg'), {
      width: 1024,
      height: 512,
      durationSeconds: null,
    })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
