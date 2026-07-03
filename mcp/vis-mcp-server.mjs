#!/usr/bin/env node
/**
 * VIS MCP Server — Visual Intelligence OS
 *
 * Read-only by default. Write-like actions return dry-run manifests unless
 * VIS_ENABLE_WRITES=1 and the tool arguments include execute: true.
 */

import { createInterface } from 'readline'
import path from 'path'
import {
  annotateAsset,
  createCurationPacket,
  exportCloudinaryManifest,
  exportNftMetadataReport,
  findDuplicates,
  findOrphans,
  findProjectRoot,
  getAsset,
  getSummary,
  importEagleLibrary,
  listSavedSearches,
  loadConfig,
  mapUsage,
  openVisDatabase,
  parseJson,
  recordPublication,
  saveSearch,
  scoreAsset,
  scoreCollection,
  searchAssets,
  traceAsset,
} from '../core/vis-core.mjs'

const ROOT = path.resolve(process.env.VIS_ROOT || findProjectRoot(process.cwd()))
const CONFIG = loadConfig(ROOT)
const WRITE_ENABLED = process.env.VIS_ENABLE_WRITES === '1'
const MCP_PROTOCOL_VERSION = process.env.VIS_MCP_PROTOCOL_VERSION || '2025-06-18'
const ALLOWED_ROOTS = [
  ROOT,
  ...(process.env.VIS_ALLOWED_ROOTS || '').split(path.delimiter).filter(Boolean),
  ...(CONFIG.allowedRoots || []),
].filter(Boolean).map(resolveAllowedRoot)

function withDb(fn) {
  const db = openVisDatabase(ROOT, CONFIG)
  try {
    return redactOutsideAllowlist(fn(db))
  } finally {
    db.close()
  }
}

function toolSearchAssets(args = {}) {
  return withDb(db => searchAssets(db, {
    query: args.query || '',
    tag: args.tag,
    mood: args.mood,
    category: args.category,
    mediaType: args.media_type || args.mediaType,
    maxResults: args.max_results || args.maxResults || 20,
  }))
}

function toolGetAsset(args = {}) {
  return withDb(db => getAsset(db, args.asset_id || args.assetId || args.uri || args.path))
}

function toolTraceAsset(args = {}) {
  return withDb(db => traceAsset(db, args.asset_id || args.assetId || args.uri || args.path))
}

function toolMapUsage(args = {}) {
  return withDb(db => mapUsage(db, args.asset_id || args.assetId || args.uri || args.path || null))
}

function toolFindDuplicates(args = {}) {
  return withDb(db => findDuplicates(db, { limit: args.limit || 50 }))
}

function toolFindOrphans(args = {}) {
  return withDb(db => findOrphans(db, { limit: args.limit || 100 }))
}

function toolScoreAsset(args = {}) {
  return withDb(db => scoreAsset(db, args.asset_id || args.assetId || args.uri || args.path))
}

function toolScoreCollection(args = {}) {
  return withDb(db => scoreCollection(db, args.collection_id || args.collectionId || args.collection || null))
}

function toolCreateCurationPacket(args = {}) {
  return withDb(db => createCurationPacket(db, args.asset_id || args.assetId || args.uri || args.path, {
    intendedUse: args.intended_use || args.intendedUse,
  }))
}

function toolAnnotateAsset(args = {}) {
  if (args.execute === true && !WRITE_ENABLED) {
    return withDb(db => ({
      blocked: true,
      reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: annotateAsset(db, args.asset_id || args.assetId || args.uri || args.path, { ...args, execute: false }),
    }))
  }
  return withDb(db => annotateAsset(db, args.asset_id || args.assetId || args.uri || args.path, {
    tags: args.tags || args.tag || [],
    note: args.note || args.notes,
    rating: args.rating,
    color: args.color || args.color_label || args.colorLabel,
    curationStatus: args.curation_status || args.curationStatus || args.status,
    collection: args.collection,
    actor: 'vis-mcp',
    execute: args.execute === true && WRITE_ENABLED,
  }))
}

function toolListSavedSearches() {
  return withDb(db => listSavedSearches(db))
}

function toolSaveSearch(args = {}) {
  if (args.execute === true && !WRITE_ENABLED) {
    return withDb(db => ({
      blocked: true,
      reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: saveSearch(db, { ...args, execute: false }),
    }))
  }
  return withDb(db => saveSearch(db, {
    ...args,
    mediaType: args.media_type || args.mediaType,
    curationStatus: args.curation_status || args.curationStatus || args.status,
    minRating: args.min_rating || args.minRating,
    actor: 'vis-mcp',
    execute: args.execute === true && WRITE_ENABLED,
  }))
}

