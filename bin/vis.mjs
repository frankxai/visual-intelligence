#!/usr/bin/env node
/**
 * VIS — Visual Intelligence OS CLI
 *
 * Local-first asset graph for images, video, audio, prompts, usage,
 * provenance, publications, and agent curation packets.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  DEFAULT_CONFIG,
  VIS_VERSION,
  annotateAsset,
  annotateAssets,
  createCurationPacket,
  exportCloudinaryManifest,
  exportNftMetadataReport,
  evaluateSmartCollection,
  findDuplicates,
  findOrphans,
  findSimilarAssets,
  findProjectRoot,
  getAsset,
  getSummary,
  indexProject,
  importEagleLibrary,
  listAssetActionRecipes,
  listScanProfiles,
  listSavedSearches,
  listSmartCollections,
  listMusicReleasePackets,
  loadConfig,
  openVisDatabase,
  initCreativeVault,
  planCreativeVault,
  recordGenerationProvenance,
  recordPublication,
  reviewAssets,
  runAssetActionRecipe,
  resolveAssetId,
  resolveMediaRoots,
  resolveScanProfile,
  scanUsageOnly,
  scoreAsset,
  scoreCollection,
  saveSearch,
  searchAssets,
  traceAsset,
  createMusicReleasePacket,
} from '../core/vis-core.mjs'
import { generateDashboard, serveDashboard } from '../web/vis-dashboard.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const command = args[0]
const flags = args.slice(1)

function getFlag(name, fallback = null) {
  const i = flags.indexOf(name)
  return i >= 0 && flags[i + 1] ? flags[i + 1] : fallback
}

function hasFlag(name) {
  return flags.includes(name)
}

function getAllFlags(name) {
  const values = []
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === name && flags[i + 1]) values.push(flags[++i])
  }
  return values
}

const VALUE_FLAGS = new Set([
  '--root', '-r', '--media-root', '--asset-root', '--usage-root', '--output', '-o', '--limit',
  '--tag', '--mood', '--category', '--media-type', '--asset', '--asset-id',
  '--path', '--uri', '--assets', '--ids', '--platform', '--url', '--route', '--caption', '--campaign',
  '--status', '--query', '--folder', '--collection', '--use', '--max-kb',
  '--note', '--notes', '--rating', '--color', '--curation-status', '--name', '--min-rating',
  '--profile', '--library', '--eagle-library', '--port', '--host', '--min-score', '--pool-limit',
  '--rights-status', '--approval-status', '--reason',
  '--prompt', '--negative-prompt', '--negative', '--model', '--provider', '--seed', '--settings',
  '--settings-json', '--agent', '--coding-agent', '--repo', '--thread', '--session', '--skill',
  '--sidecar', '--output-path', '--source', '--summary',
  '--recipe', '--filter-tag', '--filter-rights-status', '--filter-approval-status',
  '--vault-root', '--sample-limit',
])

function positionalArgs() {
  const values = []
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]
    if (VALUE_FLAGS.has(flag)) {
      i++
      continue
    }
    if (flag.startsWith('--')) continue
    values.push(flag)
  }
  return values
}

function projectRoot() {
  return path.resolve(getFlag('--root') || getFlag('-r') || findProjectRoot())
}

function mediaRoots() {
  return [...getAllFlags('--media-root'), ...getAllFlags('--asset-root')]
}

function usageRoots() {
  return getAllFlags('--usage-root')
}

function assetRefArgs() {
  return uniq([
    ...positionalArgs(),
    ...getAllFlags('--asset'),
    ...getAllFlags('--asset-id'),
    ...getAllFlags('--path'),
    ...getAllFlags('--uri'),
    ...getAllFlags('--assets').flatMap(value => String(value).split(',')),
    ...getAllFlags('--ids').flatMap(value => String(value).split(',')),
  ].map(value => String(value || '').trim()).filter(Boolean))
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2))
}

function uniq(values) {
  return [...new Set(values)]
}

function ensureConfig(root) {
  const configPath = path.join(root, 'vis.config.json')
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2))
    console.log(`Created ${configPath}`)
  }
  const dataDir = path.join(root, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  const templatePath = path.resolve(__dirname, '..', 'templates', 'brand-visual-dna.json')
  const dnaPath = path.join(root, DEFAULT_CONFIG.brandDnaPath)
  if (fs.existsSync(templatePath) && !fs.existsSync(dnaPath)) {
    fs.mkdirSync(path.dirname(dnaPath), { recursive: true })
    fs.copyFileSync(templatePath, dnaPath)
    console.log(`Created ${dnaPath}`)
  }
}

function cmdInit() {
  const root = projectRoot()
  console.log(`VIS ${VIS_VERSION}`)
  ensureConfig(root)
  const config = loadConfig(root)
  const roots = resolveMediaRoots(root, config, mediaRoots())
  if (!roots.length) {
    console.log('Initialized. Add media to public/images or run with --media-root <path> to index another folder.')
    return
  }
  const result = indexProject({ root, mediaRoots: roots })
  printIndexSummary(result)
}

function cmdScan() {
  const root = projectRoot()
  ensureConfig(root)
  const roots = mediaRoots()
  const usage = usageRoots()
  const result = indexProject({
    root,
    mediaRoots: roots.length ? roots : null,
    config: usage.length ? { usageRoots: usage } : null,
    reset: !hasFlag('--diff'),
  })
  if (hasFlag('--json')) printJson(result)
  else printIndexSummary(result)
}

function cmdReport() {
  const root = projectRoot()
  const db = openVisDatabase(root)
  try {
    const summary = getSummary(db)
    if (hasFlag('--json')) {
      printJson(summary)
      return
    }
    if (hasFlag('--html')) {
      const out = generateDashboard(root, { output: getFlag('--output') || getFlag('-o') || undefined })
      console.log(`Dashboard generated: ${out.outputPath}`)
      return
    }
    console.log('\n=== VISUAL INTELLIGENCE OS REPORT ===\n')
    console.log(`Assets:       ${summary.assets}`)
    console.log(`Versions:     ${summary.versions}`)
    console.log(`Locations:    ${summary.locations}`)
    console.log(`Usage edges:  ${summary.usageEdges}`)
    console.log(`Prompts:      ${summary.prompts}`)
    console.log(`Annotations:  ${summary.annotations || 0}`)
    console.log(`Saved search: ${summary.savedSearches || 0}`)
    console.log(`Publications: ${summary.publications}`)
    console.log(`Evals:        ${summary.evals}`)
    console.log('\nMedia types:')
    for (const row of summary.byMediaType) console.log(`  ${row.media_type}: ${row.count}`)
    console.log('\nTop categories:')
    for (const row of summary.byCategory.slice(0, 12)) console.log(`  ${row.category || 'uncategorized'}: ${row.count}`)
  } finally {
    db.close()
  }
}

function cmdUsage() {
  const root = projectRoot()
  const usage = usageRoots()
  const result = scanUsageOnly({
    root,
    config: usage.length ? { usageRoots: usage } : null,
  })
  if (hasFlag('--json')) {
    printJson(result)
    return
  }
  console.log('\n=== VIS USAGE SCAN COMPLETE ===\n')
  console.log(`Root:        ${result.root}`)
  console.log(`Usage edges: ${result.usageEdges}`)
  console.log(`Assets:      ${result.assets}`)
}

function cmdProfiles() {
  const root = projectRoot()
  const config = loadConfig(root)
  const profiles = listScanProfiles(config)
  if (hasFlag('--json')) {
    printJson(profiles)
    return
  }
  console.log('\n=== VIS SCAN PROFILES ===\n')
  if (!profiles.length) {
    console.log('No scan profiles configured in vis.config.json.')
    return
  }
  for (const profile of profiles) {
    console.log(`${profile.name}`)
    console.log(`  ${profile.description || 'No description'}`)
    console.log(`  media roots: ${profile.mediaRoots} | usage roots: ${profile.usageRoots} | allowed roots: ${profile.allowedRoots}`)
  }
}

function cmdScanProfile() {
  const root = projectRoot()
  ensureConfig(root)
  const name = getFlag('--profile') || positionalArgs()[0]
  if (!name) throw new Error('Usage: vis scan-profile <profile-name> [--execute] [--json]')
  const config = loadConfig(root)
  const profile = resolveScanProfile(root, config, name)

  if (!hasFlag('--execute')) {
    if (hasFlag('--json')) {
      printJson({ dryRun: true, profile })
      return
    }
    printScanProfile(profile)
    return
  }

  if (!profile.existingMediaRoots.length) {
    throw new Error(`Scan profile "${name}" has no existing media roots. Run without --execute to inspect missing roots.`)
  }

  const result = indexProject({
    root,
    mediaRoots: profile.existingMediaRoots,
    config: profile.existingUsageRoots.length ? { usageRoots: profile.existingUsageRoots } : null,
    reset: !hasFlag('--diff'),
  })
  const output = { profile, result }
  if (hasFlag('--json')) {
    printJson(output)
    return
  }
  printIndexSummary(result)
  if (profile.missingMediaRoots.length || profile.missingUsageRoots.length) {
    console.log('\nMissing profile roots:')
    for (const missing of [...profile.missingMediaRoots, ...profile.missingUsageRoots]) console.log(`  - ${missing}`)
  }
}

function cmdEagleImport() {
  const root = projectRoot()
  ensureConfig(root)
  const libraries = [...getAllFlags('--library'), ...getAllFlags('--eagle-library')]
  const result = importEagleLibrary(root, {
    libraryRoots: libraries,
    limit: Number(getFlag('--limit', 10000)),
    execute: hasFlag('--execute'),
  })
  if (hasFlag('--json')) {
    printJson(result)
    return
  }
  console.log(`\n=== VIS EAGLE IMPORT ${result.dryRun ? 'DRY RUN' : 'COMPLETE'} ===\n`)
  for (const library of result.libraries) console.log(`${library.exists ? 'OK' : 'NO'} ${library.root}`)
  console.log(`\nItems:          ${result.items}`)
  console.log(`Importable:     ${result.importableItems}`)
  console.log(`Missing assets: ${result.missingAssetFiles}`)
  console.log(`Folders:        ${result.folders.length}`)
  console.log(`Tags:           ${result.tags.length}`)
  if (!result.dryRun) console.log(`Imported:       ${result.imported}`)
  if (result.sample?.length) {
    console.log('\nSample:')
    for (const item of result.sample.slice(0, 10)) {
      console.log(`  ${item.id}: ${item.name || path.basename(item.assetPath || item.metadataPath)}`)
      if (item.folders.length) console.log(`    folders: ${item.folders.join(', ')}`)
      if (item.tags.length) console.log(`    tags: ${item.tags.join(', ')}`)
    }
  }
  if (result.dryRun) console.log('\nDry run only. Add --execute to merge Eagle metadata into VIS.')
}

function cmdSearch() {
  const root = projectRoot()
  const db = openVisDatabase(root)
  try {
    const query = positionalArgs().join(' ')
    const results = searchAssets(db, {
      query,
      tag: getFlag('--tag'),
      mood: getFlag('--mood'),
      category: getFlag('--category'),
      mediaType: getFlag('--media-type'),
      maxResults: Number(getFlag('--limit', 20)),
    })
    if (hasFlag('--json')) {
      printJson(results)
      return
    }
    console.log(`\n=== SEARCH RESULTS: ${results.length} ===\n`)
    for (const asset of results) {
      console.log(`${asset.visual_uri}`)
      console.log(`  ${asset.relative_path || asset.absolute_path}`)
      console.log(`  ${asset.media_type} | ${asset.category || 'uncategorized'} | ${(asset.tags || []).join(', ') || 'no tags'} | ${asset.sizeKB || 0} KB`)
    }
  } finally {
    db.close()
  }
}

function cmdTrace() {
  const root = projectRoot()
  const ref = positionalArgs()[0]
  if (!ref) throw new Error('Usage: vis trace <asset_id|visual://asset/...|path>')
  const trace = traceAsset(root, ref)
  if (!trace) throw new Error(`Asset not found: ${ref}`)
  printJson(trace)
}

function cmdPacket() {
  const root = projectRoot()
  const ref = positionalArgs()[0]
  if (!ref) throw new Error('Usage: vis packet <asset_id|visual://asset/...|path> [--use <context>]')
  const packet = createCurationPacket(root, ref, { intendedUse: getFlag('--use') })
  if (!packet) throw new Error(`Asset not found: ${ref}`)
  if (hasFlag('--json')) printJson(packet)
  else console.log(packet.codex_prompt)
}

function cmdDashboard() {
  const root = projectRoot()
  const out = generateDashboard(root, {
    output: getFlag('--output') || getFlag('-o') || undefined,
    limit: getFlag('--limit') || undefined,
  })
  console.log(`Dashboard generated: ${out.outputPath}`)
  console.log(`Assets rendered: ${out.assets}`)
  if (out.pwa) {
    console.log(`PWA manifest: ${path.join(path.dirname(out.outputPath), out.pwa.manifest)}`)
    console.log(`Service worker: ${path.join(path.dirname(out.outputPath), out.pwa.serviceWorker)}`)
  }
}

async function cmdServeDashboard() {
  const root = projectRoot()
  const served = await serveDashboard(root, {
    output: getFlag('--output') || getFlag('-o') || undefined,
    limit: getFlag('--limit') || undefined,
    port: getFlag('--port') || undefined,
    host: getFlag('--host') || undefined,
    generate: !hasFlag('--no-generate'),
  })
  console.log(`VIS dashboard server: ${served.url}`)
  console.log(`Serving: ${served.outputPath}`)
  console.log('Press Ctrl+C to stop.')
}

function cmdDuplicates() {
  const root = projectRoot()
  const db = openVisDatabase(root)
  try {
    const rows = findDuplicates(db, { limit: Number(getFlag('--limit', 50)) })
    printJson(rows)
  } finally {
    db.close()
  }
}

function cmdOrphans() {
  const root = projectRoot()
  const db = openVisDatabase(root)
  try {
    const rows = findOrphans(db, { limit: Number(getFlag('--limit', 100)) })
    printJson(rows)
  } finally {
    db.close()
  }
}

function cmdSimilar() {
  const root = projectRoot()
  const ref = positionalArgs()[0] || getFlag('--asset') || getFlag('--asset-id') || getFlag('--path') || getFlag('--uri')
  const results = findSimilarAssets(root, {
    assetRef: ref,
    query: getFlag('--query') || (!ref ? positionalArgs().join(' ') : ''),
    mediaType: getFlag('--media-type'),
    minScore: Number(getFlag('--min-score', 58)),
    poolLimit: Number(getFlag('--pool-limit', 10000)),
    limit: Number(getFlag('--limit', 20)),
  })
  if (hasFlag('--json')) {
    printJson(results)
    return
  }
  if (results.mode === 'asset') {
    console.log(`\n=== VIS SIMILAR ASSETS: ${results.matches.length} ===\n`)
    if (!results.target) {
      console.log('No target asset found.')
      return
    }
    console.log(`Target: ${results.target.visual_uri} | ${results.target.title}`)
    for (const match of results.matches) {
      console.log(`${match.score} | ${match.asset.visual_uri} | ${match.asset.title}`)
      console.log(`  ${match.reasons.join(', ')}`)
      console.log(`  ${match.asset.relative_path || match.asset.local_path || ''}`)
    }
    return
  }
  console.log(`\n=== VIS SIMILARITY REVIEW GROUPS: ${results.groups.length} ===\n`)
  for (const group of results.groups) {
    console.log(`${group.group_id} | score ${group.score} | ${group.assets.length} assets`)
    console.log(`  ${group.reason.join(', ')}`)
    for (const asset of group.assets.slice(0, 5)) console.log(`  - ${asset.visual_uri} | ${asset.title}`)
  }
}

function cmdScore() {
  const root = projectRoot()
  const ref = positionalArgs()[0]
  if (ref) printJson(scoreAsset(root, ref))
  else printJson(scoreCollection(root, getFlag('--collection')))
}

function cmdAnnotate() {
  const root = projectRoot()
  const ref = positionalArgs()[0] || getFlag('--asset') || getFlag('--asset-id') || getFlag('--path') || getFlag('--uri')
  if (!ref) throw new Error('Usage: vis annotate <asset|path|uri> [--tag <tag>] [--note <note>] [--rating 1-5] [--execute]')
  const result = annotateAsset(root, ref, {
    tags: getAllFlags('--tag'),
    note: getFlag('--note') || getFlag('--notes'),
    rating: getFlag('--rating'),
    color: getFlag('--color'),
    curationStatus: getFlag('--curation-status') || getFlag('--status'),
    collection: getFlag('--collection'),
    actor: 'vis-cli',
    execute: hasFlag('--execute'),
  })
  printJson(result)
}

function cmdBatchAnnotate() {
  const root = projectRoot()
  const refs = assetRefArgs()
  if (!refs.length) throw new Error('Usage: vis batch-annotate <asset...> [--tag <tag>] [--collection <name>] [--curation-status <status>] [--execute]')
  const result = annotateAssets(root, refs, {
    tags: getAllFlags('--tag'),
    note: getFlag('--note') || getFlag('--notes'),
    rating: getFlag('--rating'),
    color: getFlag('--color'),
    curationStatus: getFlag('--curation-status') || getFlag('--status'),
    collection: getFlag('--collection'),
    replaceTags: hasFlag('--replace-tags'),
    actor: 'vis-cli',
    execute: hasFlag('--execute'),
  })
  printJson(result)
}

function cmdReviewAssets() {
  const root = projectRoot()
  const refs = assetRefArgs()
  if (!refs.length) throw new Error('Usage: vis review-assets <asset...> [--rights-status generated-owned] [--approval-status approved] [--execute]')
  const result = reviewAssets(root, refs, {
    rightsStatus: getFlag('--rights-status'),
    approvalStatus: getFlag('--approval-status'),
    reason: getFlag('--reason') || getFlag('--note') || getFlag('--notes'),
    actor: 'vis-cli',
    execute: hasFlag('--execute'),
  })
  printJson(result)
}

function cmdActionRecipes() {
  printJson(listAssetActionRecipes())
}

function cmdActionRecipe() {
  const root = projectRoot()
  const recipe = getFlag('--recipe') || positionalArgs()[0]
  if (!recipe) throw new Error('Usage: vis action-recipe <recipe> [asset...] [--query <query>] [--execute]')
  const refs = assetRefArgs().filter(ref => ref !== recipe)
  const result = runAssetActionRecipe(root, {
    recipe,
    assetRefs: refs,
    query: getFlag('--query'),
    mediaType: getFlag('--media-type'),
    category: getFlag('--category'),
    mood: getFlag('--mood'),
    filterTag: getFlag('--filter-tag'),
    filterRightsStatus: getFlag('--filter-rights-status'),
    filterApprovalStatus: getFlag('--filter-approval-status'),
    tags: getAllFlags('--tag'),
    note: getFlag('--note') || getFlag('--notes'),
    rating: getFlag('--rating'),
    color: getFlag('--color'),
    curationStatus: getFlag('--curation-status') || getFlag('--status'),
    collection: getFlag('--collection'),
    rightsStatus: getFlag('--rights-status'),
    approvalStatus: getFlag('--approval-status'),
    reason: getFlag('--reason') || getFlag('--note') || getFlag('--notes'),
    replaceTags: hasFlag('--replace-tags'),
    actor: 'vis-cli',
    limit: Number(getFlag('--limit', 50)),
    execute: hasFlag('--execute'),
  })
  printJson(result)
}

function cmdSmartCollections() {
  const root = projectRoot()
  const result = listSmartCollections(root, {
    sampleLimit: Number(getFlag('--sample-limit', 0)),
  })
  if (hasFlag('--json')) {
    printJson(result)
    return
  }
  console.log('\n=== VIS SMART COLLECTIONS ===\n')
  for (const collection of result) {
    const recipe = collection.action_recipe ? ` | recipe: ${collection.action_recipe}` : ''
    console.log(`${collection.id} | ${collection.label} | ${collection.count}${recipe}`)
    console.log(`  ${collection.description}`)
  }
}

function cmdSmartCollection() {
  const root = projectRoot()
  const collection = getFlag('--collection') || positionalArgs()[0]
  if (!collection) throw new Error('Usage: vis smart-collection <id> [--query <query>] [--limit <n>] [--json]')
  const result = evaluateSmartCollection(root, {
    collection,
    query: getFlag('--query'),
    mediaType: getFlag('--media-type'),
    category: getFlag('--category'),
    mood: getFlag('--mood'),
    filterTag: getFlag('--filter-tag') || getFlag('--tag'),
    filterRightsStatus: getFlag('--filter-rights-status'),
    filterApprovalStatus: getFlag('--filter-approval-status'),
    limit: Number(getFlag('--limit', 50)),
  })
  if (hasFlag('--json')) {
    printJson(result)
    return
  }
  console.log(`\n=== VIS SMART COLLECTION: ${result.label} ===\n`)
  console.log(`${result.description}`)
  console.log(`Selected: ${result.total_selected}`)
  if (result.commands.recipe_dry_run) console.log(`Recipe dry-run: ${result.commands.recipe_dry_run}`)
  for (const item of result.items.slice(0, Number(getFlag('--limit', 50)))) {
    console.log(`- ${item.asset_id} | ${item.media_type} | ${item.match_reason}`)
    console.log(`  ${item.path}`)
  }
}

function cmdRecordGeneration() {
  const root = projectRoot()
  const ref = positionalArgs()[0] || getFlag('--asset') || getFlag('--asset-id') || getFlag('--path') || getFlag('--uri')
  if (!ref) throw new Error('Usage: vis record-generation <asset|path|uri> [--prompt <text>] [--model <model>] [--agent codex] [--skill imagegen] [--execute] [--write-sidecar]')
  const result = recordGenerationProvenance(root, ref, {
    prompt: getFlag('--prompt'),
    negativePrompt: getFlag('--negative-prompt') || getFlag('--negative'),
    model: getFlag('--model'),
    provider: getFlag('--provider'),
    seed: getFlag('--seed'),
    settings: getFlag('--settings') || getFlag('--settings-json'),
    codingAgent: getFlag('--coding-agent') || getFlag('--agent'),
    repo: getFlag('--repo'),
    threadRef: getFlag('--thread'),
    sessionRef: getFlag('--session'),
    skillName: getFlag('--skill'),
    summary: getFlag('--summary'),
    sidecarPath: getFlag('--sidecar'),
    outputPaths: getAllFlags('--output-path'),
    actor: 'vis-cli',
    execute: hasFlag('--execute'),
    writeSidecar: hasFlag('--write-sidecar'),
  })
  printJson(result)
}

function cmdSavedSearches() {
  const root = projectRoot()
  printJson(listSavedSearches(root))
}

function cmdMusicReleases() {
  const root = projectRoot()
  const results = listMusicReleasePackets(root, {
    query: getFlag('--query') || positionalArgs().join(' '),
    limit: Number(getFlag('--limit', 50)),
  })
  if (hasFlag('--json')) {
    printJson(results)
    return
  }
  console.log(`\n=== VIS MUSIC RELEASE PACKETS: ${results.length} ===\n`)
  for (const packet of results) {
    console.log(`${packet.release_id} | ${packet.title}`)
    console.log(`  ${packet.gate_status}: ${packet.next_action}`)
    console.log(`  assets ${packet.counts.assets} | audio ${packet.counts.audio} | covers ${packet.counts.covers} | canvas/video ${packet.counts.canvas + packet.counts.videos} | docs ${packet.counts.documents}`)
    console.log(`  ${packet.release_path}`)
  }
}

function cmdMusicPacket() {
  const root = projectRoot()
  const ref = positionalArgs()[0] || getFlag('--asset') || getFlag('--asset-id') || getFlag('--path') || getFlag('--uri') || getFlag('--query')
  const packet = createMusicReleasePacket(root, ref, { intendedUse: getFlag('--use') })
  if (!packet) throw new Error(`Music release packet not found: ${ref || 'latest'}`)
  if (hasFlag('--json')) printJson(packet)
  else console.log(packet.codex_prompt)
}

function cmdSaveSearch() {
  const root = projectRoot()
  const name = getFlag('--name') || positionalArgs()[0]
  const query = getFlag('--query') || positionalArgs().slice(name ? 1 : 0).join(' ')
  const result = saveSearch(root, {
    name,
    query,
    tag: getFlag('--tag'),
    category: getFlag('--category'),
    mediaType: getFlag('--media-type'),
    mood: getFlag('--mood'),
    curationStatus: getFlag('--curation-status') || getFlag('--status'),
    minRating: getFlag('--min-rating'),
    actor: 'vis-cli',
    execute: hasFlag('--execute'),
  })
  printJson(result)
}

function cmdRecordPublication() {
  const root = projectRoot()
  const result = recordPublication(root, {
    assetId: getFlag('--asset') || getFlag('--asset-id') || getFlag('--path') || getFlag('--uri'),
    platform: getFlag('--platform'),
    url: getFlag('--url'),
    route: getFlag('--route'),
    caption: getFlag('--caption'),
    campaign: getFlag('--campaign'),
    status: getFlag('--status') || 'planned',
    actor: 'vis-cli',
    execute: hasFlag('--execute'),
  })
  printJson(result)
}

function cmdCloudinaryManifest() {
  const root = projectRoot()
  printJson(exportCloudinaryManifest(root, {
    query: getFlag('--query') || '',
    category: getFlag('--category'),
    mediaType: getFlag('--media-type'),
    folder: getFlag('--folder') || 'visual-intelligence',
    limit: Number(getFlag('--limit', 500)),
    includeUnsafe: hasFlag('--include-unsafe'),
  }))
}

function cmdNftReport() {
  const root = projectRoot()
  printJson(exportNftMetadataReport(root, {
    query: getFlag('--query'),
    category: getFlag('--category'),
    collection: getFlag('--collection'),
    limit: Number(getFlag('--limit', 200)),
  }))
}

function cmdOptimize() {
  const root = projectRoot()
  const db = openVisDatabase(root)
  try {
    const maxKB = Number(getFlag('--max-kb') || loadConfig(root).maxFileSizeKB || 2000)
    const oversized = searchAssets(db, { maxResults: 10000 }).filter(asset => (asset.sizeKB || 0) > maxKB)
    console.log('\n=== VIS OPTIMIZE DRY RUN ===\n')
    if (!oversized.length) {
      console.log(`No assets exceed ${maxKB} KB.`)
      return
    }
    for (const asset of oversized.slice(0, 100)) {
      console.log(`${asset.relative_path || asset.absolute_path} (${asset.sizeKB} KB)`)
    }
    if (oversized.length > 100) console.log(`... and ${oversized.length - 100} more`)
    console.log('\nOptimization execution remains human-gated. Use Cloudinary/R2 adapters or sharp derivatives in a dedicated phase.')
  } finally {
    db.close()
  }
}

function cmdMcpInfo() {
  const root = projectRoot()
  const db = openVisDatabase(root)
  try {
    const summary = getSummary(db)
    printJson({
      command: `node ${path.resolve(__dirname, '..', 'mcp', 'vis-mcp-server.mjs')}`,
      env: { VIS_ROOT: root },
      readOnlyDefault: true,
      summary,
    })
  } finally {
    db.close()
  }
}

function cmdDoctor() {
  const root = projectRoot()
  const configPath = path.join(root, 'vis.config.json')
  const config = loadConfig(root)
  const indexPath = path.isAbsolute(config.indexPath) ? config.indexPath : path.join(root, config.indexPath)
  const dashboardPath = path.isAbsolute(config.dashboardPath) ? config.dashboardPath : path.join(root, config.dashboardPath)
  const mcpPath = path.resolve(__dirname, '..', 'mcp', 'vis-mcp-server.mjs')
  const checks = [
    check('repoRoot', fs.existsSync(path.join(root, 'package.json')), root),
    check('config', fs.existsSync(configPath), configPath),
    check('nodeVersion', isSupportedNode(), process.version),
    check('sqliteIndex', fs.existsSync(indexPath), indexPath),
    check('dashboard', fs.existsSync(dashboardPath), dashboardPath),
    check('mcpServer', fs.existsSync(mcpPath), mcpPath),
  ]
  let summary = null
  if (fs.existsSync(indexPath)) {
    const db = openVisDatabase(root, config)
    try {
      summary = getSummary(db)
    } finally {
      db.close()
    }
  }
  const result = {
    ok: checks.every(item => item.ok),
    root,
    version: VIS_VERSION,
    checks,
    summary,
    mcp: {
      command: `node ${mcpPath}`,
      env: {
        VIS_ROOT: root,
        VIS_ALLOWED_ROOTS: root,
        VIS_ENABLE_WRITES: '0',
      },
      readOnlyDefault: true,
    },
    nextActions: doctorNextActions(checks, summary),
  }
  if (hasFlag('--json')) {
    printJson(result)
    return
  }
  console.log('\n=== VIS DOCTOR ===\n')
  for (const item of checks) console.log(`${item.ok ? 'OK ' : 'NO '} ${item.name}: ${item.detail}`)
  if (summary) {
    console.log('\nGraph:')
    console.log(`  assets:      ${summary.assets}`)
    console.log(`  versions:    ${summary.versions}`)
    console.log(`  locations:   ${summary.locations}`)
    console.log(`  usageEdges:  ${summary.usageEdges}`)
    console.log(`  prompts:     ${summary.prompts}`)
    console.log(`  annotations: ${summary.annotations || 0}`)
    console.log(`  savedSearch: ${summary.savedSearches || 0}`)
  }
  console.log('\nMCP:')
  console.log(`  ${result.mcp.command}`)
  console.log(`  VIS_ROOT=${root}`)
  console.log(`  VIS_ALLOWED_ROOTS=${root}`)
  if (result.nextActions.length) {
    console.log('\nNext actions:')
    for (const action of result.nextActions) console.log(`  - ${action}`)
  }
}

function check(name, ok, detail) {
  return { name, ok: Boolean(ok), detail }
}

function isSupportedNode() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  return major > 22 || (major === 22 && minor >= 13)
}

function doctorNextActions(checks, summary) {
  const actions = []
  if (!checks.find(item => item.name === 'config')?.ok) actions.push('Run: node bin/vis.mjs init')
  if (!checks.find(item => item.name === 'nodeVersion')?.ok) actions.push('Install Node.js 22.13+; Node 24+ is recommended for this repo.')
  if (!checks.find(item => item.name === 'sqliteIndex')?.ok) actions.push('Run: node bin/vis.mjs scan --media-root <asset-root>')
  if (!checks.find(item => item.name === 'dashboard')?.ok) actions.push('Run: node bin/vis.mjs dashboard --limit 3000')
  if (summary && !summary.usageEdges) actions.push('Run: node bin/vis.mjs usage --usage-root <website-or-content-repo>')
  return actions
}

function printIndexSummary(result) {
  console.log('\n=== VIS INDEX COMPLETE ===\n')
  console.log(`Root:          ${result.root}`)
  console.log(`SQLite:        ${result.indexPath}`)
  console.log(`Scanned files: ${result.scannedFiles}`)
  console.log(`Assets:        ${result.logicalAssets}`)
  console.log(`Versions:      ${result.versions}`)
  console.log(`Locations:     ${result.locations}`)
  console.log(`Usage edges:   ${result.usageEdges}`)
  console.log(`Registry JSON: ${result.registryPath}`)
  console.log(`Atlas JSON:    ${result.atlasPath}`)
}

function printScanProfile(profile) {
  console.log(`\n=== VIS SCAN PROFILE: ${profile.name} ===\n`)
  if (profile.description) console.log(`${profile.description}\n`)
  console.log('Existing media roots:')
  if (profile.existingMediaRoots.length) for (const root of profile.existingMediaRoots) console.log(`  OK ${root}`)
  else console.log('  none')
  console.log('\nMissing media roots:')
  if (profile.missingMediaRoots.length) for (const root of profile.missingMediaRoots) console.log(`  NO ${root}`)
  else console.log('  none')
  console.log('\nExisting usage roots:')
  if (profile.existingUsageRoots.length) for (const root of profile.existingUsageRoots) console.log(`  OK ${root}`)
  else console.log('  none')
  console.log('\nMissing usage roots:')
  if (profile.missingUsageRoots.length) for (const root of profile.missingUsageRoots) console.log(`  NO ${root}`)
  else console.log('  none')
  if (profile.notes.length) {
    console.log('\nNotes:')
    for (const note of profile.notes) console.log(`  - ${note}`)
  }
  console.log('\nDry run only. Add --execute to index existing roots.')
  console.log(`MCP allowlist from existing roots: ${profile.mcpAllowedRoots || 'none'}`)
}

function printVaultPlan(plan) {
  console.log(`\n=== VIS CREATIVE VAULT ${plan.dryRun ? 'PLAN' : 'INITIALIZED'} ===\n`)
  console.log(`Vault root: ${plan.vault_root}`)
  console.log(`Exists:     ${plan.vault_exists ? 'yes' : 'no'}`)
  console.log(`Folders:    ${plan.existing_folders}/${plan.folders.length} existing`)
  console.log('\nFolders:')
  for (const folder of plan.folders) {
    console.log(`  ${folder.exists ? 'OK' : 'NO'} ${folder.path} - ${folder.label}`)
  }
  console.log('\nCross-device commands:')
  console.log(`  ${plan.commands.execute}`)
  console.log(`  ${plan.commands.scan}`)
  console.log(`  ${plan.commands.eagle_import}`)
  console.log('\nMCP allowlist:')
  console.log(`  ${plan.mcp_allowed_roots}`)
  console.log('\nPhone workflow:')
  for (const step of plan.phone_workflow) console.log(`  - ${step}`)
}

function cmdVaultPlan() {
  const root = projectRoot()
  const result = planCreativeVault(root, {
    vaultRoot: getFlag('--vault-root'),
  })
  if (hasFlag('--json')) {
    printJson(result)
    return
  }
  printVaultPlan(result)
}

function cmdVaultInit() {
  const root = projectRoot()
  const result = initCreativeVault(root, {
    vaultRoot: getFlag('--vault-root'),
    execute: hasFlag('--execute'),
  })
  if (hasFlag('--json')) {
    printJson(result)
    return
  }
  printVaultPlan(result)
  if (result.dryRun) console.log('\nDry run only. Add --execute after the vault root is correct.')
  else {
    console.log(`\nCreated folders: ${result.created_folders.length}`)
    console.log(`Manifest: ${result.manifest_written}`)
    console.log(`Readme:   ${result.readme_written}`)
  }
}

const commands = {
  init: cmdInit,
  audit: cmdReport,
  scan: cmdScan,
  index: cmdScan,
  profiles: cmdProfiles,
  'scan-profile': cmdScanProfile,
  'vault-plan': cmdVaultPlan,
  'creative-vault': cmdVaultPlan,
  'vault-init': cmdVaultInit,
  'init-vault': cmdVaultInit,
  eagle: cmdEagleImport,
  'eagle-import': cmdEagleImport,
  report: cmdReport,
  usage: cmdUsage,
  search: cmdSearch,
  trace: cmdTrace,
  packet: cmdPacket,
  dashboard: cmdDashboard,
  'serve-dashboard': cmdServeDashboard,
  cockpit: cmdServeDashboard,
  atlas: cmdDashboard,
  duplicates: cmdDuplicates,
  orphans: cmdOrphans,
  similar: cmdSimilar,
  'find-similar': cmdSimilar,
  score: cmdScore,
  annotate: cmdAnnotate,
  'batch-annotate': cmdBatchAnnotate,
  'bulk-annotate': cmdBatchAnnotate,
  'review-assets': cmdReviewAssets,
  'approve-assets': cmdReviewAssets,
  'action-recipes': cmdActionRecipes,
  recipes: cmdActionRecipes,
  'action-recipe': cmdActionRecipe,
  'run-recipe': cmdActionRecipe,
  'ai-action': cmdActionRecipe,
  'smart-collections': cmdSmartCollections,
  'smart-views': cmdSmartCollections,
  'smart-collection': cmdSmartCollection,
  smart: cmdSmartCollection,
  'record-generation': cmdRecordGeneration,
  'record-provenance': cmdRecordGeneration,
  'saved-searches': cmdSavedSearches,
  'save-search': cmdSaveSearch,
  'music-releases': cmdMusicReleases,
  'music-packet': cmdMusicPacket,
  'record-publication': cmdRecordPublication,
  'cloudinary-manifest': cmdCloudinaryManifest,
  'nft-report': cmdNftReport,
  optimize: cmdOptimize,
  doctor: cmdDoctor,
  'mcp-info': cmdMcpInfo,
}

if (!command || command === '--help' || command === '-h') {
  console.log(`
VIS — Visual Intelligence OS v${VIS_VERSION}

Commands:
  vis init                         Initialize config and index if media exists
  vis scan                         Build SQLite graph and JSON exports
  vis scan --media-root <path>      Index an additional local media root
  vis scan --usage-root <path>      Scan route/content usage outside project root
  vis profiles                     List configured scan profiles
  vis scan-profile <name>          Dry-run a named multi-root scan profile
  vis scan-profile <name> --execute Index existing roots from a scan profile
  vis vault-plan                   Show Google Drive creative vault plan and cross-device setup status
  vis vault-init --execute          Create Creative Vault folders and VIS manifest after review
  vis eagle --library <path>        Dry-run Eagle library metadata import
  vis eagle --library <path> --execute Merge Eagle metadata into VIS
  vis audit                        Alias for report summary
  vis report                       Print graph summary
  vis report --html                Generate dashboard HTML
  vis usage --usage-root <path>     Re-scan usage edges without rehashing media
  vis dashboard                    Generate dashboard HTML and PWA shell
  vis serve-dashboard              Serve dashboard locally with media preview proxy
  vis search <query>               Search assets by path, tag, mood, category
  vis trace <asset|path|uri>        Print full provenance and usage trace
  vis packet <asset|path|uri>       Print Codex-ready curation packet
  vis duplicates                   List duplicate content groups
  vis orphans                      List assets with no detected usage
  vis similar [asset|query]         Find visually adjacent assets and review groups
  vis score [asset]                Score asset or collection readiness
  vis annotate <asset>             Dry-run or save tags, notes, rating, color, collection
  vis batch-annotate <asset...>     Dry-run or save curation metadata across assets
  vis review-assets <asset...>      Dry-run or save rights and approval status
  vis action-recipes                List dry-run asset action recipes
  vis action-recipe <recipe>         Dry-run or apply recipe curation across matching assets
  vis smart-collections             List live Eagle-style smart views with counts
  vis smart-collection <id>          Inspect one smart view and copy the attached dry-run recipe
  vis record-generation <asset>     Dry-run or save prompt/model/agent/skill provenance sidecar
  vis saved-searches               List saved smart-folder searches
  vis save-search --name <name>     Dry-run or save a smart search
  vis music-releases               List Music IS release media packets
  vis music-packet [release|asset]  Print Music IS handoff packet
  vis record-publication --asset <id> --platform <x> [--url <url>] [--execute]
  vis cloudinary-manifest          Dry-run Cloudinary upload manifest; guarded assets excluded by default
  vis nft-report                   Dry-run NFT metadata readiness report
  vis optimize                     Dry-run oversized asset report
  vis doctor                       Check local install, graph, dashboard, MCP info
  vis mcp-info                     Print MCP install info

Options:
  --root, -r <path>                Project root
  --json                          JSON output where supported
  --limit <n>                     Result limit

MCP server:
  node mcp/vis-mcp-server.mjs
`)
} else if (commands[command]) {
  Promise.resolve(commands[command]()).catch(error => {
    console.error(error.stack || error.message || error)
    process.exit(1)
  })
} else {
  console.error(`Unknown command: ${command}. Run 'vis --help' for usage.`)
  process.exit(1)
}
