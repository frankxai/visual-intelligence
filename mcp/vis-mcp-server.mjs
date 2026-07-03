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
  annotateAssets,
  createCurationPacket,
  exportCloudinaryManifest,
  exportNftMetadataReport,
  findDuplicates,
  findOrphans,
  findSimilarAssets,
  findProjectRoot,
  getAsset,
  getSummary,
  importEagleLibrary,
  initCreativeVault,
  listAssetActionRecipes,
  createMusicReleasePacket,
  evaluateSmartCollection,
  listSavedSearches,
  listSmartCollections,
  listMusicReleasePackets,
  loadConfig,
  mapUsage,
  openVisDatabase,
  parseJson,
  planCreativeVault,
  recordGenerationProvenance,
  recordPublication,
  reviewAssets,
  runAssetActionRecipe,
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
    color: args.color || args.color_family || args.colorFamily,
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

function toolFindSimilarAssets(args = {}) {
  return withDb(db => findSimilarAssets(db, {
    assetRef: args.asset_id || args.assetId || args.uri || args.path || null,
    query: args.query,
    mediaType: args.media_type || args.mediaType,
    minScore: args.min_score || args.minScore,
    poolLimit: args.pool_limit || args.poolLimit,
    limit: args.limit || 20,
  }))
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

function toolBulkAnnotateAssets(args = {}) {
  const assetRefs = [
    ...(Array.isArray(args.asset_ids) ? args.asset_ids : []),
    ...(Array.isArray(args.assetIds) ? args.assetIds : []),
    ...(Array.isArray(args.assets) ? args.assets : []),
    ...(Array.isArray(args.uris) ? args.uris : []),
    ...(Array.isArray(args.paths) ? args.paths : []),
    args.asset_id,
    args.assetId,
    args.uri,
    args.path,
  ].filter(Boolean)
  if (args.execute === true && !WRITE_ENABLED) {
    return withDb(db => ({
      blocked: true,
      reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: annotateAssets(db, assetRefs, { ...args, execute: false }),
    }))
  }
  return withDb(db => annotateAssets(db, assetRefs, {
    tags: args.tags || args.tag || [],
    note: args.note || args.notes,
    rating: args.rating,
    color: args.color || args.color_label || args.colorLabel,
    curationStatus: args.curation_status || args.curationStatus || args.status,
    collection: args.collection,
    replaceTags: args.replace_tags === true || args.replaceTags === true,
    actor: 'vis-mcp',
    execute: args.execute === true && WRITE_ENABLED,
  }))
}

function toolReviewAssets(args = {}) {
  const assetRefs = [
    ...(Array.isArray(args.asset_ids) ? args.asset_ids : []),
    ...(Array.isArray(args.assetIds) ? args.assetIds : []),
    ...(Array.isArray(args.assets) ? args.assets : []),
    ...(Array.isArray(args.uris) ? args.uris : []),
    ...(Array.isArray(args.paths) ? args.paths : []),
    args.asset_id,
    args.assetId,
    args.uri,
    args.path,
  ].filter(Boolean)
  if (args.execute === true && !WRITE_ENABLED) {
    return withDb(db => ({
      blocked: true,
      reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: true,
      preview: reviewAssets(db, assetRefs, { ...args, execute: false }),
    }))
  }
  return withDb(db => reviewAssets(db, assetRefs, {
    rightsStatus: args.rights_status || args.rightsStatus || args.rights,
    approvalStatus: args.approval_status || args.approvalStatus || args.approval,
    reason: args.reason || args.note || args.notes,
    actor: 'vis-mcp',
    execute: args.execute === true && WRITE_ENABLED,
  }))
}

function toolListAssetActionRecipes() {
  return listAssetActionRecipes()
}

function toolRunAssetActionRecipe(args = {}) {
  const assetRefs = [
    ...(Array.isArray(args.asset_ids) ? args.asset_ids : []),
    ...(Array.isArray(args.assetIds) ? args.assetIds : []),
    ...(Array.isArray(args.assets) ? args.assets : []),
    ...(Array.isArray(args.uris) ? args.uris : []),
    ...(Array.isArray(args.paths) ? args.paths : []),
    args.asset_id,
    args.assetId,
    args.uri,
    args.path,
  ].filter(Boolean)
  if (args.execute === true && !WRITE_ENABLED) {
    return withDb(db => ({
      blocked: true,
      reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: runAssetActionRecipe(db, { ...args, assetRefs, execute: false }),
    }))
  }
  return withDb(db => runAssetActionRecipe(db, {
    ...args,
    assetRefs,
    recipe: args.recipe || args.name || args.action,
    mediaType: args.media_type || args.mediaType,
    color: args.color || args.color_family || args.colorFamily,
    curationStatus: args.curation_status || args.curationStatus || args.status,
    filterTag: args.filter_tag || args.filterTag,
    filterRightsStatus: args.filter_rights_status || args.filterRightsStatus,
    filterApprovalStatus: args.filter_approval_status || args.filterApprovalStatus,
    rightsStatus: args.rights_status || args.rightsStatus || args.rights,
    approvalStatus: args.approval_status || args.approvalStatus || args.approval,
    tags: args.tags || args.tag || [],
    actor: 'vis-mcp',
    execute: args.execute === true && WRITE_ENABLED,
  }))
}

function toolListSavedSearches() {
  return withDb(db => listSavedSearches(db))
}

function toolListSmartCollections(args = {}) {
  return withDb(db => listSmartCollections(db, {
    sampleLimit: args.sample_limit || args.sampleLimit || 0,
  }))
}

function toolEvaluateSmartCollection(args = {}) {
  return withDb(db => evaluateSmartCollection(db, {
    ...args,
    collection: args.collection || args.collection_id || args.id || args.smart || args.name,
    mediaType: args.media_type || args.mediaType,
    color: args.color || args.color_family || args.colorFamily,
    filterTag: args.filter_tag || args.filterTag || args.tag,
    filterRightsStatus: args.filter_rights_status || args.filterRightsStatus,
    filterApprovalStatus: args.filter_approval_status || args.filterApprovalStatus,
    limit: args.limit || 50,
  }))
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
    color: args.color || args.color_family || args.colorFamily,
    curationStatus: args.curation_status || args.curationStatus || args.status,
    minRating: args.min_rating || args.minRating,
    actor: 'vis-mcp',
    execute: args.execute === true && WRITE_ENABLED,
  }))
}