function toolImportEagleLibrary(args = {}) {
  if (args.execute === true && !WRITE_ENABLED) {
    return withDb(db => ({
      blocked: true,
      reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: importEagleLibrary(db, {
        libraryRoot: args.library || args.library_root || args.libraryRoot,
        libraryRoots: args.libraries || args.library_roots || args.libraryRoots || [],
        limit: args.limit,
        execute: false,
      }),
    }))
  }
  return withDb(db => importEagleLibrary(db, {
    libraryRoot: args.library || args.library_root || args.libraryRoot,
    libraryRoots: args.libraries || args.library_roots || args.libraryRoots || [],
    limit: args.limit,
    execute: args.execute === true && WRITE_ENABLED,
  }))
}

function toolRecordPublication(args = {}) {
  if (args.execute === true && !WRITE_ENABLED) {
    return withDb(db => ({
      blocked: true,
      reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: recordPublication(db, { ...args, execute: false }),
    }))
  }
  return withDb(db => recordPublication(db, {
    assetId: args.asset_id || args.assetId || args.uri || args.path,
    versionId: args.version_id || args.versionId,
    platform: args.platform,
    url: args.url,
    route: args.route,
    caption: args.caption,
    campaign: args.campaign,
    status: args.status || 'planned',
    metrics: args.metrics || {},
    publishedAt: args.published_at || args.publishedAt,
    actor: 'vis-mcp',
    execute: args.execute === true && WRITE_ENABLED,
  }))
}

function toolCloudinaryManifest(args = {}) {
  return withDb(db => exportCloudinaryManifest(db, args))
}

function toolNftMetadataReport(args = {}) {
  return withDb(db => exportNftMetadataReport(db, args))
}

function toolReport() {
  return withDb(db => getSummary(db))
}

const TOOL_HANDLERS = {
  search_assets: toolSearchAssets,
  get_asset: toolGetAsset,
  trace_asset: toolTraceAsset,
  map_usage: toolMapUsage,
  find_duplicates: toolFindDuplicates,
  find_orphans: toolFindOrphans,
  score_asset: toolScoreAsset,
  score_collection: toolScoreCollection,
  create_curation_packet: toolCreateCurationPacket,
  annotate_asset: toolAnnotateAsset,
  list_saved_searches: toolListSavedSearches,
  save_search: toolSaveSearch,
  import_eagle_library: toolImportEagleLibrary,
  record_publication: toolRecordPublication,
  export_cloudinary_manifest: toolCloudinaryManifest,
  export_nft_metadata_report: toolNftMetadataReport,

  // Backward-compatible legacy VIS tools.
  vis_search: toolSearchAssets,
  vis_report: toolReport,
  vis_audit: toolReport,
  vis_suggest: args => toolSearchAssets({ query: args.context, mood: args.mood, maxResults: 3 }),
  vis_intelligence: toolReport,
}

