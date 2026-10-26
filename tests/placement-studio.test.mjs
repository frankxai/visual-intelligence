import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  openLibraryDatabase,
  setRating,
  setRights,
} from '../core/vis-library.mjs'
import {
  compareAssetPlacements,
  getPlacementFrame,
  listPlacementFrames,
  loadConfig,
} from '../core/vis-core.mjs'
import { serveLibrary } from '../web/vis-library-server.mjs'

async function createStudioFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-placement-studio-'))
  const project = path.join(base, 'project')
  fs.mkdirSync(project, { recursive: true })
  fs.writeFileSync(path.join(project, 'vis.config.json'), JSON.stringify({}))

  const db = openLibraryDatabase(project, loadConfig(project))
  try {
    const now = new Date().toISOString()
    const shaHero = 'a'.repeat(64)
    const shaSquare = 'b'.repeat(64)

    db.prepare(`
      INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
      VALUES ('asset_hero_native', 'image', 'hero-native', 'public/images/hero-native.png', ?, 'hero', 'luminous', '["hero","frankx"]', 'unknown', 'candidate', ?, ?)
    `).run(shaHero, now, now)

    db.prepare(`
      INSERT INTO asset_version (version_id, asset_id, sha256, media_type, mime_type, extension, byte_size, width, height, duration_seconds, created_at, metadata_json)
      VALUES ('ver_hero_1', 'asset_hero_native', ?, 'image', 'image/png', '.png', 40960, 1280, 720, null, ?, '{}')
    `).run(shaHero, now)

    db.prepare(`
      INSERT INTO asset_rendition (rendition_id, asset_id, sha256, kind, storage, width, height, byte_size, created_at)
      VALUES ('ren_hero_preview', 'asset_hero_native', ?, 'preview', 'local', 1280, 720, 4096, ?)
    `).run(shaHero, now)

    db.prepare(`
      INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
      VALUES ('asset_thumb_square', 'image', 'thumb-square', 'public/images/thumb-square.png', ?, 'icon', 'neutral', '["square"]', 'unknown', 'candidate', ?, ?)
    `).run(shaSquare, now, now)

    db.prepare(`
      INSERT INTO asset_version (version_id, asset_id, sha256, media_type, mime_type, extension, byte_size, width, height, duration_seconds, created_at, metadata_json)
      VALUES ('ver_square_1', 'asset_thumb_square', ?, 'image', 'image/png', '.png', 2048, 200, 200, null, ?, '{}')
    `).run(shaSquare, now)

    db.prepare(`
      INSERT INTO asset_rendition (rendition_id, asset_id, sha256, kind, storage, width, height, byte_size, created_at)
      VALUES ('ren_square_preview', 'asset_thumb_square', ?, 'preview', 'local', 200, 200, 1024, ?)
    `).run(shaSquare, now)
  } finally {
    db.close()
  }

  return {
    project,
    heroId: 'asset_hero_native',
    squareId: 'asset_thumb_square',
  }
}

test('listPlacementFrames exposes all 5 canonical brand frames with Artifacts namespaces', () => {
  const frames = listPlacementFrames()
  assert.equal(frames.length, 5)
  const ids = frames.map(f => f.id)
  assert.deepEqual(ids, [
    'frankx-hero',
    'arcanea-lore-card',
    'gencreator-product-box',
    'starlight-og-social',
    'music-is-canvas-cover',
  ])
  assert.equal(getPlacementFrame('arcanea').artifactsNamespace, 'Arcanea')
  assert.equal(getPlacementFrame('gencreator').artifactsNamespace, 'GenCreator')
  assert.equal(getPlacementFrame('frankx').artifactsNamespace, 'Starlight')
})

test('compareAssetPlacements ranks native-fit, rights-cleared candidate above undersized unapproved candidate', async () => {
  const { project, heroId, squareId } = await createStudioFixture()
  const db = openLibraryDatabase(project, loadConfig(project))
  try {
    // Clear rights and rank on hero-native; keep thumb-square unknown
    setRights(db, { assetId: heroId, rights: 'generated-owned', decidedBy: 'frank' })
    setRating(db, { assetId: heroId, rating: 5, decidedBy: 'frank' })
    db.prepare("UPDATE asset SET approval_status = 'approved' WHERE asset_id = ?").run(heroId)

    const result = compareAssetPlacements(db, {
      frameId: 'frankx-hero',
      assetIds: [squareId, heroId],
      repoName: 'frankx-web-assets',
    })

    assert.equal(result.dryRun, true)
    assert.equal(result.mutated, false)
    assert.equal(result.candidate_count, 2)
    assert.equal(result.candidates[0].asset_id, heroId)
    assert.equal(result.candidates[0].rank, 1)
    assert.equal(result.candidates[0].publish_gate.allowed, true)
    assert.equal(result.candidates[0].diagnostics.fit_label, 'native-fit')

    assert.equal(result.candidates[1].asset_id, squareId)
    assert.equal(result.candidates[1].publish_gate.allowed, false)
    assert.ok(result.candidates[1].diagnostics.crop_warning)
    assert.ok(result.candidates[1].diagnostics.upscale_warning)

    assert.equal(result.winner.asset_id, heroId)
    assert.equal(result.winner.publish_ready, true)
    assert.match(result.handoff.cli_artifacts_command, /vis artifacts-pack --brand frankx --repo frankx-web-assets/)
    assert.match(result.handoff.cli_derivative_command, /vis derivative-plan --preset website/)

    // Ensure no workstation path leaks in comparison output
    const serialized = JSON.stringify(result)
    assert.ok(!serialized.includes('C:\\Users\\'), 'no Windows workstation path in studio output')
  } finally {
    db.close()
  }
})

test('web operator screen exposes /api/placement-frames, /api/placement-compare, and Placement Studio UI', async t => {
  const { project } = await createStudioFixture()
  const { server, url } = await serveLibrary(project, { port: 0 })
  t.after(() => server.close())

  const html = await (await fetch(url)).text()
  assert.match(html, /Placement Studio/)
  assert.match(html, /tab-studio/)

  const framesRes = await (await fetch(`${url}api/placement-frames`)).json()
  assert.equal(framesRes.frames.length, 5)

  const cmpGet = await (await fetch(`${url}api/placement-compare?frame=arcanea-lore-card`)).json()
  assert.equal(cmpGet.frame.id, 'arcanea-lore-card')
  assert.equal(cmpGet.candidate_count, 2)

  const cmpPost = await (
    await fetch(`${url}api/placement-compare`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vis-operator': '1' },
      body: JSON.stringify({ frameId: 'gencreator-product-box', repoName: 'template-factory-starter' }),
    })
  ).json()
  assert.equal(cmpPost.frame.id, 'gencreator-product-box')
  assert.equal(cmpPost.handoff.mcp_artifacts_tool.arguments.namespace, 'GenCreator')
})