function toolListMusicReleases(args = {}) {
  return withDb(db => listMusicReleasePackets(db, {
    query: args.query || '',
    limit: args.limit || args.max_results || args.maxResults || 50,
  }))
}

function toolCreateMusicReleasePacket(args = {}) {
  return withDb(db => createMusicReleasePacket(
    db,
    args.release_id || args.releaseId || args.asset_id || args.assetId || args.uri || args.path || args.query || null,
    { intendedUse: args.intended_use || args.intendedUse },
  ))
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

function toolPlanCreativeVault(args = {}) {
  return redactOutsideAllowlist(planCreativeVault(ROOT, {
    vaultRoot: args.vault_root || args.vaultRoot || args.path,
  }))
}

function toolInitCreativeVault(args = {}) {
  if (args.execute === true && !WRITE_ENABLED) {
    return {
      blocked: true,
      reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: redactOutsideAllowlist(initCreativeVault(ROOT, {
        vaultRoot: args.vault_root || args.vaultRoot || args.path,
        execute: false,
      })),
    }
  }
  return redactOutsideAllowlist(initCreativeVault(ROOT, {
    vaultRoot: args.vault_root || args.vaultRoot || args.path,
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

function toolRecordGenerationProvenance(args = {}) {
  if (args.execute === true && !WRITE_ENABLED) {
    return withDb(db => ({
      blocked: true,
      reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: recordGenerationProvenance(db, args.asset_id || args.assetId || args.uri || args.path, { ...args, execute: false }),
    }))
  }
  return withDb(db => recordGenerationProvenance(db, args.asset_id || args.assetId || args.uri || args.path, {
    prompt: args.prompt,
    negativePrompt: args.negative_prompt || args.negativePrompt,
    model: args.model,
    provider: args.provider,
    seed: args.seed,
    settings: args.settings || args.settings_json,
    codingAgent: args.coding_agent || args.codingAgent || args.agent,
    repo: args.repo,
    threadRef: args.thread_ref || args.threadRef || args.thread,
    sessionRef: args.session_ref || args.sessionRef || args.session,
    skillName: args.skill_name || args.skillName || args.skill,
    summary: args.summary,
    sidecarPath: args.sidecar_path || args.sidecarPath || args.sidecar,
    outputPaths: args.output_paths || args.outputPaths || [],
    actor: 'vis-mcp',
    execute: args.execute === true && WRITE_ENABLED,
    writeSidecar: args.write_sidecar === true || args.writeSidecar === true,
  }))
}

function toolCloudinaryManifest(args = {}) {
  return withDb(db => exportCloudinaryManifest(db, {
    ...args,
    mediaType: args.media_type || args.mediaType,
    includeUnsafe: args.include_unsafe === true || args.includeUnsafe === true,
  }))
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
  find_similar_assets: toolFindSimilarAssets,
  score_asset: toolScoreAsset,
  score_collection: toolScoreCollection,
  create_curation_packet: toolCreateCurationPacket,
  annotate_asset: toolAnnotateAsset,
  bulk_annotate_assets: toolBulkAnnotateAssets,
  review_assets: toolReviewAssets,
  list_asset_action_recipes: toolListAssetActionRecipes,
  run_asset_action_recipe: toolRunAssetActionRecipe,
  run_action_recipe: toolRunAssetActionRecipe,
  list_smart_collections: toolListSmartCollections,
  evaluate_smart_collection: toolEvaluateSmartCollection,
  get_smart_collection: toolEvaluateSmartCollection,
  list_saved_searches: toolListSavedSearches,
  save_search: toolSaveSearch,
  list_music_releases: toolListMusicReleases,
  create_music_release_packet: toolCreateMusicReleasePacket,
  import_eagle_library: toolImportEagleLibrary,
  plan_creative_vault: toolPlanCreativeVault,
  init_creative_vault: toolInitCreativeVault,
  record_generation_provenance: toolRecordGenerationProvenance,
  record_generation: toolRecordGenerationProvenance,
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
  tool('search_assets', 'Search VIS assets by query, tag, mood, category, media type, or extracted color palette.', {
    query: stringProp('Search query'),
    tag: stringProp('Tag filter'),
    mood: stringProp('Mood filter'),
    category: stringProp('Category filter'),
    media_type: stringProp('image, video, or audio'),
    color: stringProp('Color family or hex value, for example blue or #3366ff'),
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
  tool('find_similar_assets', 'Find visually adjacent assets or review groups using local metadata heuristics until embedding providers are configured.', {
    asset_id: stringProp('Optional VIS asset_id to use as the similarity target'),
    uri: stringProp('Optional visual://asset/{asset_id} target'),
    path: stringProp('Optional local or relative path target'),
    query: stringProp('Optional search query; first result becomes the similarity target'),
    media_type: stringProp('Optional image, video, or audio filter'),
    min_score: numberProp('Minimum similarity score, default 58'),
    pool_limit: numberProp('Maximum asset pool to inspect'),
    limit: numberProp('Result limit'),
  }),
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
  tool('bulk_annotate_assets', 'Dry-run or save local curation metadata across multiple assets. Writes require VIS_ENABLE_WRITES=1 and execute:true.', {
    asset_ids: { type: 'array', items: { type: 'string' }, description: 'VIS asset_ids' },
    assets: { type: 'array', items: { type: 'string' }, description: 'Asset ids, visual URIs, or paths' },
    uris: { type: 'array', items: { type: 'string' }, description: 'visual://asset/{asset_id} URIs' },
    paths: { type: 'array', items: { type: 'string' }, description: 'Local or relative paths' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Custom curation tags' },
    note: stringProp('Curation note'),
    rating: numberProp('Rating 1-5'),
    color: stringProp('Color label'),
    curation_status: stringProp('curated, favorite, approved, rejected, needs-review'),
    collection: stringProp('Collection name to add assets into'),
    replace_tags: booleanProp('Replace existing custom tags instead of merging'),
    execute: booleanProp('Persist annotations when VIS_ENABLE_WRITES=1'),
  }),
  tool('review_assets', 'Dry-run or save rights and approval status across assets. Writes require VIS_ENABLE_WRITES=1 and execute:true.', {
    asset_ids: { type: 'array', items: { type: 'string' }, description: 'VIS asset_ids' },
    assets: { type: 'array', items: { type: 'string' }, description: 'Asset ids, visual URIs, or paths' },
    uris: { type: 'array', items: { type: 'string' }, description: 'visual://asset/{asset_id} URIs' },
    paths: { type: 'array', items: { type: 'string' }, description: 'Local or relative paths' },
    rights_status: stringProp('owned, generated-owned, licensed, unknown, blocked, or needs-review'),
    approval_status: stringProp('candidate, approved, rejected, or needs-review'),
    reason: stringProp('Human review reason or evidence note'),
    execute: booleanProp('Persist review when VIS_ENABLE_WRITES=1'),
  }),
  tool('list_asset_action_recipes', 'List VIS dry-run asset action recipes for designer inbox, music release inbox, provenance gaps, website/social candidates, NFT/Web3, orphans, duplicates, and similarity review.', {}),
  tool('run_asset_action_recipe', 'Dry-run or apply a VIS asset action recipe. Writes require VIS_ENABLE_WRITES=1 and execute:true.', {
    recipe: stringProp('designer-inbox, music-release-inbox, prompt-gap-review, provenance-gap-review, website-candidates, social-candidates, nft-trait-review, orphan-review, duplicate-review, or similar-review'),
    asset_ids: { type: 'array', items: { type: 'string' }, description: 'Optional explicit VIS asset_ids' },
    assets: { type: 'array', items: { type: 'string' }, description: 'Optional asset ids, visual URIs, or paths' },
    uris: { type: 'array', items: { type: 'string' }, description: 'Optional visual://asset/{asset_id} URIs' },
    paths: { type: 'array', items: { type: 'string' }, description: 'Optional local or relative paths' },
    query: stringProp('Optional query filter when selecting recipe matches'),
    media_type: stringProp('Optional image, video, or audio filter'),
    category: stringProp('Optional category filter'),
    color: stringProp('Optional color family or hex filter'),
    filter_tag: stringProp('Optional existing tag that assets must already have'),
    tags: { type: 'array', items: { type: 'string' }, description: 'Additional custom tags to add' },
    note: stringProp('Override curation note'),
    rating: numberProp('Rating 1-5'),
    color: stringProp('Color label'),
    curation_status: stringProp('curated, favorite, approved, rejected, needs-review'),
    collection: stringProp('Collection name override'),
    rights_status: stringProp('Optional rights status to set during the recipe review step'),
    approval_status: stringProp('Optional approval status to set during the recipe review step'),
    reason: stringProp('Human review reason if setting rights or approval'),
    limit: numberProp('Maximum selected assets'),
    execute: booleanProp('Persist recipe annotations/reviews when VIS_ENABLE_WRITES=1'),
  }),
  tool('list_smart_collections', 'List live VIS smart collections with counts, Eagle-style queue labels, and attached dry-run recipe handoffs.', {
    sample_limit: numberProp('Optional sample assets per smart collection'),
  }),
  tool('evaluate_smart_collection', 'Inspect one live VIS smart collection. Read-only; use attached recipe_dry_run before any write-gated action.', {
    collection: stringProp('inbox, rights-review, prompt-gaps, provenance-gaps, website-used, orphans, duplicates, similar-review, curated, favorites, color-indexed, unannotated, music, video-motion, nft-web3, website-ready, or social-ready'),
    query: stringProp('Optional query filter'),
    media_type: stringProp('Optional image, video, or audio filter'),
    category: stringProp('Optional category filter'),
    color: stringProp('Optional color family or hex filter'),
    filter_tag: stringProp('Optional existing tag required on matching assets'),
    filter_rights_status: stringProp('Optional rights status filter'),
    filter_approval_status: stringProp('Optional approval status filter'),
    limit: numberProp('Maximum selected assets'),
  }),
  tool('list_saved_searches', 'List saved VIS smart-folder searches.', {}),
  tool('save_search', 'Dry-run or save a VIS smart-folder search. Writes require VIS_ENABLE_WRITES=1 and execute:true.', {
    name: stringProp('Saved search name'),
    query: stringProp('Search query'),
    tag: stringProp('Tag filter'),
    category: stringProp('Category filter'),
    media_type: stringProp('image, video, or audio'),
    mood: stringProp('Mood filter'),
    color: stringProp('Color family or hex filter'),
    curation_status: stringProp('Curation status filter'),
    min_rating: numberProp('Minimum curation rating'),
    execute: booleanProp('Persist saved search when VIS_ENABLE_WRITES=1'),
  }),
  tool('list_music_releases', 'List VIS music release media packets while keeping Music IS canonical for release state.', {
    query: stringProp('Release title/path/tag query'),
    limit: numberProp('Maximum release packets'),
  }),
  tool('create_music_release_packet', 'Create a Codex-ready Music IS handoff packet for a release path, release id, or contained asset.', {
    release_id: stringProp('VIS music_release id'),
    query: stringProp('Release title/path query'),
    asset_id: stringProp('Contained VIS asset_id'),
    uri: stringProp('Contained visual://asset/{asset_id}'),
    path: stringProp('Contained local or relative path'),
    intended_use: stringProp('Release review, cover, Canvas, social, website, or distribution packet use case'),
  }),
  tool('import_eagle_library', 'Dry-run or import Eagle library metadata into VIS. Execute merges Eagle tags, notes, folders, provider locations, and provenance and requires VIS_ENABLE_WRITES=1.', {
    library: stringProp('Eagle library path'),
    library_root: stringProp('Eagle library path'),
    libraries: { type: 'array', items: { type: 'string' }, description: 'Eagle library paths' },
    limit: numberProp('Maximum Eagle metadata items to inspect'),
    execute: booleanProp('Persist import when VIS_ENABLE_WRITES=1'),
  }),
  tool('plan_creative_vault', 'Plan the Google Drive/Starlight Creative Vault folder contract for two laptops, phones, Eagle, VIS, and Music IS. Read-only.', {
    vault_root: stringProp('Optional explicit Creative Vault root path'),
    path: stringProp('Optional explicit Creative Vault root path'),
  }),
  tool('init_creative_vault', 'Dry-run or create Creative Vault folders and VIS manifest. Writes require VIS_ENABLE_WRITES=1 and execute:true.', {
    vault_root: stringProp('Optional explicit Creative Vault root path'),
    path: stringProp('Optional explicit Creative Vault root path'),
    execute: booleanProp('Create folders/manifests when VIS_ENABLE_WRITES=1'),
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
  tool('record_generation_provenance', 'Dry-run or record prompt/model/agent/skill provenance for a generated asset. Writes require VIS_ENABLE_WRITES=1 and execute:true.', {
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative path'),
    prompt: stringProp('Generation prompt'),
    negative_prompt: stringProp('Negative prompt'),
    model: stringProp('Generation model'),
    provider: stringProp('Generation provider'),
    seed: stringProp('Generation seed'),
    settings: { type: 'object', description: 'Generation settings or parameters' },
    coding_agent: stringProp('Coding or media agent, e.g. codex, claude, grok, image_gen'),
    repo: stringProp('Repo where the agent run happened'),
    thread_ref: stringProp('Codex/Claude/Grok thread reference'),
    session_ref: stringProp('Agent session reference'),
    skill_name: stringProp('Skill used, e.g. visual-intelligence or imagegen'),
    output_paths: { type: 'array', items: { type: 'string' }, description: 'Generated output paths' },
    sidecar_path: stringProp('Optional explicit .vis.provenance.json path'),
    write_sidecar: booleanProp('Write the sidecar file when VIS_ENABLE_WRITES=1 and execute:true'),
    execute: booleanProp('Persist provenance when VIS_ENABLE_WRITES=1'),
  }),
  tool('export_cloudinary_manifest', 'Create a dry-run Cloudinary upload/DAM manifest. Assets with unsafe rights/approval are guarded by default.', {
    query: stringProp('Optional query'),
    category: stringProp('Optional category'),
    media_type: stringProp('Optional media type'),
    folder: stringProp('Cloudinary folder'),
    limit: numberProp('Maximum assets'),
    include_unsafe: booleanProp('Include guarded assets in the dry-run manifest while keeping upload_ready false'),
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
