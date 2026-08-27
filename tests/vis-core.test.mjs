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
  evaluateSmartCollection,
  expandPathTokens,
  extractColorPalette,
  exportCloudinaryManifest,
  exportNftMetadataReport,
  getAsset,
  getSummary,
  findSimilarAssets,
  initCreativeVault,
  indexProject,
  importEagleLibrary,
  listAssetActionRecipes,
  listDerivativePresets,
  listScanProfiles,
  listSavedSearches,
  listSmartCollections,
  listMusicReleasePackets,
  loadConfig,
  openVisDatabase,
  planAssetDerivatives,
  planCreativeVault,
  recordGenerationProvenance,
  recordPublication,
  createMusicReleasePacket,
  renameAssets,
  reviewAssets,
  runAssetActionRecipe,
  resolveScanProfile,
  saveSearch,
  searchAssets,
  traceAsset,
  walkMediaFiles,
} from '../core/vis-core.mjs'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2mVxwAAAABJRU5ErkJggg==',
  'base64',
)

test('default scans ignore transient agent workspaces and attachment caches', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-scan-safety-'))
  const transientDirs = [
    '.worktrees',
    '.hermes-worktrees',
    '.claude',
    '.claude-worktrees',
    '.codex-artifacts',
    '.codex-remote-attachments',
  ]
  try {
    const canonicalDir = path.join(root, 'public', 'images')
    fs.mkdirSync(canonicalDir, { recursive: true })
    fs.writeFileSync(path.join(canonicalDir, 'canonical.png'), PNG_1X1)

    for (const dir of transientDirs) {
      const transientDir = path.join(root, dir, 'public', 'images')
      fs.mkdirSync(transientDir, { recursive: true })
      fs.writeFileSync(path.join(transientDir, `${dir.slice(1)}.png`), PNG_1X1)
    }

    assert.deepEqual(walkMediaFiles(root).map(file => path.relative(root, file)), [
      path.join('public', 'images', 'canonical.png'),
    ])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

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

test('captures agent generation provenance from VIS sidecars and explicit records', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-provenance-'))
  try {
    const mediaDir = path.join(root, 'public', 'images', 'generated')
    fs.mkdirSync(mediaDir, { recursive: true })
    const assetPath = path.join(mediaDir, 'music-cover.png')
    fs.writeFileSync(assetPath, PNG_1X1)
    fs.writeFileSync(path.join(mediaDir, 'music-cover.vis.provenance.json'), JSON.stringify({
      schema_version: '1.0.0',
      generation: {
        provider: 'openai',
        model: 'gpt-image-1',
        prompt: 'cinematic Arcanea music cover with luminous typography space',
        negative_prompt: 'blurry, illegible text',
        seed: { value: '42', source: 'sidecar' },
        settings: { size: '1024x1024', quality: 'high' },
        output_paths: [assetPath],
        created_at: '2026-07-03T04:00:00.000Z',
      },
      agent: {
        coding_agent: 'codex',
        repo: 'visual-intelligence',
        thread_ref: 'thread-smoke',
        session_ref: 'session-smoke',
        metadata: { laptop: 'primary' },
      },
      skill: {
        name: 'imagegen',
        metadata: { route: 'cover-art' },
      },
    }, null, 2))
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      imagesDir: 'public/images',
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
      dashboardPath: 'data/vis-dashboard.html',
    }, null, 2))

    const result = indexProject({ root })
    assert.equal(result.scannedFiles, 1)

    const db = openVisDatabase(root)
    try {
      const summary = getSummary(db)
      assert.equal(summary.prompts, 1)
      assert.equal(summary.generationEvents, 1)
      assert.equal(summary.agentRuns, 1)
      assert.equal(summary.skillRuns, 1)

      const [asset] = searchAssets(db, { query: 'music cover', maxResults: 5 })
      const detail = getAsset(db, asset.asset_id)
      assert.equal(detail.generation_events[0].model, 'gpt-image-1')
      assert.equal(detail.generation_events[0].provider, 'openai')
      assert.match(detail.generation_events[0].seed, /"42"/)
      assert.equal(detail.agent_runs[0].coding_agent, 'codex')
      assert.equal(detail.agent_runs[0].thread_ref, 'thread-smoke')
      assert.equal(detail.skill_runs[0].skill_name, 'imagegen')

      const packet = createCurationPacket(db, asset.asset_id, { intendedUse: 'music release cover' })
      assert.equal(packet.provenance_summary.generation_events, 1)
      assert.equal(packet.provenance_summary.agent_runs, 1)
      assert.equal(packet.provenance_summary.skill_runs, 1)
      assert.equal(packet.provenance_summary.latest_generation.model, 'gpt-image-1')
      assert.match(packet.codex_prompt, /Generation model: openai\/gpt-image-1/)
      assert.match(packet.codex_prompt, /Agent run: codex/)
      assert.match(packet.codex_prompt, /Skill used: imagegen/)

      const dryRun = recordGenerationProvenance(db, asset.asset_id, {
        prompt: 'variant cover with brighter title treatment',
        model: 'gpt-image-1',
        provider: 'openai',
        codingAgent: 'codex',
        skillName: 'visual-intelligence',
      })
      assert.equal(dryRun.dryRun, true)
      assert.equal(getSummary(db).generationEvents, 1)

      const recorded = recordGenerationProvenance(db, asset.asset_id, {
        prompt: 'variant cover with brighter title treatment',
        model: 'gpt-image-1',
        provider: 'openai',
        codingAgent: 'codex',
        repo: 'visual-intelligence',
        threadRef: 'thread-smoke-2',
        skillName: 'visual-intelligence',
        outputPaths: [assetPath],
        execute: true,
      })
      assert.equal(recorded.dryRun, false)
      assert.ok(recorded.records.generation_event)
      assert.equal(getSummary(db).generationEvents, 2)

      const trace = traceAsset(db, asset.asset_id)
      assert.ok(trace.provenance.some(event => event.event_type === 'generation-provenance-recorded'))
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

test('plans and initializes the cross-device Creative Vault without accidental writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-vault-root-'))
  try {
    const vaultRoot = path.join(root, 'Drive', 'Starlight Creative Vault')
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      creativeVaultRoot: vaultRoot,
      eagleLibraries: [path.join(vaultRoot, '01_Eagle_Library')],
    }, null, 2))

    const plan = planCreativeVault(root)
    assert.equal(plan.dryRun, true)
    assert.equal(plan.vault_root, vaultRoot)
    assert.equal(plan.vault_exists, false)
    assert.ok(plan.folders.some(folder => folder.path === '00_INBOX_MOBILE'))
    assert.ok(plan.folders.some(folder => folder.path === '01_Eagle_Library'))
    assert.ok(plan.folders.some(folder => folder.path === '06_MUSIC_RELEASES'))
    assert.match(plan.mcp_allowed_roots, /Starlight Creative Vault/)
    assert.ok(plan.phone_workflow.some(step => step.includes('Google Photos')))
    assert.ok(plan.music_is_boundary.some(step => step.includes('Music IS remains canonical')))
    assert.equal(fs.existsSync(vaultRoot), false)

    const dryRunInit = initCreativeVault(root)
    assert.equal(dryRunInit.dryRun, true)
    assert.equal(fs.existsSync(vaultRoot), false)

    const initialized = initCreativeVault(root, { execute: true })
    assert.equal(initialized.dryRun, false)
    assert.ok(initialized.created_folders.length >= 10)
    assert.equal(fs.existsSync(path.join(vaultRoot, '00_INBOX_MOBILE')), true)
    assert.equal(fs.existsSync(path.join(vaultRoot, '01_Eagle_Library')), true)
    assert.equal(fs.existsSync(path.join(vaultRoot, '06_MUSIC_RELEASES')), true)
    assert.equal(fs.existsSync(initialized.manifest_written), true)
    assert.equal(fs.existsSync(initialized.readme_written), true)
    const manifest = JSON.parse(fs.readFileSync(initialized.manifest_written, 'utf-8'))
    assert.equal(manifest.rules.eagle_boundary.includes('Eagle'), true)
    assert.equal(manifest.rules.music_boundary.includes('Music IS'), true)
  } finally {
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

test('batch renames assets dry-run first and records provenance on execute', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-batch-rename-'))
  try {
    const imageRoot = path.join(root, 'public', 'images')
    fs.mkdirSync(imageRoot, { recursive: true })
    const originalOne = path.join(imageRoot, 'Cover One.svg')
    const originalTwo = path.join(imageRoot, 'Canvas Clip.svg')
    fs.writeFileSync(originalOne, '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>')
    fs.writeFileSync(originalTwo, '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="blue"/></svg>')
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      mediaRoots: ['public/images'],
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
    }, null, 2))

    indexProject({ root })
    const db = openVisDatabase(root)
    try {
      const refs = searchAssets(db, { query: 'cover canvas', maxResults: 5 }).map(asset => asset.asset_id)
      assert.equal(refs.length, 2)

      const dryRun = renameAssets(db, refs, {
        template: 'release-{index}-{title}',
        actor: 'test',
      })
      assert.equal(dryRun.dryRun, true)
      assert.equal(dryRun.planned, 2)
      assert.equal(dryRun.renamed, 0)
      assert.equal(fs.existsSync(originalOne), true)
      assert.equal(fs.existsSync(originalTwo), true)
      assert.ok(dryRun.items.every(item => item.status === 'planned'))

      const refused = renameAssets(db, refs, {
        template: 'blocked-{index}-{title}',
        allowedRoots: [path.join(root, 'not-the-media-root')],
        execute: true,
      })
      assert.equal(refused.refused, true)
      assert.equal(refused.blocked, 2)
      assert.equal(fs.existsSync(originalOne), true)
      assert.equal(fs.existsSync(originalTwo), true)

      const executed = renameAssets(db, refs, {
        template: 'release-{index}-{title}',
        actor: 'test',
        execute: true,
      })
      assert.equal(executed.dryRun, false)
      assert.equal(executed.renamed, 2)
      assert.equal(fs.existsSync(originalOne), false)
      assert.equal(fs.existsSync(originalTwo), false)
      assert.ok(executed.items.every(item => fs.existsSync(item.new_path)))

      const renamed = searchAssets(db, { query: 'release', maxResults: 5 })
      assert.equal(renamed.length, 2)
      assert.ok(renamed.every(asset => asset.title.startsWith('release-')))
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM provenance_event WHERE event_type = 'asset-renamed'").get().count, 2)
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('runs asset action recipes as dry-run first curation workflows', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-action-recipe-'))
  try {
    const mediaRoot = path.join(root, 'public', 'images')
    const musicRoot = path.join(root, 'verticals', 'music-is', 'catalog', 'proof', 'single')
    fs.mkdirSync(mediaRoot, { recursive: true })
    fs.mkdirSync(musicRoot, { recursive: true })
    fs.writeFileSync(path.join(mediaRoot, 'homepage-hero.svg'), '<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="navy"/></svg>')
    fs.writeFileSync(path.join(mediaRoot, 'homepage-hero.prompt.md'), 'Prompt: website hero with clean product UI')
    fs.writeFileSync(path.join(mediaRoot, 'loose-concept.svg'), '<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="teal"/></svg>')
    fs.writeFileSync(path.join(musicRoot, 'final-master.wav'), Buffer.from('RIFFfake-wave-master'))
    fs.writeFileSync(path.join(musicRoot, 'cover-art.svg'), '<svg viewBox="0 0 3000 3000"><rect width="3000" height="3000" fill="black"/></svg>')
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      mediaRoots: ['public/images', 'verticals/music-is/catalog/proof'],
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
    }, null, 2))

    indexProject({ root })
    const db = openVisDatabase(root)
    try {
      assert.ok(listAssetActionRecipes().some(recipe => recipe.id === 'prompt-gap-review'))

      const dryRun = runAssetActionRecipe(db, {
        recipe: 'prompt-gap-review',
        limit: 10,
      })
      assert.equal(dryRun.dryRun, true)
      assert.equal(dryRun.selected, 3)
      assert.equal(getSummary(db).annotations, 0)
      assert.ok(dryRun.command.includes('action-recipe prompt-gap-review'))

      const executed = runAssetActionRecipe(db, {
        recipe: 'prompt-gap-review',
        limit: 10,
        execute: true,
      })
      assert.equal(executed.dryRun, false)
      assert.equal(executed.actions.annotation.annotated, 3)
      assert.equal(getSummary(db).annotations, 3)
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM provenance_event WHERE event_type = 'asset-action-recipe-applied'").get().count, 3)

      const musicDryRun = runAssetActionRecipe(db, {
        recipe: 'music-release-inbox',
        limit: 10,
      })
      assert.equal(musicDryRun.dryRun, true)
      assert.equal(musicDryRun.selected, 2)
      assert.ok(musicDryRun.items.every(item => item.workflow === 'music-release' || item.media_type === 'audio' || item.media_role === 'cover-art'))

      const smartCollections = listSmartCollections(db)
      const promptGaps = smartCollections.find(collection => collection.id === 'prompt-gaps')
      assert.equal(promptGaps.action_recipe, 'prompt-gap-review')
      assert.equal(promptGaps.count, 3)

      const promptSmartView = evaluateSmartCollection(db, { collection: 'prompt-gaps', limit: 10 })
      assert.equal(promptSmartView.total_selected, 3)
      assert.equal(promptSmartView.action_recipe, 'prompt-gap-review')
      assert.ok(promptSmartView.commands.recipe_dry_run.includes('action-recipe prompt-gap-review'))

      const musicSmartView = evaluateSmartCollection(db, { collection: 'music', limit: 10 })
      assert.equal(musicSmartView.total_selected, 2)
      assert.equal(musicSmartView.action_recipe, 'music-release-inbox')
      assert.ok(musicSmartView.items.every(item => item.workflow === 'music-release' || item.media_type === 'audio' || item.media_role === 'cover-art'))
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('reviews asset rights and approval with dry-run and provenance gates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-review-assets-'))
  try {
    const imageRoot = path.join(root, 'public', 'images')
    fs.mkdirSync(imageRoot, { recursive: true })
    fs.writeFileSync(path.join(imageRoot, 'release-cover.svg'), '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="purple"/></svg>')
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      mediaRoots: ['public/images'],
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
    }, null, 2))

    indexProject({ root })
    const db = openVisDatabase(root)
    try {
      const [asset] = searchAssets(db, { query: 'release cover', maxResults: 1 })
      const unsafePacket = createCurationPacket(db, asset.asset_id, { intendedUse: 'website hero' })
      assert.equal(unsafePacket.publish_gate.allowed, false)
      assert.match(unsafePacket.codex_prompt, /Public-use gate: blocked/)

      const unsafePublication = recordPublication(db, {
        assetId: asset.asset_id,
        platform: 'website',
        route: '/release',
      })
      assert.equal(unsafePublication.publish_gate.allowed, false)
      assert.match(unsafePublication.note, /public use remains blocked/)

      const guardedManifest = exportCloudinaryManifest(db, { query: 'release cover' })
      assert.equal(guardedManifest.assets.length, 0)
      assert.equal(guardedManifest.guarded.length, 1)
      assert.equal(guardedManifest.guard.exportable, 0)

      const dryRun = reviewAssets(db, [asset.asset_id], {
        rightsStatus: 'generated-owned',
        approvalStatus: 'approved',
        reason: 'Generated internally for release test.',
      })
      assert.equal(dryRun.dryRun, true)
      assert.equal(dryRun.reviewed, 1)
      assert.equal(db.prepare('SELECT rights_status, approval_status FROM asset WHERE asset_id = ?').get(asset.asset_id).rights_status, 'unknown')

      const executed = reviewAssets(db, [asset.asset_id], {
        rightsStatus: 'Generated-Owned',
        approvalStatus: 'Approved',
        reason: 'Generated internally for release test.',
        execute: true,
      })
      assert.equal(executed.dryRun, false)
      assert.equal(executed.reviewed, 1)
      const row = db.prepare('SELECT rights_status, approval_status FROM asset WHERE asset_id = ?').get(asset.asset_id)
      assert.equal(row.rights_status, 'generated-owned')
      assert.equal(row.approval_status, 'approved')
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM provenance_event WHERE event_type = 'asset-governance-reviewed'").get().count, 1)

      const safePacket = createCurationPacket(db, asset.asset_id, { intendedUse: 'website hero' })
      assert.equal(safePacket.publish_gate.allowed, true)
      const safeManifest = exportCloudinaryManifest(db, { query: 'release cover' })
      assert.equal(safeManifest.assets.length, 1)
      assert.equal(safeManifest.guarded.length, 0)
      assert.equal(safeManifest.assets[0].upload_ready, true)
      const nftReport = exportNftMetadataReport(db, { query: 'release cover', collection: 'test-drop' })
      assert.equal(nftReport.items.length, 1)
      assert.equal(nftReport.items[0].mint_ready, true)
      assert.equal(nftReport.guard.guarded, 0)
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

test('plans dry-run derivative exports across music release image, video, and audio assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-derivative-plan-'))
  try {
    const releaseRoot = path.join(root, 'verticals', 'music-is', 'catalog', 'proof', 'arcanea', 'sun-circuit')
    fs.mkdirSync(releaseRoot, { recursive: true })
    fs.writeFileSync(path.join(releaseRoot, 'cover-art.png'), PNG_1X1)
    fs.writeFileSync(path.join(releaseRoot, 'spotify-canvas.mp4'), Buffer.from('fake-video-canvas'))
    fs.writeFileSync(path.join(releaseRoot, 'final-master.mp3'), Buffer.from('ID3fake-audio-master'))
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      mediaRoots: ['verticals/music-is/catalog/proof'],
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
    }, null, 2))

    indexProject({ root })
    const db = openVisDatabase(root)
    try {
      const presets = listDerivativePresets()
      assert.ok(presets.some(preset => preset.id === 'music-release'))
      assert.ok(presets.some(preset => preset.id === 'website'))

      const blockedPlan = planAssetDerivatives(db, [], {
        preset: 'music',
        limit: 10,
        outputRoot: 'exports/music',
        execute: true,
      })
      assert.equal(blockedPlan.dryRun, true)
      assert.equal(blockedPlan.execute_supported, false)
      assert.equal(blockedPlan.requested_execute_ignored, true)
      assert.equal(blockedPlan.preset, 'music-release')
      assert.equal(blockedPlan.selected, 3)
      assert.match(blockedPlan.music_boundary, /Music IS/)
      assert.ok(blockedPlan.blocked_variants > 0)
      assert.equal(blockedPlan.planned_variants, 0)
      assert.ok(blockedPlan.items.every(item => item.status === 'blocked'))

      const blockedVariantIds = blockedPlan.items.flatMap(item => item.variants.map(variant => variant.variant_id))
      assert.ok(blockedVariantIds.includes('music-cover-master-3000'))
      assert.ok(blockedVariantIds.includes('spotify-canvas-1080x1920'))
      assert.ok(blockedVariantIds.includes('music-audio-preview-30s'))
      assert.ok(blockedVariantIds.includes('music-waveform-png'))

      const assetIds = searchAssets(db, { query: '', maxResults: 10 }).map(asset => asset.asset_id)
      const review = reviewAssets(db, assetIds, {
        rightsStatus: 'generated-owned',
        approvalStatus: 'approved',
        reason: 'Mock release assets approved for derivative planning test.',
        execute: true,
      })
      assert.equal(review.reviewed, 3)

      const approvedPlan = planAssetDerivatives(db, [], {
        preset: 'music-release',
        limit: 10,
        outputRoot: 'exports/music',
      })
      assert.equal(approvedPlan.selected, 3)
      assert.equal(approvedPlan.blocked_variants, 0)
      assert.ok(approvedPlan.planned_variants >= 7)
      assert.ok(approvedPlan.items.every(item => item.status === 'planned'))
      assert.ok(approvedPlan.items.flatMap(item => item.variants).every(variant => variant.target_path.includes(path.join('exports', 'music'))))
      assert.match(approvedPlan.commands.codex_packet, /VIS derivative plan/)
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

test('extracts SVG color palettes and searches assets by color family', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-color-palette-'))
  try {
    const imageRoot = path.join(root, 'public', 'images')
    fs.mkdirSync(imageRoot, { recursive: true })
    const bluePath = path.join(imageRoot, 'blue-cover.svg')
    fs.writeFileSync(bluePath, '<svg viewBox="0 0 100 100"><rect fill="#2255ff" width="100" height="100"/><circle fill="gold" cx="50" cy="50" r="20"/></svg>')
    fs.writeFileSync(path.join(imageRoot, 'red-poster.svg'), '<svg viewBox="0 0 100 100"><rect fill="rgb(220,20,60)" width="100" height="100"/><path stroke="black" d="M0 0L100 100"/></svg>')
    fs.writeFileSync(path.join(root, 'vis.config.json'), JSON.stringify({
      mediaRoots: ['public/images'],
      indexPath: 'data/vis.sqlite',
      registryPath: 'data/visual-registry.json',
      atlasPath: 'data/vis-atlas.json',
    }, null, 2))

    const palette = extractColorPalette(bluePath, '.svg', 'image')
    assert.equal(palette.dominant, '#2255ff')
    assert.ok(palette.families.includes('blue'))
    assert.ok(palette.families.includes('yellow'))

    indexProject({ root })
    const db = openVisDatabase(root)
    try {
      const blue = searchAssets(db, { color: 'blue', maxResults: 10 })
      assert.equal(blue.length, 1)
      assert.equal(blue[0].title, 'blue-cover')
      assert.equal(blue[0].dominant_color, '#2255ff')
      assert.ok(blue[0].color_families.includes('blue'))

      const red = searchAssets(db, { color: '#ff0000', maxResults: 10 })
      assert.equal(red.length, 1)
      assert.equal(red[0].title, 'red-poster')

      const colorSmart = evaluateSmartCollection(db, { collection: 'color-indexed', limit: 10 })
      assert.equal(colorSmart.count, 2)
      assert.equal(colorSmart.total_selected, 2)
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
