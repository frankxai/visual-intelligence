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
  createCurationPacket,
  exportCloudinaryManifest,
  exportNftMetadataReport,
  findDuplicates,
  findOrphans,
  findProjectRoot,
  getAsset,
  getSummary,
  indexProject,
  loadConfig,
  openVisDatabase,
  recordPublication,
  resolveAssetId,
  resolveMediaRoots,
  scanUsageOnly,
  scoreAsset,
  scoreCollection,
  searchAssets,
  traceAsset,
} from '../core/vis-core.mjs'
import { generateDashboard } from '../web/vis-dashboard.mjs'

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
  '--path', '--uri', '--platform', '--url', '--route', '--caption', '--campaign',
  '--status', '--query', '--folder', '--collection', '--use', '--max-kb',
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

function printJson(value) {
  console.log(JSON.stringify(value, null, 2))
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

function cmdScore() {
  const root = projectRoot()
  const ref = positionalArgs()[0]
  if (ref) printJson(scoreAsset(root, ref))
  else printJson(scoreCollection(root, getFlag('--collection')))
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

const commands = {
  init: cmdInit,
  audit: cmdReport,
  scan: cmdScan,
  index: cmdScan,
  report: cmdReport,
  usage: cmdUsage,
  search: cmdSearch,
  trace: cmdTrace,
  packet: cmdPacket,
  dashboard: cmdDashboard,
  atlas: cmdDashboard,
  duplicates: cmdDuplicates,
  orphans: cmdOrphans,
  score: cmdScore,
  'record-publication': cmdRecordPublication,
  'cloudinary-manifest': cmdCloudinaryManifest,
  'nft-report': cmdNftReport,
  optimize: cmdOptimize,
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
  vis audit                        Alias for report summary
  vis report                       Print graph summary
  vis report --html                Generate dashboard HTML
  vis usage --usage-root <path>     Re-scan usage edges without rehashing media
  vis dashboard                    Generate dashboard HTML
  vis search <query>               Search assets by path, tag, mood, category
  vis trace <asset|path|uri>        Print full provenance and usage trace
  vis packet <asset|path|uri>       Print Codex-ready curation packet
  vis duplicates                   List duplicate content groups
  vis orphans                      List assets with no detected usage
  vis score [asset]                Score asset or collection readiness
  vis record-publication --asset <id> --platform <x> [--url <url>] [--execute]
  vis cloudinary-manifest          Dry-run Cloudinary upload manifest
  vis nft-report                   Dry-run NFT metadata readiness report
  vis optimize                     Dry-run oversized asset report
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