const TOOLS = [
  tool('search_assets', 'Search VIS assets by query, tag, mood, category, or media type.', {
    query: stringProp('Search query'),
    tag: stringProp('Tag filter'),
    mood: stringProp('Mood filter'),
    category: stringProp('Category filter'),
    media_type: stringProp('image, video, or audio'),
    max_results: numberProp('Maximum results'),
  }),
  tool('get_asset', 'Get one asset with versions, locations, usage, prompts, publications, rights, and evals.', {
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative path'),
  }),
  tool('trace_asset', 'Trace one asset across provenance, prompts, usage, locations, publications, and curation packet.', {
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative path'),
  }),
  tool('map_usage', 'Map detected website/content usage for one asset or the whole index.', {
    asset_id: stringProp('Optional VIS asset_id'),
    uri: stringProp('Optional visual URI'),
    path: stringProp('Optional path'),
  }),
  tool('find_duplicates', 'Find duplicate content groups by SHA-256.', { limit: numberProp('Result limit') }),
  tool('find_orphans', 'Find indexed assets with no detected route/content usage.', { limit: numberProp('Result limit') }),
  tool('score_asset', 'Score one asset for rights, approval, provenance, usage, and eval readiness.', {
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative path'),
  }),
  tool('score_collection', 'Score a collection or recent asset sample for publication/NFT readiness.', {
    collection_id: stringProp('Collection id or name'),
    collection: stringProp('Collection id or name'),
  }),
  tool('create_curation_packet', 'Create a Codex-ready packet with local path, visual URI, rights, provenance, and next action.', {
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative path'),
    intended_use: stringProp('Website/social/NFT/content use case'),
  }),
  tool('annotate_asset', 'Dry-run or save local curation metadata: tags, notes, rating, color label, status, and collection.', {
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative path'),
    tags: { type: 'array', items: { type: 'string' }, description: 'Custom curation tags' },
    note: stringProp('Curation note'),
    rating: numberProp('Rating 1-5'),
    color: stringProp('Color label'),
    curation_status: stringProp('curated, favorite, approved, rejected, needs-review'),
    collection: stringProp('Collection name to add the asset into'),
    execute: booleanProp('Persist annotation when VIS_ENABLE_WRITES=1'),
  }),
  tool('list_saved_searches', 'List saved VIS smart-folder searches.', {}),
  tool('save_search', 'Dry-run or save a VIS smart-folder search. Writes require VIS_ENABLE_WRITES=1 and execute:true.', {
    name: stringProp('Saved search name'),
    query: stringProp('Search query'),
    tag: stringProp('Tag filter'),
    category: stringProp('Category filter'),
    media_type: stringProp('image, video, or audio'),
    mood: stringProp('Mood filter'),
    curation_status: stringProp('Curation status filter'),
    min_rating: numberProp('Minimum curation rating'),
    execute: booleanProp('Persist saved search when VIS_ENABLE_WRITES=1'),
  }),
  tool('import_eagle_library', 'Dry-run or import Eagle library metadata into VIS. Execute merges Eagle tags, notes, folders, provider locations, and provenance and requires VIS_ENABLE_WRITES=1.', {
    library: stringProp('Eagle library path'),
    library_root: stringProp('Eagle library path'),
    libraries: { type: 'array', items: { type: 'string' }, description: 'Eagle library paths' },
    limit: numberProp('Maximum Eagle metadata items to inspect'),
    execute: booleanProp('Persist import when VIS_ENABLE_WRITES=1'),
  }),
  tool('record_publication', 'Dry-run or record where an asset was published. Writes require VIS_ENABLE_WRITES=1 and execute:true.', {
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative path'),
    platform: stringProp('Platform or site'),
    url: stringProp('Published URL'),
    route: stringProp('Website route'),
    caption: stringProp('Caption or usage note'),
    campaign: stringProp('Campaign'),
    status: stringProp('planned, published, archived, failed'),
    execute: booleanProp('Persist record when VIS_ENABLE_WRITES=1'),
  }),
  tool('export_cloudinary_manifest', 'Create a dry-run Cloudinary upload/DAM manifest.', {
    query: stringProp('Optional query'),
    category: stringProp('Optional category'),
    media_type: stringProp('Optional media type'),
    folder: stringProp('Cloudinary folder'),
    limit: numberProp('Maximum assets'),
  }),
  tool('export_nft_metadata_report', 'Create a dry-run NFT metadata/readiness report.', {
    query: stringProp('Optional query'),
    category: stringProp('Optional category'),
    collection: stringProp('Collection id/name'),
    limit: numberProp('Maximum assets'),
  }),
  tool('vis_search', 'Legacy alias for search_assets.', {
    query: stringProp('Search query'),
    mood: stringProp('Mood filter'),
    category: stringProp('Category filter'),
    maxResults: numberProp('Maximum results'),
  }),
  tool('vis_report', 'Legacy summary report alias.', {}),
  tool('vis_audit', 'Legacy audit summary alias.', {}),
  tool('vis_suggest', 'Legacy suggestion alias for a usage context.', {
    context: stringProp('Usage context'),
    mood: stringProp('Mood filter'),
  }),
  tool('vis_intelligence', 'Legacy VIS intelligence summary alias.', {}),
]

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'visual://asset/{asset_id}',
    name: 'VIS Asset',
    description: 'Asset detail with versions, locations, prompts, usage, and publications.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'visual://asset/{asset_id}/versions',
    name: 'VIS Asset Versions',
    description: 'Immutable versions for an asset.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'visual://asset/{asset_id}/provenance',
    name: 'VIS Asset Provenance',
    description: 'Append-only provenance events for an asset.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'visual://collection/{collection_id}',
    name: 'VIS Collection',
    description: 'Collection and collection items.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'visual://brand/{brand}/approved',
    name: 'Approved Brand Assets',
    description: 'Approved assets for a brand or category.',
    mimeType: 'application/json',
  },
]

function listResources() {
  return withDb(db => {
    const assets = searchAssets(db, { maxResults: 50 })
    return {
      resources: [
        {
          uri: 'visual://brand/starlight/approved',
          name: 'Approved Starlight Assets',
          description: 'Approved Starlight/SIS brand assets if marked approved.',
          mimeType: 'application/json',
        },
        ...assets.map(asset => ({
          uri: `visual://asset/${asset.asset_id}`,
          name: asset.title || asset.asset_id,
          description: `${asset.media_type} | ${asset.category || 'uncategorized'} | ${asset.relative_path || ''}`,
          mimeType: 'application/json',
        })),
      ],
    }
  })
}

