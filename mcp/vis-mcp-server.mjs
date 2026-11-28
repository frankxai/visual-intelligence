#!/usr/bin/env node
/**
 * VIS MCP Server — Visual Intelligence OS
 *
 * Read-only by default. Write-like actions return dry-run manifests unless
 * VIS_ENABLE_WRITES=1 and the tool arguments include execute: true.
 * Rights changes additionally need VIS_ENABLE_RIGHTS=1, and publication
 * records need VIS_ENABLE_PUBLISH=1. Both are human gates: a person turns
 * them on for a session and off again.
 */

import { identitySchema, resolveVisualIdentity } from '../core/visual-identity.mjs'
import { characterSchema, resolveCharacter } from '../core/character-resolver.mjs'
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
  getTasteDirectives,
  importEagleLibrary,
  initCreativeVault,
  listAssetActionRecipes,
  listDerivativePresets,
  createMusicReleasePacket,
  drainFeedbackOutbox,
  recordCurationFeedback,
  undoCurationFeedback,
  evaluateSmartCollection,
  listSavedSearches,
  listSmartCollections,
  listMusicReleasePackets,
  loadConfig,
  mapUsage,
  openVisDatabase,
  parseJson,
  planAssetDerivatives,
  planCreativeVault,
  recordGenerationProvenance,
  recordPublication,
  renameAssets,
  reviewAssets,
  runAssetActionRecipe,
  saveSearch,
  scoreAsset,
  scoreCollection,
  searchAssets,
  traceAsset,
  planStorageUpload,
  planArtifactsCurationPacket,
  listPlacementFrames,
  compareAssetPlacements,
  executeStorageUpload,
  getStorageStats,
  routeAssetDestination,
  scanDriveVaultMirror,
  tasteLedgerPath,
} from '../core/vis-core.mjs'
import {
  NAMED_TRANSFORMS,
  TRANSFORM_LIMITS,
  parseTransformSpec,
  negotiateFormat,
  computeSpecHash,
  derivedKey,
  toCloudflareImageTransform,
  createSignedTransformUrl,
  buildResponsiveDeliveryManifest,
} from '../core/vis-transform.mjs'
import {
  DEFAULT_METADATA_FIELDS,
  DEFAULT_CONDITIONAL_RULES,
  DEFAULT_UPLOAD_PRESETS,
  validateStructuredMetadata,
  planDerivativePurge,
  buildCharacterCanonBrief,
} from '../core/vis-dam-layers.mjs'
import { planContentAddressedR2Intake } from '../core/adapters/cloudflare-r2-adapter.mjs'
import { resolvePrivateWorkerBase } from '../core/vis-r2-dam-plan.mjs'
import {
  decideProposal,
  getLibraryAsset,
  ingestLibrary,
  listLibrary,
  listProposals,
  openLibraryDatabase,
  proposalStats,
  proposeForAsset,
  renditionPath,
  resolveLibraryRoots,
} from '../core/vis-library.mjs'
import {
  CatalogError,
  catalogTools,
  projectCatalogAsset,
  validateCatalogInput,
} from '../core/vis-catalog-access.mjs'

const ROOT = path.resolve(process.env.VIS_ROOT || findProjectRoot(process.cwd()))
const CONFIG = loadConfig(ROOT)
const WRITE_ENABLED = process.env.VIS_ENABLE_WRITES === '1'
const RIGHTS_ENABLED = process.env.VIS_ENABLE_RIGHTS === '1'
const PUBLISH_ENABLED = process.env.VIS_ENABLE_PUBLISH === '1'
// Declared library roots are this workspace's catalog sources. Label, not path, is the source_id.
const LIBRARY_SOURCES = resolveLibraryRoots(ROOT, CONFIG)
const LIBRARY_ROOTS = LIBRARY_SOURCES.map(r => r.path)
const MCP_PROTOCOL_VERSION = process.env.VIS_MCP_PROTOCOL_VERSION || '2025-06-18'
const MCP_MODE = process.env.VIS_MCP_MODE === 'dynamic' ? 'dynamic' : 'full'
const ALLOWED_ROOTS = [
  ROOT,
  ...(process.env.VIS_ALLOWED_ROOTS || '').split(path.delimiter).filter(Boolean),
  ...(CONFIG.allowedRoots || []),
].filter(Boolean).map(resolveAllowedRoot)
// Library roots may be shown in results, but they are not rename or write roots.
const READABLE_ROOTS = [...ALLOWED_ROOTS, ...LIBRARY_ROOTS.map(resolveAllowedRoot)]

const RIGHTS_OFF = 'Rights changes need a person. Restart this MCP server with VIS_ENABLE_RIGHTS=1 for that session, or set rights in the library screen.'

// One gate for every tool that can forward a rights change.
function rightsChangeBlocked(args = {}) {
  const change = args.rights_status || args.rightsStatus || args.rights
  return Boolean(args.execute === true && change && !RIGHTS_ENABLED)
}

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

function toolBatchRenameAssets(args = {}) {
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
      reason: 'VIS MCP file renames are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: true,
      preview: renameAssets(db, assetRefs, { ...args, allowedRoots: ALLOWED_ROOTS, execute: false }),
    }))
  }
  return withDb(db => renameAssets(db, assetRefs, {
    template: args.template || args.rename_template || args.renameTemplate || args.name_template || args.nameTemplate,
    query: args.query,
    tag: args.tag,
    category: args.category,
    mediaType: args.media_type || args.mediaType,
    mood: args.mood,
    color: args.color || args.color_family || args.colorFamily,
    start: args.start || args.start_index || args.startIndex,
    pad: args.pad || args.index_pad || args.indexPad,
    limit: args.limit,
    allowPartial: args.allow_partial === true || args.allowPartial === true,
    allowedRoots: ALLOWED_ROOTS,
    actor: 'vis-mcp',
    execute: args.execute === true && WRITE_ENABLED,
  }))
}

