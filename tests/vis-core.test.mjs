import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  annotateAsset,
  annotateAssets,
  createCurationPacket,
  detectCategory,
  detectDimensions,
  detectMediaRole,
  detectSuitability,
  expandPathTokens,
  getSummary,
  findSimilarAssets,
  indexProject,
  importEagleLibrary,
  listScanProfiles,
  listSavedSearches,
  listMusicReleasePackets,
  loadConfig,
  openVisDatabase,
  recordPublication,
  createMusicReleasePacket,
  resolveScanProfile,
  saveSearch,
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

      const annotationDryRun = annotateAsset(db, asset.asset_id, {
        tags: ['favorite', 'homepage'],
        rating: 5,
        color: 'mint',
        collection: 'Homepage candidates',
      })
      assert.equal(annotationDryRun.dryRun, true)

      const annotation = annotateAsset(db, asset.asset_id, {
        tags: ['favorite', 'homepage'],
        note: 'Strong homepage candidate.',
        rating: 5,
        color: 'mint',
        curationStatus: 'favorite',
        collection: 'Homepage candidates',
        execute: true,
      })
      assert.equal(annotation.dryRun, false)

      const trace = traceAsset(db, asset.asset_id)
      assert.equal(trace.asset.usage.length, 1)
      assert.equal(trace.asset.prompts.length, 1)
      assert.equal(trace.asset.annotation.rating, 5)
      assert.equal(trace.asset.collections[0].name, 'Homepage candidates')

      const packet = createCurationPacket(db, asset.asset_id, { intendedUse: 'homepage hero' })
      assert.match(packet.codex_prompt, /visual:\/\/asset\//)
      assert.match(packet.codex_prompt, /homepage hero/)
      assert.equal(packet.curation.rating, 5)
      assert.ok(packet.tags.includes('favorite'))

      const savedSearchDryRun = saveSearch(db, { name: 'Favorite homepage assets', query: 'hero', tag: 'favorite' })
      assert.equal(savedSearchDryRun.dryRun, true)
      const savedSearch = saveSearch(db, { name: 'Favorite homepage assets', query: 'hero', tag: 'favorite', execute: true })
      assert.equal(savedSearch.dryRun, false)
      assert.equal(listSavedSearches(db).length, 1)

      const publication = recordPublication(db, {
        assetId: asset.asset_id,
        platform: 'website',
        route: '/',
      })
      assert.equal(publication.dryRun, true)
      assert.equal(summary.publications, 0)
      const updatedSummary = getSummary(db)
      assert.equal(updatedSummary.annotations, 1)
      assert.equal(updatedSummary.savedSearches, 1)
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

test('resolves scan profiles with environment-expanded roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-profile-'))
  const previous = process.env.VIS_TEST_ROOT
  try {
    process.env.VIS_TEST_ROOT = root
    fs.mkdirSync(path.join(root, 'vault'), { recursive: true })
    fs.mkdirSync(path.join(root, 'site'), { recursive: true })
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      scanProfiles: {
        test: {
          description: 'Test scan profile',
          mediaRoots: ['%VIS_TEST_ROOT%/vault', '%VIS_TEST_ROOT%/missing'],
          usageRoots: ['$VIS_TEST_ROOT/site'],
          allowedRoots: ['${VIS_TEST_ROOT}/vault'],
        },
      },
    }, null, 2))

    assert.equal(expandPathTokens('%VIS_TEST_ROOT%'), root)
    const config = loadConfig(root)
    assert.equal(listScanProfiles(config)[0].name, 'test')
    const profile = resolveScanProfile(root, config, 'test')
    assert.equal(profile.existingMediaRoots.length, 1)
    assert.equal(profile.missingMediaRoots.length, 1)
    assert.equal(profile.existingUsageRoots.length, 1)
    assert.equal(profile.existingAllowedRoots.length, 1)
    assert.match(profile.commands.execute, /scan-profile test --execute/)
  } finally {
    if (previous === undefined) delete process.env.VIS_TEST_ROOT
    else process.env.VIS_TEST_ROOT = previous
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('imports Eagle metadata as provider locations, annotations, and collections', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-eagle-'))
  try {
    const libraryRoot = path.join(root, 'Creative.library')
    const itemRoot = path.join(libraryRoot, 'images', 'abc123.info')
    fs.mkdirSync(itemRoot, { recursive: true })
    fs.writeFileSync(path.join(itemRoot, 'cover.png'), PNG_1X1)
    fs.writeFileSync(path.join(itemRoot, 'metadata.json'), JSON.stringify({
      id: 'abc123',
      name: 'Arcanea cover',
      ext: 'png',
      tags: ['Arcanea', 'Cover'],
      folders: [{ id: 'folder-1', name: 'Music Covers' }],
      annotation: 'Use for release art review.',
      website: 'https://example.com/source',
    }, null, 2))
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      eagleLibraries: [libraryRoot],
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
    }, null, 2))

    const dryRun = importEagleLibrary(root)
    assert.equal(dryRun.dryRun, true)
    assert.equal(dryRun.items, 1)
    assert.equal(dryRun.importableItems, 1)
    assert.deepEqual(dryRun.folders, ['Music Covers'])

    const imported = importEagleLibrary(root, { execute: true })
    assert.equal(imported.dryRun, false)
    assert.equal(imported.imported, 1)

    const db = openVisDatabase(root)
    try {
      const [asset] = searchAssets(db, { query: 'arcanea cover', maxResults: 5 })
      assert.ok(asset)
      assert.ok(asset.tags.includes('eagle'))
      assert.ok(asset.tags.includes('arcanea'))
      assert.equal(asset.annotation.notes, 'Use for release art review.')
      const trace = traceAsset(db, asset.asset_id)
      assert.equal(trace.asset.locations[0].provider, 'eagle')
      assert.equal(trace.asset.locations[0].provider_id, 'abc123')
      assert.equal(trace.asset.collections[0].name, 'Eagle / Music Covers')
      assert.ok(trace.provenance.some(event => event.event_type === 'eagle-metadata-imported'))
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('batch annotates assets dry-run first and records collection provenance on execute', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-batch-annotate-'))
  try {
    const imageRoot = path.join(root, 'public', 'images')
    fs.mkdirSync(imageRoot, { recursive: true })
    fs.writeFileSync(path.join(imageRoot, 'cover-one.svg'), '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>')
    fs.writeFileSync(path.join(imageRoot, 'cover-two.svg'), '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="blue"/></svg>')
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      mediaRoots: ['public/images'],
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
    }, null, 2))

    indexProject({ root })
    const db = openVisDatabase(root)
    try {
      const refs = searchAssets(db, { query: 'cover', maxResults: 5 }).map(asset => asset.asset_id)
      assert.equal(refs.length, 2)

      const dryRun = annotateAssets(db, refs, {
        tags: ['design-review'],
        rating: 4,
        curationStatus: 'needs-review',
        collection: 'Design Review',
      })
      assert.equal(dryRun.dryRun, true)
      assert.equal(dryRun.annotated, 2)
      assert.equal(getSummary(db).annotations, 0)

      const executed = annotateAssets(db, refs, {
        tags: ['design-review'],
        rating: 4,
        curationStatus: 'needs-review',
        collection: 'Design Review',
        execute: true,
      })
      assert.equal(executed.dryRun, false)
      assert.equal(executed.annotated, 2)
      assert.equal(getSummary(db).annotations, 2)
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM collection_item').get().count, 2)
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM provenance_event WHERE event_type = 'annotated'").get().count, 2)
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('finds local visual similarity review groups without an embedding provider', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-similar-'))
  try {
    const galleryRoot = path.join(root, 'public', 'images', 'gallery')
    fs.mkdirSync(galleryRoot, { recursive: true })
    fs.writeFileSync(path.join(galleryRoot, 'arcanea-blue-portrait.svg'), '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="blue"/></svg>')
    fs.writeFileSync(path.join(galleryRoot, 'arcanea-green-portrait.svg'), '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="green"/></svg>')
    fs.writeFileSync(path.join(galleryRoot, 'wide-banner.svg'), '<svg viewBox="0 0 420 120"><rect width="420" height="120" fill="black"/></svg>')
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      mediaRoots: ['public/images'],
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
    }, null, 2))

    indexProject({ root })
    const db = openVisDatabase(root)
    try {
      const groups = findSimilarAssets(db, { minScore: 50, limit: 10 })
      assert.equal(groups.mode, 'groups')
      assert.ok(groups.groups.some(group =>
        group.assets.some(asset => asset.title === 'arcanea-blue-portrait') &&
        group.assets.some(asset => asset.title === 'arcanea-green-portrait')),
      )

      const [target] = searchAssets(db, { query: 'blue portrait', maxResults: 1 })
      const matches = findSimilarAssets(db, { assetRef: target.asset_id, minScore: 50, limit: 5 })
      assert.equal(matches.mode, 'asset')
      assert.equal(matches.target.asset_id, target.asset_id)
      assert.ok(matches.matches.some(match => match.asset.title === 'arcanea-green-portrait'))
      assert.ok(matches.matches[0].reasons.length > 0)
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('creates Music IS release packets from linked audio, cover, canvas, and proof docs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-music-packet-'))
  try {
    const releaseRoot = path.join(root, 'verticals', 'music-is', 'catalog', 'proof', 'arcanea', 'moon-gate')
    fs.mkdirSync(releaseRoot, { recursive: true })
    fs.writeFileSync(path.join(releaseRoot, 'final-master.wav'), Buffer.from('RIFFfake-wave-master'))
    fs.writeFileSync(path.join(releaseRoot, 'cover-art.png'), PNG_1X1)
    fs.writeFileSync(path.join(releaseRoot, 'spotify-canvas.mp4'), Buffer.from('fake-video-canvas'))
    fs.writeFileSync(path.join(releaseRoot, 'final-master.prompt.md'), 'Prompt: Arcanea moon gate cinematic trance anthem')
    fs.writeFileSync(path.join(releaseRoot, 'lyrics.md'), '# Lyrics\nInstrumental note.')
    fs.writeFileSync(path.join(releaseRoot, 'credits.md'), '# Credits\nComposer: Frank.')
    fs.writeFileSync(path.join(releaseRoot, 'rights-disclosure.md'), '# Rights\nGenerated-owned; AI disclosure prepared.')
    fs.writeFileSync(path.join(releaseRoot, 'release-checklist.md'), '# Checklist\nMusic IS gate draft.')
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      mediaRoots: ['verticals/music-is/catalog/proof'],
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
    }, null, 2))

    indexProject({ root })
    const db = openVisDatabase(root)
    try {
      const [audio] = searchAssets(db, { query: 'final master', maxResults: 5 })
      annotateAsset(db, audio.asset_id, {
        tags: ['release-candidate'],
        curationStatus: 'approved',
        execute: true,
      })
      db.prepare("UPDATE asset SET rights_status = 'generated-owned', approval_status = 'approved'").run()

      const packets = listMusicReleasePackets(db)
      assert.equal(packets.length, 1)
      assert.equal(packets[0].counts.audio, 1)
      assert.equal(packets[0].counts.covers, 1)
      assert.equal(packets[0].counts.canvas, 1)
      assert.equal(packets[0].counts.documents, 5)
      assert.equal(packets[0].gate_status, 'green-light')
      assert.equal(packets[0].canonical_system, 'Music IS')

      const packet = createMusicReleasePacket(db, audio.asset_id, { intendedUse: 'release review' })
      assert.match(packet.codex_prompt, /Music IS/)
      assert.match(packet.codex_prompt, /release review/)
      assert.equal(packet.release_id, packets[0].release_id)
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('ignores support-only music visuals when building Music IS release packets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-music-support-'))
  try {
    const supportRoot = path.join(root, '_visual-qa', 'deep-infographics-v3-20260622')
    fs.mkdirSync(supportRoot, { recursive: true })
    fs.writeFileSync(path.join(supportRoot, 'red-blue-release-gate.png'), PNG_1X1)
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      mediaRoots: ['_visual-qa'],
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
    }, null, 2))

    indexProject({ root })
    const db = openVisDatabase(root)
    try {
      db.prepare('UPDATE asset SET tags_json = ?').run(JSON.stringify(['music', 'infographic']))
      db.prepare('UPDATE asset_version SET metadata_json = ?').run(JSON.stringify({
        mediaRole: 'image-asset',
        workflow: 'music-release',
      }))

      const packets = listMusicReleasePackets(db)
      assert.equal(packets.length, 0)
    } finally {
      db.close()
    }
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