function readResource(uri) {
  return withDb(db => {
    const parsed = parseVisualUri(uri)
    if (!parsed) throw new Error(`Unsupported VIS resource: ${uri}`)
    if (parsed.kind === 'asset') {
      const asset = getAsset(db, parsed.id)
      if (!asset) throw new Error(`Asset not found: ${parsed.id}`)
      if (parsed.child === 'versions') return resourceContents(uri, asset.versions)
      if (parsed.child === 'provenance') {
        const trace = traceAsset(db, parsed.id)
        return resourceContents(uri, trace?.provenance || [])
      }
      return resourceContents(uri, asset)
    }
    if (parsed.kind === 'brand-approved') {
      const results = searchAssets(db, { query: parsed.id, maxResults: 100 }).filter(asset => asset.approval_status === 'approved')
      return resourceContents(uri, results)
    }
    if (parsed.kind === 'collection') {
      const collection = db.prepare('SELECT * FROM collection WHERE collection_id = ? OR name = ? LIMIT 1').get(parsed.id, parsed.id)
      const items = collection
        ? db.prepare('SELECT * FROM collection_item WHERE collection_id = ? ORDER BY position').all(collection.collection_id)
        : []
      return resourceContents(uri, { collection, items })
    }
    throw new Error(`Unsupported VIS resource: ${uri}`)
  })
}

function parseVisualUri(uri) {
  const asset = uri.match(/^visual:\/\/asset\/([^/]+)(?:\/(versions|provenance))?$/)
  if (asset) return { kind: 'asset', id: asset[1], child: asset[2] || null }
  const collection = uri.match(/^visual:\/\/collection\/([^/]+)$/)
  if (collection) return { kind: 'collection', id: collection[1] }
  const brand = uri.match(/^visual:\/\/brand\/([^/]+)\/approved$/)
  if (brand) return { kind: 'brand-approved', id: brand[1] }
  return null
}

function resourceContents(uri, value) {
  return {
    contents: [{
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(value, null, 2),
    }],
  }
}

function tool(name, description, properties) {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      additionalProperties: true,
    },
  }
}

function stringProp(description) {
  return { type: 'string', description }
}

function numberProp(description) {
  return { type: 'number', description }
}

function booleanProp(description) {
  return { type: 'boolean', description }
}

function isAllowedPath(value) {
  if (!value || typeof value !== 'string') return true
  if (!path.isAbsolute(value)) return true
  const normalized = normalizePathForAllowlist(value)
  return ALLOWED_ROOTS.some(root => normalized === root || normalized.startsWith(root + path.sep))
}

function resolveAllowedRoot(value) {
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(ROOT, value)
  return normalizePathForAllowlist(resolved)
}

function normalizePathForAllowlist(value) {
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase()
}

function redactOutsideAllowlist(value) {
  if (Array.isArray(value)) return value.map(redactOutsideAllowlist)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, child] of Object.entries(value)) {
      if ((key.includes('path') || key.includes('Path')) && typeof child === 'string' && !isAllowedPath(child)) {
        out[key] = '[redacted outside VIS allowlist]'
      } else {
        out[key] = redactOutsideAllowlist(child)
      }
    }
    return out
  }
  return value
}

function send(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}

function sendErr(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

const rl = createInterface({ input: process.stdin, terminal: false })
rl.on('line', (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const { id, method, params } = msg
  try {
    if (method === 'initialize') {
      send(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'vis-mcp', version: '2.0.0', root: ROOT, readOnlyDefault: !WRITE_ENABLED },
      })
      return
    }
    if (method === 'notifications/initialized') return
    if (method === 'tools/list') {
      send(id, { tools: TOOLS })
      return
    }
    if (method === 'tools/call') {
      const { name, arguments: toolArgs } = params || {}
      const handler = TOOL_HANDLERS[name]
      if (!handler) {
        send(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true })
        return
      }
      const result = handler(toolArgs || {})
      send(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] })
      return
    }
    if (method === 'resources/list') {
      send(id, listResources())
      return
    }
    if (method === 'resources/templates/list') {
      send(id, { resourceTemplates: RESOURCE_TEMPLATES })
      return
    }
    if (method === 'resources/read') {
      send(id, readResource(params?.uri))
      return
    }
    if (id !== undefined) sendErr(id, -32601, `Method not found: ${method}`)
  } catch (error) {
    if (method === 'tools/call') {
      send(id, { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true })
    } else {
      sendErr(id, -32000, error.message)
    }
  }
})

process.on('uncaughtException', () => {})