function toolReviewAssets(args = {}) {
  if (rightsChangeBlocked(args)) return { blocked: true, dryRun: true, reason: RIGHTS_OFF }
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

function toolRecordCurationFeedback(args = {}) {
  const assetRef = args.asset_id || args.assetId || args.uri || args.path || args.asset
  if (!assetRef) throw new Error('Missing asset_id, uri, or path')

  const action = args.action || (args.rating ? 'rate' : 'curate')
  const rating = args.rating !== undefined && args.rating !== null ? Number(args.rating) : null
  const defects = Array.isArray(args.defects)
    ? args.defects
    : (args.defects ? String(args.defects).split(',').map(s => s.trim()).filter(Boolean) : [])
  const notes = args.notes || args.note || null
  const brand = args.brand || 'estate'
  const scope = args.scope || 'asset'
  const actor = args.actor || 'vis-mcp'

  if (args.execute === true && !WRITE_ENABLED) {
    return withDb(db => {
      const asset = getAsset(db, assetRef)
      return {
        blocked: true,
        reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
        dryRun: {
          asset_id: asset?.asset_id || assetRef,
          action,
          rating,
          defects,
          notes,
          brand,
          scope,
          actor,
        },
      }
    })
  }

  return withDb(db => {
    if (args.execute !== true) {
      const asset = getAsset(db, assetRef)
      return {
        dryRun: true,
        preview: {
          asset_id: asset?.asset_id || assetRef,
          action,
          rating,
          defects,
          notes,
          brand,
          scope,
          actor,
          would_drain_to: tasteLedgerPath({ config: CONFIG }),
        },
      }
    }
    return recordCurationFeedback(db, {
      assetId: assetRef,
      action,
      rating,
      defects,
      notes,
      brand,
      scope,
      actor,
    })
  })
}

function toolUndoCurationFeedback(args = {}) {
  const assetRef = args.asset_id || args.assetId || args.uri || args.path || args.asset
  if (!assetRef) throw new Error('Missing asset_id, uri, or path')

  if (args.execute === true && !WRITE_ENABLED) {
    return withDb(db => ({
      blocked: true,
      reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: { asset_id: assetRef, action: 'undo' },
    }))
  }

  return withDb(db => {
    if (args.execute !== true) {
      return {
        dryRun: true,
        preview: { asset_id: assetRef, would_undo: true },
      }
    }
    return undoCurationFeedback(db, assetRef)
  })
}

function toolDrainFeedbackOutbox(args = {}) {
  if (args.execute === true && !WRITE_ENABLED) {
    return withDb(db => ({
      blocked: true,
      reason: 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.',
      dryRun: { would_drain: true },
    }))
  }
  return withDb(db => drainFeedbackOutbox(db, { config: CONFIG }))
}

function toolGetTasteDirectives(args = {}) {
  return withDb(db => getTasteDirectives(db, {
    brand: args.brand,
    category: args.category,
    polarity: args.polarity,
    limit: args.limit || 50,
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
  if (rightsChangeBlocked(args)) {
    return withDb(db => ({
      blocked: true,
      reason: RIGHTS_OFF,
      dryRun: runAssetActionRecipe(db, { ...args, assetRefs, execute: false }),
    }))
  }
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

function toolListDerivativePresets() {
  return listDerivativePresets()
}

function toolPlanAssetDerivatives(args = {}) {
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
  return withDb(db => planAssetDerivatives(db, assetRefs, {
    ...args,
    preset: args.preset || args.target || args.intent,
    mediaType: args.media_type || args.mediaType,
    color: args.color || args.color_family || args.colorFamily,
    outputRoot: args.output_root || args.outputRoot || args.target_root || args.targetRoot || args.derivatives_root || args.derivativesRoot,
    intendedUse: args.intended_use || args.intendedUse,
    poolLimit: args.pool_limit || args.poolLimit,
    execute: args.execute === true,
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
  if (args.execute === true && !PUBLISH_ENABLED) {
    return withDb(db => ({
      blocked: true,
      reason: 'Publication records need a person. Restart this MCP server with VIS_ENABLE_PUBLISH=1 for that session.',
      dryRun: recordPublication(db, { ...args, assetId: args.asset_id || args.assetId || args.uri || args.path, execute: false }),
    }))
  }
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

function toolPlanStorageUpload(args = {}) {
  return withDb(db => planStorageUpload(db, {
    target: args.target || 'auto',
    brand: args.brand,
    bucket: args.bucket,
    collection: args.collection,
    approvalStatus: args.approval_status || args.approvalStatus,
    rightsStatus: args.rights_status || args.rightsStatus,
    category: args.category,
    mediaType: args.media_type || args.mediaType,
    limit: args.limit || 50,
  }))
}

function toolRouteAssetDestination(args = {}) {
  return withDb(db => {
    const asset = getAsset(db, args.asset_id || args.assetId || args.uri || args.path)
    if (!asset) throw new Error('Asset not found')
    return routeAssetDestination(asset)
  })
}

function toolGetStorageStatus(args = {}) {
  return withDb(db => getStorageStats(db))
}

function toolScanGdriveVault(args = {}) {
  const vaultRoot = args.vault_root || args.vaultRoot || args.path || CONFIG.creativeVaultRoot
  if (!vaultRoot) throw new Error('Missing vault_root or path')
  const resolved = path.isAbsolute(vaultRoot) ? path.resolve(vaultRoot) : path.resolve(ROOT, vaultRoot)
  if (!isAllowedPath(resolved)) {
    throw new Error('Vault root is outside the VIS allowlist. Configure allowedRoots in vis.config.json or set VIS_ALLOWED_ROOTS.')
  }
  return redactOutsideAllowlist(scanDriveVaultMirror(resolved, {
    limit: args.limit || 500,
  }))
}

function toolBuildArtifactsCurationPacket(args = {}) {
  return withDb(db => planArtifactsCurationPacket(db, {
    accountId: args.account_id || args.accountId,
    brand: args.brand,
    namespace: args.namespace,
    repo: args.repo,
    branch: args.branch || 'main',
    collection: args.collection,
    category: args.category,
    mediaType: args.media_type || args.mediaType,
    limit: args.limit || 50,
    dryRunPreview: args.dry_run_preview === true || args.dryRunPreview === true,
  }))
}

function toolReport() {
  return withDb(db => getSummary(db))
}

function withLibraryDb(fn) {
  const db = openLibraryDatabase(ROOT, CONFIG)
  try {
    return redactOutsideAllowlist(fn(db))
  } finally {
    db.close()
  }
}

const WRITES_OFF = 'VIS MCP writes are disabled. Restart this MCP server with VIS_ENABLE_WRITES=1 after human approval.'

function toolLibrarySearch(args = {}) {
  return withLibraryDb(db => listLibrary(db, {
    query: args.query, rights: args.rights, sort: args.sort, root: args.root,
    minRating: args.min_rating, limit: args.limit || 50, offset: args.offset || 0,
  }))
}

function toolLibraryGetAsset(args = {}) {
  return withLibraryDb(db => getLibraryAsset(db, args.asset_id || args.assetId || args.uri || args.path))
}

async function toolLibraryFindPlacements(args = {}) {
  const { listPlacements } = await import('../core/vis-placements.mjs')
  return withLibraryDb(db => listPlacements(db, {
    assetId: args.asset_id || args.assetId, sha256: args.sha256, url: args.url, site: args.site, status: args.status, limit: args.limit || 100,
  }))
}

function toolLibraryListProposals(args = {}) {
  return withLibraryDb(db => ({ proposals: listProposals(db, { status: args.status || 'open', limit: args.limit || 100 }), stats: proposalStats(db) }))
}

async function toolLibraryIngest(args = {}) {
  const execute = args.execute === true && WRITE_ENABLED
  const result = await ingestLibrary({ root: ROOT, limit: args.limit, execute })
  return redactOutsideAllowlist(args.execute === true && !WRITE_ENABLED ? { blocked: true, reason: WRITES_OFF, ...result } : result)
}

function toolLibraryPropose(args = {}) {
  const execute = args.execute === true && WRITE_ENABLED
  return withLibraryDb(db => {
    const result = proposeForAsset(db, {
      assetId: args.asset_id || args.assetId || args.uri || args.path,
      kind: args.kind,
      payload: { rating: args.rating, name: args.name, tags: args.tags, rights: args.rights },
      rule: args.rule || 'mcp',
      rationale: args.rationale,
      proposedBy: args.proposed_by || 'mcp-agent',
      execute,
    })
    return args.execute === true && !WRITE_ENABLED ? { blocked: true, reason: WRITES_OFF, ...result } : result
  })
}

function toolLibraryDecideProposal(args = {}) {
  const execute = args.execute === true && WRITE_ENABLED
  return withLibraryDb(db => {
    const result = decideProposal(db, {
      proposalId: args.proposal_id || args.proposalId,
      decision: args.decision,
      decidedBy: args.decided_by || 'mcp-agent',
      allowRights: RIGHTS_ENABLED,
      execute,
    })
    return args.execute === true && !WRITE_ENABLED ? { blocked: true, reason: WRITES_OFF, ...result } : result
  })
}

function toolListPlacementFrames() {
  return { frames: listPlacementFrames() }
}

function toolCompareAssetPlacements(args = {}) {
  return withLibraryDb(db => compareAssetPlacements(db, {
    frameId: args.frame_id || args.frame || args.brand || 'frankx-hero',
    assetIds: args.asset_ids || args.assets || [],
    repoName: args.repo || args.repo_name,
  }))
}

function resolveShaFromArgs(args = {}) {
  const directSha = args.sha256
  if (typeof directSha === 'string' && /^[a-f0-9]{64}$/.test(directSha)) {
    return { sha256: directSha, asset_id: args.asset_id || args.assetId || null }
  }
  const ref = args.asset_id || args.assetId || args.uri || args.path
  if (!ref) throw new Error('Provide sha256 or asset_id/uri/path')
  return withDb(db => {
    const asset = getAsset(db, ref)
    if (!asset) throw new Error(`Asset not found: ${ref}`)
    const sha = asset.sha256 || asset.source_hash || asset.versions?.[0]?.sha256
    if (!sha || !/^[a-f0-9]{64}$/.test(sha)) {
      throw new Error(`Asset ${asset.asset_id} has no valid 64-hex sha256`)
    }
    return { sha256: sha, asset_id: asset.asset_id }
  })
}

const TOOL_CATEGORY_MAP = {
  dam_capabilities: 'governance',
  dam_discover_tools: 'governance',
  dam_describe_tool: 'governance',
  'visual.identity.resolve': 'character',
  'visual.character.resolve': 'character',
  get_character_canon_brief: 'character',
  search_assets: 'search',
  get_asset: 'search',
  trace_asset: 'search',
  map_usage: 'search',
  find_duplicates: 'search',
  find_orphans: 'search',
  find_similar_assets: 'search',
  library_search: 'search',
  library_get_asset: 'search',
  library_find_placements: 'search',
  list_smart_collections: 'search',
  evaluate_smart_collection: 'search',
  list_saved_searches: 'search',
  save_search: 'search',
  list_transform_presets: 'transform',
  build_transform_url: 'transform',
  build_responsive_delivery: 'transform',
  list_derivative_presets: 'transform',
  plan_asset_derivatives: 'transform',
  plan_derivative_purge: 'transform',
  list_structured_metadata_schemas: 'metadata',
  validate_structured_metadata: 'metadata',
  annotate_asset: 'metadata',
  bulk_annotate_assets: 'metadata',
  batch_rename_assets: 'metadata',
  record_generation_provenance: 'metadata',
  list_upload_presets: 'storage',
  plan_r2_intake: 'storage',
  plan_storage_upload: 'storage',
  route_asset_destination: 'storage',
  get_storage_status: 'storage',
  plan_creative_vault: 'storage',
  init_creative_vault: 'storage',
  scan_gdrive_vault: 'storage',
  build_artifacts_curation_packet: 'storage',
  library_ingest: 'storage',
  import_eagle_library: 'storage',
  export_cloudinary_manifest: 'storage',
  export_nft_metadata_report: 'storage',
  review_assets: 'curation',
  score_asset: 'curation',
  score_collection: 'curation',
  create_curation_packet: 'curation',
  list_asset_action_recipes: 'curation',
  run_asset_action_recipe: 'curation',
  library_list_proposals: 'curation',
  library_propose: 'curation',
  library_decide_proposal: 'curation',
  list_placement_frames: 'curation',
  compare_asset_placements: 'curation',
  record_curation_feedback: 'curation',
  undo_curation_feedback: 'curation',
  drain_feedback_outbox: 'curation',
  get_taste_directives: 'curation',
  record_publication: 'governance',
  list_music_releases: 'curation',
  create_music_release_packet: 'curation',
}

const READ_ONLY_TOOL_NAMES = new Set([
  'dam_capabilities', 'dam_discover_tools', 'dam_describe_tool',
  'visual.identity.resolve', 'visual.character.resolve', 'library_search', 'library_get_asset', 'library_find_placements',
  'library_list_proposals', 'list_placement_frames', 'compare_asset_placements',
  'search_assets', 'get_asset', 'trace_asset', 'map_usage', 'find_duplicates', 'find_orphans',
  'find_similar_assets', 'score_asset', 'score_collection', 'create_curation_packet',
  'list_asset_action_recipes', 'list_derivative_presets', 'plan_asset_derivatives', 'plan_derivatives',
  'list_smart_collections', 'evaluate_smart_collection', 'get_smart_collection', 'list_saved_searches',
  'list_music_releases', 'create_music_release_packet', 'plan_creative_vault',
  'export_cloudinary_manifest', 'export_nft_metadata_report', 'plan_storage_upload',
  'route_asset_destination', 'get_storage_status', 'scan_gdrive_vault', 'build_artifacts_curation_packet',
  'get_taste_directives', 'list_transform_presets', 'build_transform_url', 'build_responsive_delivery',
  'list_structured_metadata_schemas', 'validate_structured_metadata', 'list_upload_presets',
  'plan_r2_intake', 'plan_derivative_purge', 'get_character_canon_brief',
  'vis_search', 'vis_report', 'vis_audit', 'vis_suggest', 'vis_intelligence',
])

const DYNAMIC_CORE_TOOL_NAMES = new Set([
  'dam_discover_tools',
  'dam_describe_tool',
  'dam_capabilities',
  'visual.identity.resolve',
  'search_assets',
  'get_asset',
  'build_transform_url',
  'build_responsive_delivery',
  'plan_r2_intake',
  'get_character_canon_brief',
  'validate_structured_metadata',
  'get_taste_directives',
])

function toolDamCapabilities() {
  return {
    server: 'vis-mcp',
    version: '2.1.0',
    mcpMode: MCP_MODE,
    totalTools: TOOLS.length,
    gates: {
      writesEnabled: WRITE_ENABLED,
      rightsEnabled: RIGHTS_ENABLED,
      publishEnabled: PUBLISH_ENABLED,
      signingConfigured: Boolean(process.env.VIS_MEDIA_SIGNING_KEY),
    },
    layers: {
      transforms: {
        presetCount: Object.keys(NAMED_TRANSFORMS).length,
        presets: Object.keys(NAMED_TRANSFORMS),
        limits: TRANSFORM_LIMITS,
      },
      structuredMetadata: {
        fieldCount: Object.keys(DEFAULT_METADATA_FIELDS).length,
        fields: Object.keys(DEFAULT_METADATA_FIELDS),
        ruleCount: DEFAULT_CONDITIONAL_RULES.length,
      },
      uploadPresets: {
        count: Object.keys(DEFAULT_UPLOAD_PRESETS).length,
        presets: Object.keys(DEFAULT_UPLOAD_PRESETS),
        rightsLock: 'unknown',
      },
      storage: {
        canonicalR2Bucket: 'starlight-media-private',
        immutablePrefixes: ['masters/', 'renditions/'],
        purgeablePrefixes: ['derived/', 'test/'],
      },
    },
  }
}

function toolDamDiscoverTools(args = {}) {
  const query = String(args.query || '').trim().toLowerCase()
  const category = String(args.category || 'all').trim().toLowerCase()
  const limit = Math.max(1, Math.min(100, Number(args.limit || 25)))
  const words = query.split(/\s+/).filter(Boolean)

  const matches = []
  for (const t of TOOLS) {
    const toolCat = TOOL_CATEGORY_MAP[t.name] || 'other'
    if (category !== 'all' && toolCat !== category) continue
    const hay = `${t.name} ${toolCat} ${t.description || ''}`.toLowerCase()
    if (words.length && !words.every(w => hay.includes(w))) continue
    matches.push({
      name: t.name,
      category: toolCat,
      readOnly: READ_ONLY_TOOL_NAMES.has(t.name),
      summary: String(t.description || '').slice(0, 180),
    })
  }

  return {
    mcpMode: MCP_MODE,
    totalCatalogTools: TOOLS.length,
    matchedCount: matches.length,
    tools: matches.slice(0, limit),
  }
}

function toolDamDescribeTool(args = {}) {
  const requested = [
    ...(Array.isArray(args.names) ? args.names : []),
    args.name,
  ].filter(Boolean)
  if (!requested.length) throw new Error('Provide name or names[]')

  const described = []
  const missing = []
  for (const name of requested.slice(0, 20)) {
    const found = TOOLS.find(t => t.name === name)
    if (!found) {
      missing.push(name)
      continue
    }
    described.push({
      name: found.name,
      category: TOOL_CATEGORY_MAP[found.name] || 'other',
      readOnly: READ_ONLY_TOOL_NAMES.has(found.name),
      requiresWriteGate: !READ_ONLY_TOOL_NAMES.has(found.name),
      description: found.description,
      inputSchema: found.inputSchema,
    })
  }

  return { tools: described, missing }
}

function toolListTransformPresets() {
  return {
    limits: TRANSFORM_LIMITS,
    presets: NAMED_TRANSFORMS,
  }
}

async function toolBuildTransformUrl(args = {}) {
  const { sha256, asset_id } = resolveShaFromArgs(args)
  const rawSpec = args.preset
    ? (args.spec ? `t_${args.preset},${args.spec}` : `t_${args.preset}`)
    : (args.spec || 't_preview')
  const parsed = parseTransformSpec(rawSpec)
  const negotiated = negotiateFormat(parsed.f, args.accept || 'image/webp,image/*')
  const specHash = await computeSpecHash(parsed.canonical, negotiated.format)
  const cacheKey = derivedKey(sha256, specHash, negotiated.ext)
  const workerBase = resolvePrivateWorkerBase(args.worker_base || args.workerBase || process.env.VIS_MEDIA_WORKER_BASE || null)
  const signingKey = args.signing_key || args.signingKey || process.env.VIS_MEDIA_SIGNING_KEY || null

  let url = workerBase ? `${workerBase}/t/${sha256}/${parsed.canonical}` : `/t/${sha256}/${parsed.canonical}`
  let signed = false
  let exp = null
  if (signingKey) {
    const res = await createSignedTransformUrl({
      workerBase,
      sha256,
      spec: parsed.canonical,
      signingKey,
      ttlSeconds: args.ttl_seconds || args.ttlSeconds || 3600,
    })
    url = res.url
    signed = true
    exp = res.exp
  }

  return {
    asset_id,
    sha256,
    canonical: parsed.canonical,
    parsed,
    negotiated,
    specHash,
    derivedKey: cacheKey,
    cloudflareImages: toCloudflareImageTransform(parsed, negotiated),
    signed,
    exp,
    url,
  }
}

async function toolBuildResponsiveDelivery(args = {}) {
  const { sha256, asset_id } = resolveShaFromArgs(args)
  const workerBase = resolvePrivateWorkerBase(args.worker_base || args.workerBase || process.env.VIS_MEDIA_WORKER_BASE || null)
  const signingKey = args.signing_key || args.signingKey || process.env.VIS_MEDIA_SIGNING_KEY || null
  const manifest = await buildResponsiveDeliveryManifest({
    sha256,
    workerBase,
    signingKey,
    preset: args.preset || null,
    baseSpec: args.base_spec || args.baseSpec || args.spec || null,
    widths: Array.isArray(args.widths) ? args.widths : undefined,
    formats: Array.isArray(args.formats) ? args.formats : undefined,
    sizes: args.sizes || '100vw',
    aspectRatio: args.aspect_ratio || args.aspectRatio || null,
    ttlSeconds: args.ttl_seconds || args.ttlSeconds || 3600,
  })
  return { asset_id, ...manifest }
}

function toolListStructuredMetadataSchemas() {
  return {
    fields: DEFAULT_METADATA_FIELDS,
    conditionalRules: DEFAULT_CONDITIONAL_RULES,
  }
}

function toolValidateStructuredMetadata(args = {}) {
  return validateStructuredMetadata(args.metadata || {}, {
    strict: args.strict === true,
  })
}

function toolListUploadPresets() {
  return {
    rightsLock: 'unknown',
    approvalLock: 'candidate',
    presets: DEFAULT_UPLOAD_PRESETS,
  }
}

function toolPlanR2Intake(args = {}) {
  return planContentAddressedR2Intake({
    preset: args.preset || 'brand_hero_intake',
    filename: args.filename || 'intake.png',
    mimeType: args.mime_type || args.mimeType || 'image/png',
    byteSize: Number(args.byte_size ?? args.byteSize ?? 0),
    sha256: args.sha256 || '',
    metadata: args.metadata || {},
    bucket: args.bucket || 'starlight-media-private',
    workerBase: args.worker_base || args.workerBase || process.env.VIS_MEDIA_WORKER_BASE || null,
  })
}

function toolPlanDerivativePurge(args = {}) {
  return planDerivativePurge({
    sha256: args.sha256 || null,
    derivatives: Array.isArray(args.derivatives) ? args.derivatives : [],
    specFilter: args.spec_filter || args.specFilter || null,
    reason: args.reason || 'cache-invalidation',
  })
}

function toolGetCharacterCanonBrief(args = {}) {
  const characterId = args.character_id || args.characterId || args.character
  if (!characterId) throw new Error('character_id is required')
  return withDb(db => {
    const assets = searchAssets(db, { maxResults: 500 })
    const taste = getTasteDirectives(db, { brand: args.brand || undefined, limit: 100 })
    const directives = Array.isArray(taste.entries)
      ? taste.entries
      : [...(taste.positive || []), ...(taste.negative || [])]
    return buildCharacterCanonBrief({
      characterId,
      brand: args.brand || null,
      assets,
      tasteDirectives: directives,
      identityReceipt: args.identity_receipt || args.identityReceipt || null,
    })
  })
}

// ---------------------------------------------------------------------------
// Catalog read tools. A read-only projection over the existing local index:
// declared library roots are the sources, asset_rendition holds thumbs and
// previews. No second index, no source enrollment, no account connection.

function catalogCoverageRows(db) {
  if (!tableExists(db, 'library_file_state')) return []
  return db.prepare(`
SELECT root_label AS source_id, COUNT(DISTINCT asset_id) AS asset_count, MAX(seen_at) AS indexed_at
FROM library_file_state
GROUP BY root_label
ORDER BY root_label`).all()
}

/** Core schema opens with every tool call; library tables only exist after a library run. */
function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

function toolGetAssetSources(args = {}) {
  validateCatalogInput('get_asset_sources', args)
  return withDb(db => {
    const indexed = new Map(catalogCoverageRows(db).map(row => [row.source_id, row]))
    const coverage = []
    if (!LIBRARY_SOURCES.length && !indexed.size) {
      coverage.push({
        source_id: 'local-library',
        kind: 'local-library',
        state: 'not_configured',
        indexed_at: null,
        asset_count: null,
        exhaustive: false,
      })
    }
    for (const source of LIBRARY_SOURCES) {
      const row = indexed.get(source.label)
      indexed.delete(source.label)
      coverage.push({
        source_id: source.label,
        kind: 'local-library',
        state: source.exists ? 'ready' : 'unavailable',
        indexed_at: row?.indexed_at || null,
        asset_count: source.exists ? (Number.isSafeInteger(row?.asset_count) ? row.asset_count : 0) : null,
        exhaustive: false,
      })
    }
    // Rows left over belong to roots that were enrolled once and are no longer declared.
    for (const row of indexed.values()) {
      coverage.push({
        source_id: row.source_id,
        kind: 'local-library',
        state: 'unavailable',
        indexed_at: row.indexed_at || null,
        asset_count: row.asset_count ?? null,
        exhaustive: false,
      })
    }
    return {
      workspace_id: 'local',
      retrieval: 'metadata',
      assets: [],
      coverage,
      complete: coverage.length > 0 && coverage.every(source => source.state === 'ready' && source.exhaustive === true),
      truncated: false,
      no_matches: false,
    }
  })
}

function toolGetAssetPreview(args = {}) {
  const input = validateCatalogInput('get_asset_preview', args)
  return withDb(db => {
    const { source_id: sourceId, asset_id: assetId, version_id: versionId } = input
    // The host owns the source list; a caller cannot name an arbitrary path or provider.
    const source = LIBRARY_SOURCES.find(item => item.label === sourceId)
      || catalogCoverageRows(db).find(row => row.source_id === sourceId)
    if (!source) throw new CatalogError('not_found', 404)
    const asset = db.prepare(`
SELECT asset_id, title, media_type, rights_status, approval_status, tags_json, last_seen_at
FROM asset WHERE asset_id = ?`).get(assetId)
    if (!asset) throw new CatalogError('not_found', 404)
    const inSource = tableExists(db, 'library_file_state')
      ? db.prepare('SELECT 1 FROM library_file_state WHERE asset_id = ? AND root_label = ? LIMIT 1').get(assetId, sourceId)
      : null
    if (!inSource) throw new CatalogError('not_found', 404)
    const version = db.prepare(`
SELECT version_id, sha256, media_type, width, height FROM asset_version WHERE version_id = ? AND asset_id = ?`).get(versionId, assetId)
    if (!version) throw new CatalogError('not_found', 404)
    // The local index records renditions per asset, not per version.
    const rendition = tableExists(db, 'asset_rendition')
      ? db.prepare(`
SELECT sha256, kind, mime_type, width, height, byte_size FROM asset_rendition
WHERE asset_id = ? AND storage = 'local' AND kind IN ('preview', 'thumb')
ORDER BY CASE kind WHEN 'preview' THEN 0 ELSE 1 END LIMIT 1`).get(assetId)
      : null
    const previewPath = rendition ? renditionPath(ROOT, db, assetId, rendition.kind) : null
    if (!rendition || !previewPath) throw new CatalogError('preview_unavailable', 404)
    const thumbhash = db.prepare("SELECT data_text FROM asset_rendition WHERE asset_id = ? AND kind = 'thumbhash' LIMIT 1").get(assetId)
    return {
      asset: projectCatalogAsset({
        asset_id: asset.asset_id,
        version_id: version.version_id,
        title: asset.title,
        media_type: version.media_type || asset.media_type,
        sha256: version.sha256,
        width: version.width,
        height: version.height,
        tags: parseJson(asset.tags_json, []),
        rights_status: asset.rights_status,
        approval_status: asset.approval_status,
        approval_scope: 'asset_record',
        last_seen_at: asset.last_seen_at,
        preview_available: true,
      }, sourceId),
      preview: {
        kind: rendition.kind,
        storage: 'local',
        mime_type: rendition.mime_type || 'image/webp',
        width: rendition.width,
        height: rendition.height,
        byte_size: rendition.byte_size,
        sha256: /^[0-9a-f]{64}$/.test(rendition.sha256 || '') ? rendition.sha256 : null,
        path: previewPath,
        thumbhash: thumbhash?.data_text || null,
        master_bytes: false,
      },
    }
  })
}

const TOOL_HANDLERS = {
  library_search: toolLibrarySearch,
  get_asset_sources: toolGetAssetSources,
  get_asset_preview: toolGetAssetPreview,
  library_get_asset: toolLibraryGetAsset,
  library_list_proposals: toolLibraryListProposals,
  library_find_placements: toolLibraryFindPlacements,
  library_ingest: toolLibraryIngest,
  library_propose: toolLibraryPropose,
  library_decide_proposal: toolLibraryDecideProposal,
  list_placement_frames: toolListPlacementFrames,
  compare_asset_placements: toolCompareAssetPlacements,
  'visual.identity.resolve': resolveVisualIdentity,
  'visual.character.resolve': resolveCharacter,
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
  batch_rename_assets: toolBatchRenameAssets,
  review_assets: toolReviewAssets,
  list_asset_action_recipes: toolListAssetActionRecipes,
  run_asset_action_recipe: toolRunAssetActionRecipe,
  run_action_recipe: toolRunAssetActionRecipe,
  list_derivative_presets: toolListDerivativePresets,
  plan_asset_derivatives: toolPlanAssetDerivatives,
  plan_derivatives: toolPlanAssetDerivatives,
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
  plan_storage_upload: toolPlanStorageUpload,
  route_asset_destination: toolRouteAssetDestination,
  get_storage_status: toolGetStorageStatus,
  scan_gdrive_vault: toolScanGdriveVault,
  build_artifacts_curation_packet: toolBuildArtifactsCurationPacket,
  record_curation_feedback: toolRecordCurationFeedback,
  undo_curation_feedback: toolUndoCurationFeedback,
  drain_feedback_outbox: toolDrainFeedbackOutbox,
  get_taste_directives: toolGetTasteDirectives,
  dam_capabilities: toolDamCapabilities,
  dam_discover_tools: toolDamDiscoverTools,
  dam_describe_tool: toolDamDescribeTool,
  list_transform_presets: toolListTransformPresets,
  build_transform_url: toolBuildTransformUrl,
  build_responsive_delivery: toolBuildResponsiveDelivery,
  list_structured_metadata_schemas: toolListStructuredMetadataSchemas,
  validate_structured_metadata: toolValidateStructuredMetadata,
  list_upload_presets: toolListUploadPresets,
  plan_r2_intake: toolPlanR2Intake,
  plan_derivative_purge: toolPlanDerivativePurge,
  get_character_canon_brief: toolGetCharacterCanonBrief,

  // Backward-compatible legacy VIS tools.
  vis_search: toolSearchAssets,
  vis_report: toolReport,
  vis_audit: toolReport,
  vis_suggest: args => toolSearchAssets({ query: args.context, mood: args.mood, maxResults: 3 }),
  vis_intelligence: toolReport,
}

const TOOLS = [
  { name: 'visual.character.resolve', description: 'Resolve a character name or alias to an immutable identity ID with sha256 editions, positive references, rejected lineages, source locators, and missing or conflicting references. Rights and approval are always unknown or pending. Read only.', inputSchema: characterSchema },
  { name: 'visual.identity.resolve', description: 'Resolve the exact owned master for a named use and channel. Unresolved blocks the workflow. Read only.', inputSchema: identitySchema },
  tool('library_search', 'Search the watched library (declared roots only). Returns hash, rights, rank, ThumbHash, location count, and open proposals. Read-only.', {
    query: stringProp('Match title, path, or tag'),
    rights: stringProp('unknown, needs-review, owned, generated-owned, licensed, blocked'),
    root: stringProp('Library root label, for example brand-assets or inbox'),
    sort: stringProp('newest (default) or rank'),
    min_rating: numberProp('Minimum rank 0-5'),
    limit: numberProp('Page size, default 50'),
    offset: numberProp('Page offset'),
  }),
  tool('library_get_asset', 'One library asset: renditions, every file location, proposals, recent events, and the publish gate. Read-only. Never returns master bytes.', {
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local path'),
  }),
  tool('library_find_placements', 'Where an asset is live (site, URL, repo path, commit), or what is live at a URL. Read from each site\'s deploy ref by `vis library observe`. Read-only.', {
    asset_id: stringProp('VIS asset_id'),
    sha256: stringProp('Content hash'),
    url: stringProp('Exact public URL'),
    site: stringProp('Site label, for example frankx.ai'),
    status: stringProp('live (default), gone, or all'),
    limit: numberProp('Result limit'),
  }),
  tool('library_list_proposals', 'Open (or all) proposals plus accept/dismiss history per rule. Read-only.', {
    status: stringProp('open (default), accepted, dismissed, or all'),
    limit: numberProp('Result limit'),
  }),
  tool('library_ingest', 'Plan, or with execute:true and VIS_ENABLE_WRITES=1, file new files under the declared library roots: hash, thumb, preview, ThumbHash, rights unknown. Never uploads or deletes.', {
    limit: numberProp('Maximum files this run, default from config (50)'),
    execute: booleanProp('File the planned items when VIS_ENABLE_WRITES=1'),
  }),
  tool('library_propose', 'Propose rank, set, tags, or rights for an asset. A proposal changes nothing until a person accepts it. Needs VIS_ENABLE_WRITES=1 and execute:true to persist.', {
    asset_id: stringProp('VIS asset_id'),
    kind: stringProp('rank, set, tags, or rights'),
    rating: numberProp('For rank: 0-5'),
    name: stringProp('For set: set name'),
    tags: { type: 'array', items: { type: 'string' }, description: 'For tags' },
    rights: stringProp('For rights: owned, generated-owned, licensed, needs-review, blocked'),
    rule: stringProp('Name of the rule that produced this proposal; used to learn from dismissals'),
    rationale: stringProp('One line: why'),
    execute: booleanProp('Persist when VIS_ENABLE_WRITES=1'),
  }),
  tool('library_decide_proposal', 'Accept or dismiss a proposal. Accept applies rank, set, or tags and never publishes. Accepting a rights proposal also needs VIS_ENABLE_RIGHTS=1.', {
    proposal_id: stringProp('Proposal id'),
    decision: stringProp('accepted or dismissed'),
    execute: booleanProp('Persist when VIS_ENABLE_WRITES=1'),
  }),
  // Catalog contract tools. Schema, required fields and read-only annotations come
  // from core/vis-catalog-access.mjs so this server cannot drift from the rollout doc.
  catalogTool('get_asset_sources', 'Inspect this workspace catalog coverage and index timestamps. Call this first. The local index is a projection over declared library roots, not a second index. Declared sources are reported as not_configured or unavailable instead of being silently skipped. Does not connect accounts or scan files. Read-only.'),
  catalogTool('get_asset_preview', 'Load one existing thumbnail or preview rendition for an exact asset version from this workspace source. An absent rendition is reported as preview_unavailable. Does not generate, upload, approve, publish, or serve original masters. Read-only.'),
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
  tool('batch_rename_assets', 'Dry-run or execute same-folder file renames from a template. File writes require VIS_ENABLE_WRITES=1 and execute:true.', {
    asset_ids: { type: 'array', items: { type: 'string' }, description: 'VIS asset_ids' },
    assets: { type: 'array', items: { type: 'string' }, description: 'Asset ids, visual URIs, or paths' },
    uris: { type: 'array', items: { type: 'string' }, description: 'visual://asset/{asset_id} URIs' },
    paths: { type: 'array', items: { type: 'string' }, description: 'Local or relative paths' },
    query: stringProp('Optional search query when asset ids are not provided'),
    tag: stringProp('Optional tag filter when selecting assets by query'),
    category: stringProp('Optional category filter'),
    media_type: stringProp('Optional image, video, or audio filter'),
    color: stringProp('Optional color family or hex filter'),
    template: stringProp('Rename template, for example {category}-{index}-{title}'),
    start: numberProp('Starting index, default 1'),
    pad: numberProp('Index zero-padding width, default 2'),
    limit: numberProp('Maximum selected assets when using query/filter selection'),
    allow_partial: booleanProp('Allow execute to skip blocked items instead of refusing the whole batch'),
    execute: booleanProp('Rename files when VIS_ENABLE_WRITES=1'),
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
  tool('list_derivative_presets', 'List dry-run derivative/export presets for website, social, music release, NFT/Web3, and Cloudinary delivery.', {}),
  tool('plan_asset_derivatives', 'Create a read-only derivative/export manifest for selected assets. No files are transformed, uploaded, posted, minted, or deleted.', {
    preset: stringProp('website, social, music-release, nft, or cloudinary'),
    target: stringProp('Alias for preset, for example web, music, canvas, ipfs, or dam'),
    intent: stringProp('Alias for preset when an agent frames the desired use'),
    asset_ids: { type: 'array', items: { type: 'string' }, description: 'Optional explicit VIS asset_ids' },
    assets: { type: 'array', items: { type: 'string' }, description: 'Asset ids, visual URIs, or paths' },
    uris: { type: 'array', items: { type: 'string' }, description: 'visual://asset/{asset_id} URIs' },
    paths: { type: 'array', items: { type: 'string' }, description: 'Local or relative paths' },
    query: stringProp('Optional query when asset ids are not provided'),
    tag: stringProp('Optional tag filter when selecting assets by query'),
    category: stringProp('Optional category filter'),
    media_type: stringProp('Optional image, video, or audio filter'),
    mood: stringProp('Optional mood filter'),
    color: stringProp('Optional color family or hex filter'),
    output_root: stringProp('Optional root for suggested derivative targets'),
    intended_use: stringProp('Override intended public/private use description'),
    limit: numberProp('Maximum selected assets'),
    pool_limit: numberProp('Maximum asset pool to inspect'),
    execute: booleanProp('Ignored by the planner; returned manifest remains dry-run'),
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
  tool('plan_storage_upload', 'Create a dry-run upload plan to Vercel Blob, Cloudflare R2, or IPFS.', {
    target: stringProp('Upload target: vercel-blob, cloudflare-r2, ipfs, or auto'),
    brand: stringProp('Brand filter: frankx, arcanea, starlight, music, animelegends'),
    bucket: stringProp('Cloudflare R2 bucket: media-masters, public-cdn, music-releases'),
    collection: stringProp('Collection name or ID filter'),
    approval_status: stringProp('Approval status filter (e.g. approved, candidate)'),
    rights_status: stringProp('Rights status filter (e.g. generated-owned, owned)'),
    limit: numberProp('Maximum assets to plan'),
  }),
  tool('route_asset_destination', 'Determine optimal multi-cloud storage destination(s) for an asset based on brand and role.', {
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative path'),
  }),
  tool('get_storage_status', 'Get multi-cloud storage sync status and breakdown across Vercel Blob, Cloudflare R2, and IPFS.', {}),
  tool('scan_gdrive_vault', 'Read-only scan of a Google Drive Creative Vault mirror folder. Discovers candidate assets with rights_status: unknown and emits reviewable proposals without mutating files or rights.', {
    vault_root: stringProp('Relative or allowlisted path to the Creative Vault mirror directory'),
    limit: numberProp('Maximum files to scan (default 500)'),
  }),
  tool('build_artifacts_curation_packet', 'Build a deterministic Cloudflare Artifacts Git curation packet and zero-credential push plan for Starlight, Arcanea, or GenCreator.', {
    brand: stringProp('Brand name or alias (e.g. starlight, arcanea, gencreator, frankx)'),
    namespace: stringProp('Explicit Cloudflare Artifacts namespace override (Starlight, Arcanea, GenCreator)'),
    repo: stringProp('Target repository slug inside the namespace'),
    branch: stringProp('Target Git branch (default main)'),
    collection: stringProp('Optional collection filter'),
    category: stringProp('Optional category filter'),
    media_type: stringProp('Optional media type filter'),
    limit: numberProp('Maximum assets to include (default 50)'),
    dry_run_preview: booleanProp('Include unapproved assets in the refused breakdown for inspection while keeping them out of the packet'),
  }),
  tool('list_placement_frames', 'List canonical multi-brand placement frames (FrankX Hero, Arcanea Lore Card, GenCreator Product Box, Starlight OG Social, Music IS Cover) for the Placement Comparison Studio.', {}),
  tool('compare_asset_placements', 'Evaluate and rank 1-6 candidate visual assets inside a brand placement frame with fit scores, mobile safe-crop diagnostics, publish-gate blockers, and Cloudflare Artifacts handoff commands. Read-only.', {
    frame: stringProp('Placement frame id or brand: frankx-hero, arcanea-lore-card, gencreator-product-box, starlight-og-social, or music-is-canvas-cover'),
    asset_ids: { type: 'array', items: { type: 'string' }, description: 'Candidate VIS asset_ids, visual URIs, or paths' },
    repo: stringProp('Optional target Cloudflare Artifacts repository slug override'),
  }),
  tool('record_curation_feedback', 'Record human curation feedback, rating (1-5), defect tags, and approve/reject decision with atomic ledger synchronization. Writes require VIS_ENABLE_WRITES=1 and execute:true.', {
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative path'),
    action: stringProp('approve, reject, rate, or curate'),
    rating: numberProp('Rating 1-5'),
    defects: { type: 'array', items: { type: 'string' }, description: 'Defect tags, e.g. ["plastic-skin", "blurry", "hallucinated-text"]' },
    notes: stringProp('Curation feedback note or directive'),
    brand: stringProp('Brand namespace, e.g. frankx, arcanea, starlight, estate'),
    scope: stringProp('asset, brand, cross_brand, or foundation'),
    execute: booleanProp('Persist curation and drain to taste ledger when VIS_ENABLE_WRITES=1'),
  }),
  tool('undo_curation_feedback', 'Revert the most recent curation feedback action on an asset. Writes require VIS_ENABLE_WRITES=1 and execute:true.', {
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative path'),
    execute: booleanProp('Revert curation when VIS_ENABLE_WRITES=1'),
  }),
  tool('drain_feedback_outbox', 'Drain pending curation feedback events to the taste ledger (vis.config.json tasteLedgerPath, or VIS_TASTE_LEDGER).', {
    execute: booleanProp('Drain outbox when VIS_ENABLE_WRITES=1'),
  }),
  tool('get_taste_directives', 'Retrieve active taste doctrines, approved visual patterns, and defect tags to avoid before generating visuals.', {
    brand: stringProp('Optional brand filter, e.g. frankx, arcanea, estate'),
    category: stringProp('Optional category filter, e.g. visual, typography, copy'),
    polarity: stringProp('Optional polarity filter: positive, negative, or neutral'),
    limit: numberProp('Maximum doctrines to retrieve (default 50)'),
  }),
  tool('dam_capabilities', 'Inspect live VIS DAM capability matrix across edge transforms, structured metadata, upload presets, governance gates, and R2/Supabase layers. Read-only.', {}),
  tool('dam_discover_tools', 'Progressive tool discovery: filter VIS DAM tools by category or keyword without inflating LLM context. Read-only.', {
    query: stringProp('Optional keyword search across tool names and descriptions'),
    category: stringProp('search, transform, metadata, character, storage, curation, governance, or all'),
    limit: numberProp('Maximum matching tools (default 25)'),
  }),
  tool('dam_describe_tool', 'Return full JSON inputSchema and gate requirements for one or more VIS DAM tools discovered via dam_discover_tools. Read-only.', {
    name: stringProp('Single tool name to inspect'),
    names: { type: 'array', items: { type: 'string' }, description: 'Multiple tool names to inspect (max 20)' },
  }),
  tool('list_transform_presets', 'List all 12 Cloudinary-parity edge transformation presets and DoS safety limits. Read-only.', {}),
  tool('build_transform_url', 'Parse/validate a Cloudinary-style transform spec, compute Cloudflare Images options and derived R2 cache key, and sign the URL when VIS_MEDIA_SIGNING_KEY is present. Read-only.', {
    sha256: stringProp('64-hex asset sha256 (optional if asset_id/uri/path is provided)'),
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative asset path'),
    preset: stringProp('Optional named transform preset, e.g. hero_desktop, og_card, lore_card'),
    spec: stringProp('Cloudinary-style transform spec, e.g. c_fill,w_1200,h_630,g_auto,q_auto,f_auto'),
    accept: stringProp('Optional HTTP Accept header for f_auto negotiation (default image/webp,image/*)'),
    worker_base: stringProp('Optional custom HTTPS vis-media origin (rejects workers.dev / r2.dev)'),
    ttl_seconds: numberProp('Signed URL TTL in seconds (default 3600)'),
  }),
  tool('build_responsive_delivery', 'Generate a multi-format AVIF/WebP/JPEG responsive <picture> and srcset delivery manifest for a VIS asset. Read-only.', {
    sha256: stringProp('64-hex asset sha256 (optional if asset_id/uri/path is provided)'),
    asset_id: stringProp('VIS asset_id'),
    uri: stringProp('visual://asset/{asset_id}'),
    path: stringProp('Local or relative asset path'),
    preset: stringProp('Optional named preset'),
    spec: stringProp('Optional base transform spec'),
    widths: { type: 'array', items: { type: 'number' }, description: 'Responsive widths (default [480,768,1200,1600])' },
    formats: { type: 'array', items: { type: 'string' }, description: 'Output formats (default ["avif","webp","jpeg"])' },
    sizes: stringProp('CSS sizes attribute (default 100vw)'),
    aspect_ratio: stringProp('Optional aspect ratio like 16:9 or 4:5'),
    worker_base: stringProp('Optional custom HTTPS vis-media origin'),
    ttl_seconds: numberProp('Signed URL TTL in seconds'),
  }),
  tool('list_structured_metadata_schemas', 'List typed VIS structured metadata fields and conditional brand/character validation rules. Read-only.', {}),
  tool('validate_structured_metadata', 'Validate and normalize structured asset metadata against typed schemas and conditional rules before upload or DB save. Read-only.', {
    metadata: { type: 'object', description: 'Key/value metadata payload to validate' },
    strict: booleanProp('Reject unknown fields when true'),
  }),
  tool('list_upload_presets', 'List VIS R2 upload presets. Every preset hard-locks rights_default="unknown" and approval_default="candidate" per Issue #41. Read-only.', {}),
  tool('plan_r2_intake', 'Dry-run content-addressed Cloudflare R2 upload planner for an intake file and metadata payload. Never uploads bytes or sets rights. Read-only.', {
    preset: stringProp('brand_hero_intake, character_canon_intake, social_derivative_intake, music_cover_intake, or raw_master_archive'),
    filename: stringProp('Candidate file name'),
    mime_type: stringProp('Candidate MIME type'),
    byte_size: numberProp('Candidate byte size'),
    sha256: stringProp('64-hex SHA-256 checksum'),
    metadata: { type: 'object', description: 'Structured metadata for preset validation' },
    bucket: stringProp('Target private R2 bucket (default starlight-media-private)'),
    worker_base: stringProp('Optional custom HTTPS vis-media origin'),
  }),
  tool('plan_derivative_purge', 'Plan safe cache invalidation of derived/ R2 objects while strictly blocking DELETE on immutable masters/ and renditions/. Read-only dry-run.', {
    sha256: stringProp('Optional 64-hex parent sha256 scope'),
    derivatives: { type: 'array', items: { type: 'string' }, description: 'Candidate R2 keys or derivative objects to evaluate' },
    spec_filter: stringProp('Optional transform spec filter'),
    reason: stringProp('Purge rationale'),
  }),
  tool('get_character_canon_brief', 'Build an agent-ready Character Canon & Negative-Taste briefing combining approved masters, rejected drift examples, and estate taste doctrines. Ready only with a resolved identity receipt. Read-only.', {
    character_id: stringProp('Character identifier slug'),
    brand: stringProp('Optional brand scope (e.g. arcanea, frankx, starlight)'),
    identity_receipt: { type: 'object', description: 'Optional resolved visual.identity.resolve receipt' },
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
          uri: 'visual://dam/capabilities',
          name: 'VIS DAM Capabilities',
          description: 'Live DAM capability matrix, gates, presets, and storage boundaries.',
          mimeType: 'application/json',
        },
        {
          uri: 'visual://transform/presets',
          name: 'VIS Transform Presets',
          description: 'Cloudinary-parity named transformation presets and DoS limits.',
          mimeType: 'application/json',
        },
        {
          uri: 'visual://dam/metadata-schemas',
          name: 'VIS Structured Metadata Schemas',
          description: 'Typed structured metadata fields and conditional validation rules.',
          mimeType: 'application/json',
        },
        {
          uri: 'visual://dam/upload-presets',
          name: 'VIS Upload Presets',
          description: 'Content-addressed R2 upload presets locked to rights=unknown.',
          mimeType: 'application/json',
        },
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
  if (uri === 'visual://dam/capabilities') return resourceContents(uri, toolDamCapabilities())
  if (uri === 'visual://transform/presets') return resourceContents(uri, toolListTransformPresets())
  if (uri === 'visual://dam/metadata-schemas') return resourceContents(uri, toolListStructuredMetadataSchemas())
  if (uri === 'visual://dam/upload-presets') return resourceContents(uri, toolListUploadPresets())
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

/** Contract tools reuse the exact schema and read-only annotations from catalogTools. */
function catalogTool(name, description) {
  const defined = catalogTools.find(entry => entry.name === name)
  if (!defined) throw new Error(`Unknown catalog tool: ${name}`)
  return { ...defined, description }
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
  return READABLE_ROOTS.some(root => normalized === root || normalized.startsWith(root + path.sep))
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
rl.on('line', async (line) => {
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
        serverInfo: { name: 'vis-mcp', version: '2.1.0', root: ROOT, mcpMode: MCP_MODE, readOnlyDefault: !WRITE_ENABLED, rightsEnabled: RIGHTS_ENABLED, publishEnabled: PUBLISH_ENABLED },
      })
      return
    }
    if (method === 'notifications/initialized') return
    if (method === 'tools/list') {
      const visibleTools = MCP_MODE === 'dynamic'
        ? TOOLS.filter(t => DYNAMIC_CORE_TOOL_NAMES.has(t.name))
        : TOOLS
      send(id, { tools: visibleTools })
      return
    }
    if (method === 'tools/call') {
      const { name, arguments: toolArgs } = params || {}
      const handler = TOOL_HANDLERS[name]
      if (!handler) {
        send(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true })
        return
      }
      const result = await handler(toolArgs || {})
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
