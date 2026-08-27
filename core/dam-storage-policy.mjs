import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const SAFE_RIGHTS = new Set(['owned', 'generated-owned', 'licensed'])
const SYNCED_STORAGE_STATUSES = new Set(['uploaded', 'synced', 'ready', 'active'])

export function loadDamStoragePolicy(policyPath) {
  if (!policyPath) throw new Error('A DAM storage policy path is required')
  let policy
  try {
    policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'))
  } catch (error) {
    throw new Error(`Invalid DAM storage policy at ${policyPath}: ${error.message}`)
  }
  validateDamStoragePolicy(policy)
  verifyProviderEvidence(policy, policyPath)
  return policy
}

export function validateDamStoragePolicy(policy) {
  const required = ['policyVersion', 'providers', 'thresholds', 'rights', 'approval', 'brands', 'applications']
  for (const key of required) {
    if (policy?.[key] === undefined) throw new Error(`DAM storage policy is missing ${key}`)
  }
  for (const provider of ['r2Originals', 'r2Renditions', 'r2Workflow', 'vercelBlob', 'googleDrive', 'github']) {
    if (!policy.providers[provider]) throw new Error(`DAM storage policy is missing provider ${provider}`)
  }
  if (policy.region !== 'EU') throw new Error('The Starlight DAM policy requires EU data jurisdiction')
  if (policy.storageClass !== 'Standard') throw new Error('The Starlight DAM policy requires R2 Standard storage class')
  if (policy.providers.r2Renditions.r2DevAllowed !== false) {
    throw new Error('Production R2 delivery must not allow r2.dev')
  }
  if (policy.providers.r2Originals.publicAccess !== false || policy.providers.r2Workflow.publicAccess !== false) {
    throw new Error('Originals and workflow buckets must remain private')
  }
  return policy
}

export function sanitizeKeySegment(value, fallback = 'unclassified') {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .toLowerCase()
  return normalized || fallback
}

export function inferDamBrand(asset, policy) {
  const haystack = buildBrandHaystack(asset)
  for (const brand of policy.brands || []) {
    if ((brand.patterns || []).some(pattern => matchesBrandPattern(haystack, pattern))) return brand.key
  }
  return 'unclassified'
}

function verifyProviderEvidence(policy, policyPath) {
  if (!policy.providerEvidence) throw new Error('DAM storage policy is missing providerEvidence')
  const evidencePath = path.resolve(path.dirname(policyPath), policy.providerEvidence)
  let evidence
  try {
    evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
  } catch (error) {
    throw new Error(`Invalid R2 provider evidence at ${evidencePath}: ${error.message}`)
  }
  const observed = new Map((evidence.buckets || []).map(bucket => [bucket.name, bucket]))
  for (const providerKey of ['r2Originals', 'r2Renditions', 'r2Workflow']) {
    const configured = policy.providers[providerKey]
    const bucket = observed.get(configured.bucket)
    if (!bucket) throw new Error(`Provider evidence is missing bucket ${configured.bucket}`)
    if (bucket.jurisdictionLabel !== policy.region) throw new Error(`Provider evidence jurisdiction mismatch for ${configured.bucket}`)
    if (bucket.defaultStorageClass !== policy.storageClass) throw new Error(`Provider evidence storage-class mismatch for ${configured.bucket}`)
    if (bucket.publicAccess !== 'Disabled') throw new Error(`Provider evidence shows public access for ${configured.bucket}`)
  }
}

function matchesBrandPattern(haystack, value) {
  const pattern = String(value || '').trim().toLowerCase()
  if (!pattern) return false
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s._-]+')
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(haystack)
}

export function inferDamRole(asset) {
  const text = buildAssetHaystack(asset)
  const rules = [
    ['wordmark', /word[ -]?mark/],
    ['favicon', /favicon|apple-touch-icon|android-chrome/],
    ['open-graph', /open[ -]?graph|\bog\b|social-card/],
    ['thumbnail', /thumb|thumbnail|poster-frame/],
    ['mascot', /mascot|avatar|guardian|godbeast|axi/],
    ['hero', /\bhero\b|masthead/],
    ['logo', /\blogo\b|brandmark|logomark/],
    ['icon', /\bicon\b|app-icon/],
    ['social', /social|instagram|linkedin|twitter|x-post|reel|story/],
    ['cover', /\bcover\b|book-jacket|album-art/],
    ['proof', /\bproof\b|testimonial|case-study|customer|partner/],
    ['product', /product|template|course/],
    ['editorial', /blog|article|editorial|newsletter/],
  ]
  for (const [role, pattern] of rules) if (pattern.test(text)) return role
  if (asset.media_type === 'video') return 'video'
  if (asset.media_type === 'audio') return 'audio'
  if (/original|master|source|raw/.test(text)) return 'source'
  return 'other'
}

export function classifyDamSource(asset, policy) {
  const text = buildAssetHaystack(asset)
  const sourceClasses = policy.sourceClasses || {}
  for (const [sourceClass, markers] of Object.entries(sourceClasses)) {
    if ((markers || []).some(marker => text.includes(String(marker).toLowerCase()))) return sourceClass
  }
  if (/(^|[\\/])(private|\.tmp|experiments|chrome-profile)([\\/]|$)/i.test(asset.relative_path || asset.absolute_path || '')) return 'private-local'
  if (asset.repo && /(^|[\\/])public([\\/]|$)/i.test(asset.relative_path || asset.absolute_path || '')) return 'github-static'
  if (asset.storage_kind === 'drive' || /google drive|starlight creative vault/.test(text)) return 'drive'
  if (asset.storage_kind === 'onedrive' || /onedrive/.test(text)) return 'onedrive'
  return 'local'
}

export function inferDamApplications(asset, policy) {
  const haystack = [asset.repo, asset.usage_sources, asset.root, asset.relative_path]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return (policy.applications || [])
    .filter(application => (application.patterns || []).some(pattern => haystack.includes(String(pattern).toLowerCase())))
}

function inferSourceApplications(asset, policy) {
  const haystack = [asset.repo, asset.relative_path].filter(Boolean).join(' ').toLowerCase()
  return (policy.applications || [])
    .filter(application => (application.patterns || []).some(pattern => matchesBrandPattern(haystack, pattern)))
}

export function buildR2OriginalKey(asset, brand, role) {
  const sha256 = requireSha(asset.sha256)
  return [
    'v1',
    sanitizeKeySegment(brand),
    sanitizeKeySegment(role, 'other'),
    sha256.slice(0, 2),
    sha256,
    `source${normalizeExtension(asset.extension)}`,
  ].join('/')
}

export function buildR2WorkflowKey(asset, brand, sourceClass) {
  const sha256 = requireSha(asset.sha256)
  return [
    'v1',
    sanitizeKeySegment(brand),
    sanitizeKeySegment(sourceClass, 'review'),
    sha256.slice(0, 2),
    sha256,
    `asset${normalizeExtension(asset.extension)}`,
  ].join('/')
}

export function buildR2RenditionKey(asset, brand, profile) {
  const sha256 = requireSha(asset.sha256)
  const extension = sanitizeKeySegment(String(asset.extension || 'bin').replace(/^\./, ''), 'bin')
  return [
    'v1',
    sanitizeKeySegment(brand),
    sanitizeKeySegment(asset.asset_id),
    sanitizeKeySegment(asset.version_id),
    sanitizeKeySegment(profile, 'direct'),
    `${sha256}.${extension}`,
  ].join('/')
}

export function buildVercelBlobKey(asset, brand, role, application) {
  const sha256 = requireSha(asset.sha256)
  const contentType = sanitizeKeySegment(asset.media_type, 'media')
  const guardian = detectArcaneaGuardian(asset)
  const legacyKey = application?.key === 'arcanea-ai-app'
    ? `${sanitizeKeySegment(role)}-${contentType}-${guardian || 'general'}-${asset.asset_id.slice(-8)}${normalizeExtension(asset.extension)}`
    : `${sanitizeKeySegment(role)}-${asset.asset_id.slice(-8)}${normalizeExtension(asset.extension)}`
  return [
    'v1',
    sanitizeKeySegment(brand),
    sanitizeKeySegment(application?.key, 'unmapped-app'),
    sanitizeKeySegment(legacyKey, 'asset'),
    sanitizeKeySegment(asset.version_id),
    `${sha256.slice(0, 12)}-${sanitizeKeySegment(asset.asset_id, 'asset')}${normalizeExtension(asset.extension)}`,
  ].join('/')
}

export function planDamRollout(db, policy, options = {}) {
  validateDamStoragePolicy(policy)
  const generatedAt = options.now || new Date().toISOString()
  const evals = loadLatestQualityEvals(db)
  const rows = loadPlanningRows(db)
  const brandFilter = options.brand ? sanitizeKeySegment(options.brand) : null
  const limit = normalizeLimit(options.limit, options.reviewQueue ? 80 : Number.POSITIVE_INFINITY)
  const perBrand = normalizeLimit(options.perBrand, options.reviewQueue ? 20 : Number.POSITIVE_INFINITY)

  const selectedRows = selectPlanningRows(rows, policy, { ...options, brandFilter, limit, perBrand })
  const selected = selectedRows.map(({ row, brand }) => buildPlanItem(row, brand, policy, evals.get(row.asset_id), options))

  const planSeed = JSON.stringify({
    policy: policy.policyVersion,
    brand: brandFilter,
    reviewQueue: Boolean(options.reviewQueue),
    items: selected.map(item => [item.asset_id, item.version_id, item.master.action, item.delivery.action]),
  })
  const plan = {
    plan_id: `dam_plan_${sha(planSeed).slice(0, 24)}`,
    policy_version: policy.policyVersion,
    generated_at: generatedAt,
    plan_only: true,
    provider_writes_supported: false,
    filters: {
      brand: brandFilter,
      limit: Number.isFinite(limit) ? limit : null,
      review_queue: Boolean(options.reviewQueue),
      per_brand: Number.isFinite(perBrand) ? perBrand : null,
      include_absolute_paths: Boolean(options.includeAbsolutePaths),
    },
    summary: summarizePlan(selected),
    items: selected,
    gates: [
      'The planner never uploads, deletes, publishes, changes DNS, creates tokens, or mutates provider state.',
      'Public delivery requires rights clearance, approved state, an independent version-bound 26/30 premium evaluation, inspected-export evidence, and an approved publication or production-manifest edge.',
      'Unknown, sensitive, personal, or unclassified assets stay in their source system or a private review queue.',
      'Provider execution must re-check SHA-256 and skip an existing synced storage_object with the same checksum.',
      'R2 public delivery requires a verified custom domain; r2.dev is not a production route.',
    ],
    notes: [
      'Google Drive remains the collaboration and intake layer; VIS remains the authoritative asset graph.',
      'Vercel Blob is app-local. R2 originals and workflow buckets remain private.',
      'Existing Git-served site assets are not removed or rewritten by this plan.',
    ],
  }
  validateDamStoragePlan(plan)
  return plan
}

export function validateDamStoragePlan(plan) {
  if (!plan || plan.plan_only !== true || plan.provider_writes_supported !== false) {
    throw new Error('Invalid DAM plan safety flags')
  }
  if (!/^dam_plan_[a-f0-9]{24}$/.test(plan.plan_id || '')) throw new Error('Invalid DAM plan_id')
  if (!Array.isArray(plan.items) || !Array.isArray(plan.gates) || plan.gates.length === 0) {
    throw new Error('Invalid DAM plan collections')
  }
  for (const item of plan.items) {
    if (!/^asset_[a-f0-9]{24}$/.test(item.asset_id || '')) throw new Error(`Invalid DAM asset_id: ${item.asset_id || 'missing'}`)
    if (item.version_id !== null && !/^ver_[a-f0-9]{32}$/.test(item.version_id || '')) throw new Error(`Invalid DAM version_id for ${item.asset_id}`)
    if (item.sha256 !== null && !/^[a-f0-9]{64}$/.test(item.sha256 || '')) throw new Error(`Invalid DAM SHA-256 for ${item.asset_id}`)
    for (const field of ['master', 'delivery']) {
      const value = item[field]
      if (!value || !['planned', 'blocked', 'keep', 'no-op'].includes(value.status)) throw new Error(`Invalid ${field} decision for ${item.asset_id}`)
      if (value.status === 'planned' && !value.key) throw new Error(`Planned ${field} decision lacks a provider key for ${item.asset_id}`)
      if (!Array.isArray(value.blockers)) throw new Error(`Invalid ${field} blockers for ${item.asset_id}`)
    }
    if (item.source?.paths_included !== true && ('relative_path' in (item.source || {}) || 'absolute_path' in (item.source || {}))) {
      throw new Error(`Opaque source contract violated for ${item.asset_id}`)
    }
  }
  return plan
}

function selectPlanningRows(rows, policy, options) {
  const candidates = rows
    .map(row => ({ row, brand: inferDamBrand(row, policy), role: inferDamRole(row) }))
    .filter(item => !options.brandFilter || item.brand === options.brandFilter)

  if (options.reviewQueue) {
    const rolePriority = new Map([
      ['logo', 0],
      ['wordmark', 0],
      ['favicon', 0],
      ['icon', 0],
      ['mascot', 1],
      ['hero', 2],
      ['product', 3],
      ['proof', 3],
      ['cover', 4],
      ['open-graph', 5],
      ['social', 5],
    ])
    const counts = new Map()
    const selected = []
    candidates
      .filter(item => item.brand !== 'unclassified' && rolePriority.has(item.role) && isReviewableCanonicalSource(item.row, policy))
      .sort((a, b) => {
        const priority = rolePriority.get(a.role) - rolePriority.get(b.role)
        if (priority) return priority
        const usage = Number(b.row.usage_count || 0) - Number(a.row.usage_count || 0)
        if (usage) return usage
        const brand = a.brand.localeCompare(b.brand)
        if (brand) return brand
        return a.row.asset_id.localeCompare(b.row.asset_id)
      })
      .some(item => {
        const current = counts.get(item.brand) || 0
        if (current >= options.perBrand) return false
        counts.set(item.brand, current + 1)
        selected.push(item)
        return selected.length >= options.limit
      })
    return selected
  }

  return candidates.slice(0, options.limit)
}

function buildPlanItem(row, brand, policy, qualityEval, options) {
  const role = inferDamRole(row)
  const sourceClass = classifyDamSource(row, policy)
  const applications = inferDamApplications(row, policy)
  const sensitive = isSensitive(row, policy)
  const rightsAllowed = (policy.rights.privateMasterAllowed || [...SAFE_RIGHTS]).includes(row.rights_status)
  const hasProvenance = Number(row.provenance_count || 0) > 0
  const originalsProvider = policy.providers.r2Originals
  const alreadySynced = findSyncedTarget(row, originalsProvider.provider, originalsProvider.bucket)
  const master = chooseMasterDecision({
    row,
    brand,
    role,
    sourceClass,
    sensitive,
    rightsAllowed,
    hasProvenance,
    alreadySynced,
    policy,
  })
  const quality = normalizeQuality(qualityEval, policy, row)
  const delivery = chooseDeliveryDecision({ row, brand, role, sourceClass, sensitive, applications, quality, policy })
  const metadata = Object.fromEntries((policy.customMetadataAllowlist || []).map(key => [key, metadataValue(key, row, brand, role, policy)]))

  const source = {
    class: sourceClass,
    storage_kind: row.storage_kind || 'local',
    location_id: row.location_id || null,
    paths_included: Boolean(options.includeAbsolutePaths),
  }
  if (options.includeAbsolutePaths) {
    source.repo = row.repo || null
    source.relative_path = row.relative_path || null
    source.absolute_path = row.absolute_path || null
  }

  return {
    asset_id: row.asset_id,
    version_id: row.version_id,
    sha256: row.sha256,
    media_type: row.media_type,
    byte_size: Number(row.byte_size || 0),
    brand,
    role,
    scope: {
      application_policy_mapped: applications.length > 0,
      applications: applications.map(application => application.key),
    },
    source,
    rights_status: row.rights_status,
    approval_status: row.approval_status,
    quality,
    usage_count: Number(row.usage_count || 0),
    explicit_delivery_edge_count: Number(row.explicit_delivery_edge_count || 0),
    master,
    delivery,
    metadata,
  }
}

function chooseMasterDecision({ row, brand, role, sourceClass, sensitive, rightsAllowed, hasProvenance, alreadySynced, policy }) {
  if (sensitive) {
    if (alreadySynced) {
      return decision('review-existing-object', 'blocked', 'vis-storage-object', null, alreadySynced.key, ['sensitive classification applies to an existing provider object'], null)
    }
    return decision('retain-private-source', 'keep', currentProvider(row), null, null, ['sensitive path marker requires private human review'], null)
  }
  if (sourceClass === 'archive') {
    return decision('retain-archive', 'keep', currentProvider(row), null, null, [], null)
  }
  if (sourceClass.startsWith('workflow-')) {
    const blockers = []
    if (!row.version_id || !row.sha256) blockers.push('immutable asset version and SHA-256 are required')
    if (brand === 'unclassified') blockers.push('brand classification required before workflow ingestion')
    if (!rightsAllowed) blockers.push(`rights status is not private-workflow-ready: ${row.rights_status}`)
    if (!hasWorkflowApproval(row, policy)) blockers.push('explicit business-nonsensitive workflow approval is required')
    if (blockers.length) {
      return decision('retain-source-pending-human-review', 'keep', currentProvider(row), null, null, blockers, null)
    }
    if (alreadySynced) return decision('already-synced', 'no-op', 'vis-storage-object', null, alreadySynced.key, [], null)
    const provider = policy.providers.r2Workflow
    return decision('stage-private-workflow', 'planned', provider.provider, provider.bucket, buildR2WorkflowKey(row, brand, sourceClass), [], null)
  }

  const blockers = []
  if (!row.version_id || !row.sha256) blockers.push('immutable asset version and SHA-256 are required')
  if (brand === 'unclassified') blockers.push('brand classification required')
  if (!rightsAllowed) blockers.push(`rights status is not private-master-ready: ${row.rights_status}`)
  if (!hasProvenance) blockers.push('provenance or rights evidence is missing')
  if (blockers.length) {
    if (alreadySynced) return decision('review-existing-object', 'blocked', 'vis-storage-object', null, alreadySynced.key, blockers, null)
    return decision('retain-source-pending-review', 'keep', currentProvider(row), null, null, blockers, null)
  }

  if (alreadySynced) return decision('already-synced', 'no-op', 'vis-storage-object', null, alreadySynced.key, [], null)

  const provider = policy.providers.r2Originals
  return decision('copy-private-master', 'planned', provider.provider, provider.bucket, buildR2OriginalKey(row, brand, role), [], null)
}

function chooseDeliveryDecision({ row, brand, role, sourceClass, sensitive, applications, quality, policy }) {
  const application = applications.length === 1 ? applications[0] : null
  const useBlob = row.media_type === 'image'
    && Number(row.byte_size || 0) <= Number(policy.thresholds.vercelBlobMaximumBytes)
    && (application?.blobRoles || []).includes(role)
  const blockers = []
  if (!row.version_id || !row.sha256) blockers.push('immutable asset version and SHA-256 are required')
  if (sensitive) blockers.push('sensitive asset cannot enter public delivery')
  if (brand === 'unclassified') blockers.push('brand classification required')
  if (!(policy.rights.deliveryAllowed || [...SAFE_RIGHTS]).includes(row.rights_status)) blockers.push(`rights status blocks delivery: ${row.rights_status}`)
  if (row.approval_status !== policy.approval.deliveryRequired) blockers.push(`approval must be ${policy.approval.deliveryRequired}`)
  if (!quality.score_passes) blockers.push(`premium asset score must be at least ${policy.thresholds.premiumAssetScore}/30`)
  if (!quality.actual_export_inspected) blockers.push('actual export inspection is required')
  if (!quality.independent_review) blockers.push('maker and quality reviewer must differ')
  if (!quality.exact_version_evidence) blockers.push('quality evidence must match the exact version and checksum')
  if (!quality.review_artifact_verified) blockers.push('review artifact hash and inspected variants are required')
  if (Number(row.explicit_delivery_edge_count || 0) < 1) blockers.push('approved publication or production manifest edge is required')
  if (applications.length === 0) blockers.push('target application mapping is required')
  if (useBlob && application.requiresLegacyResolver && Number(row.legacy_resolver_count || 0) < 1) {
    blockers.push(`approved legacy key resolver is required for ${application.key}`)
  }
  if (!useBlob && applications.length > 0 && !verifiedDeliveryDomain(policy, brand)) {
    blockers.push(`verified custom R2 delivery domain is required for ${brand}`)
  }
  if (sourceClass === 'archive' || sourceClass === 'private-local' || sourceClass.startsWith('workflow-')) blockers.push(`source class ${sourceClass} is not a public delivery source`)
  if (blockers.length) return decision('hold-delivery-review', 'blocked', 'vis-review-queue', null, null, blockers, applications[0]?.key || null)

  const profile = `direct-${role}`
  if (useBlob) {
    const provider = policy.providers.vercelBlob
    const synced = findSyncedTarget(row, provider.provider, null, application.key)
    if (synced) {
      return decision('already-synced', 'no-op', provider.provider, null, synced.key, [], application.key, { profile })
    }
    return decision('deliver-app-local', 'planned', provider.provider, null, buildVercelBlobKey(row, brand, role, application), [], application.key, { profile })
  }
  const provider = policy.providers.r2Renditions
  const target = application?.key || `shared:${applications.map(item => item.key).sort().join(',')}`
  const synced = findSyncedTarget(row, provider.provider, provider.bucket)
  if (synced) {
    return decision('already-synced', 'no-op', provider.provider, provider.bucket, synced.key, [], target, { profile })
  }
  return decision('deliver-shared-rendition', 'planned', provider.provider, provider.bucket, buildR2RenditionKey(row, brand, profile), [], target, { profile })
}

function normalizeQuality(record, policy, asset) {
  if (!record) {
    return {
      score: null,
      score_maximum: policy.thresholds.premiumAssetScoreMaximum,
      rubric: null,
      evaluator: null,
      score_passes: false,
      actual_export_inspected: false,
      independent_review: false,
      exact_version_evidence: false,
      review_artifact_verified: false,
    }
  }
  const metadata = parseJson(record.metadata_json, {})
  const reviewer = normalizeActorId(metadata.reviewer_id)
  const maker = normalizeActorId(metadata.maker_id)
  const independent = Boolean(maker && reviewer && maker !== reviewer)
  const inspectedVariants = Array.isArray(metadata.inspected_variants) ? metadata.inspected_variants.filter(Boolean) : []
  const artifactHash = String(metadata.review_artifact_sha256 || '').toLowerCase()
  const exactVersion = metadata.version_id === asset.version_id && String(metadata.sha256 || '').toLowerCase() === asset.sha256
  const artifactVerified = /^[a-f0-9]{64}$/.test(artifactHash)
    && inspectedVariants.length > 0
    && Boolean(Date.parse(metadata.reviewed_at))
  const acceptedRubrics = (policy.quality?.acceptedRubricMarkers || []).map(value => String(value).toLowerCase())
  const rubricAccepted = acceptedRubrics.some(marker => String(record.rubric || '').toLowerCase().includes(marker))
  const verdictAccepted = String(record.verdict || '').toLowerCase() === String(policy.quality?.requiredVerdict || 'ship').toLowerCase()
  const scorePasses = Number(record.score) >= Number(policy.thresholds.premiumAssetScore)
    && Number(record.score) <= Number(policy.thresholds.premiumAssetScoreMaximum)
    && rubricAccepted
    && verdictAccepted
  return {
    score: Number.isFinite(Number(record.score)) ? Number(record.score) : null,
    score_maximum: policy.thresholds.premiumAssetScoreMaximum,
    rubric: record.rubric || null,
    evaluator: reviewer || record.evaluator || null,
    verdict: record.verdict || null,
    score_passes: scorePasses,
    actual_export_inspected: artifactVerified && inspectedVariants.length > 0,
    independent_review: independent,
    exact_version_evidence: exactVersion,
    review_artifact_verified: artifactVerified,
    inspected_variants: inspectedVariants,
  }
}

function loadPlanningRows(db) {
  return db.prepare(`
WITH latest_version AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY created_at DESC, version_id DESC) AS rank
  FROM asset_version
), preferred_location AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY asset_id
    ORDER BY exists_now DESC, is_primary DESC, seen_at DESC, location_id DESC
  ) AS rank
  FROM asset_location
)
SELECT
  a.asset_id,
  a.title,
  a.media_type,
  a.category,
  a.tags_json,
  a.rights_status,
  a.approval_status,
  v.version_id,
  v.sha256,
  v.mime_type,
  v.extension,
  v.byte_size,
  l.location_id,
  l.root,
  l.absolute_path,
  l.relative_path,
  l.repo,
  l.storage_kind,
  COALESCE((SELECT aa.curation_status FROM asset_annotation aa WHERE aa.asset_id = a.asset_id), 'uncurated') AS curation_status,
  COALESCE((SELECT aa.custom_tags_json FROM asset_annotation aa WHERE aa.asset_id = a.asset_id), '[]') AS annotation_tags_json,
  COALESCE((SELECT COUNT(*) FROM asset_usage u WHERE u.asset_id = a.asset_id), 0) AS usage_count,
  COALESCE((SELECT GROUP_CONCAT(u.source_file, ' | ') FROM asset_usage u WHERE u.asset_id = a.asset_id), '') AS usage_sources,
  (
    COALESCE((
      SELECT COUNT(*) FROM publication pub
      WHERE pub.asset_id = a.asset_id
        AND lower(pub.status) IN ('approved', 'published', 'active')
    ), 0) +
    COALESCE((
      SELECT COUNT(*) FROM asset_usage manifest
      WHERE manifest.asset_id = a.asset_id
        AND lower(manifest.usage_context) IN ('approved-manifest', 'production-manifest', 'publication-manifest')
    ), 0)
  ) AS explicit_delivery_edge_count,
  COALESCE((
    SELECT COUNT(*) FROM provenance_event resolver
    WHERE resolver.asset_id = a.asset_id
      AND resolver.version_id = v.version_id
      AND lower(resolver.event_type) = 'legacy-key-resolver-approved'
  ), 0) AS legacy_resolver_count,
  (
    COALESCE((SELECT COUNT(*) FROM prompt p WHERE p.asset_id = a.asset_id), 0) +
    COALESCE((SELECT COUNT(*) FROM generation_event g WHERE g.asset_id = a.asset_id), 0) +
    COALESCE((SELECT COUNT(*) FROM provenance_event pe WHERE pe.asset_id = a.asset_id), 0) +
    COALESCE((SELECT COUNT(*) FROM rights_record rr WHERE rr.asset_id = a.asset_id), 0)
  ) AS provenance_count,
  COALESCE((
    SELECT GROUP_CONCAT(
      lower(so.provider) || char(31) || COALESCE(so.bucket, '') || char(31) || lower(so.status) || char(31) || COALESCE(so.key, '') || char(31) || COALESCE(so.metadata_json, '{}'),
      char(30)
    )
    FROM storage_object so
    WHERE so.asset_id = a.asset_id
      AND so.checksum = v.sha256
      AND lower(so.status) IN ('uploaded', 'synced', 'ready', 'active')
  ), '') AS synced_objects
FROM asset a
LEFT JOIN latest_version v ON v.asset_id = a.asset_id AND v.rank = 1
LEFT JOIN preferred_location l ON l.asset_id = a.asset_id AND l.rank = 1
ORDER BY a.asset_id
`).all()
}

function loadLatestQualityEvals(db) {
  const result = new Map()
  const rows = db.prepare('SELECT * FROM eval_record ORDER BY created_at DESC, eval_id DESC').all()
  for (const row of rows) {
    if (result.has(row.asset_id)) continue
    result.set(row.asset_id, row)
  }
  return result
}

function summarizePlan(items) {
  const byMasterAction = countBy(items, item => item.master.action)
  const byDeliveryAction = countBy(items, item => item.delivery.action)
  const byBrand = countBy(items, item => item.brand)
  const masterBlockers = countStrings(items.flatMap(item => item.master.blockers || []))
  const deliveryBlockers = countStrings(items.flatMap(item => item.delivery.blockers || []))
  const bytesPlannedForR2Originals = sumBytes(items.filter(item => item.master.action === 'copy-private-master'))
  const bytesPlannedForR2Workflow = sumBytes(items.filter(item => item.master.action === 'stage-private-workflow'))
  const bytesPlannedForDelivery = sumBytes(items.filter(item => item.delivery.status === 'planned'))
  return {
    assets_considered: items.length,
    master: byMasterAction,
    delivery: byDeliveryAction,
    brands: byBrand,
    master_blockers: masterBlockers,
    delivery_blockers: deliveryBlockers,
    bytes_planned: {
      r2_originals: bytesPlannedForR2Originals,
      r2_workflow: bytesPlannedForR2Workflow,
      delivery: bytesPlannedForDelivery,
    },
    public_delivery_ready: items.filter(item => item.delivery.status === 'planned').length,
    public_delivery_blocked: items.filter(item => item.delivery.status === 'blocked').length,
    application_policy_unmapped: items.filter(item => !item.scope.application_policy_mapped).length,
  }
}

function decision(action, status, provider, bucket, key, blockers = [], application = null, details = {}) {
  return { action, status, provider, bucket: bucket || null, key: key || null, application, blockers, ...details }
}

function metadataValue(key, row, brand, role, policy) {
  const values = {
    asset_id: row.asset_id,
    version_id: row.version_id,
    sha256: row.sha256,
    brand,
    role,
    rights_status: row.rights_status,
    approval_status: row.approval_status,
    manifest_version: policy.policyVersion,
  }
  return values[key] ?? null
}

function buildAssetHaystack(asset) {
  return [asset.title, asset.category, asset.tags_json, asset.repo, asset.root, asset.relative_path, asset.absolute_path, asset.usage_sources]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function buildBrandHaystack(asset) {
  return [asset.title, asset.category, asset.tags_json, asset.repo, asset.relative_path]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isReviewableCanonicalSource(row, policy) {
  if (inferSourceApplications(row, policy).length !== 1) return false
  if (classifyDamSource(row, policy) === 'private-local') return false
  const relative = String(row.relative_path || '').replace(/\\/g, '/').toLowerCase()
  return /(^|\/)public\//.test(relative)
    || /(^|\/)assets\/brand\//.test(relative)
    || /(^|\/)brand\/logo-system\/masters\//.test(relative)
    || /(^|\/)brand-assets\/02-logos\//.test(relative)
}

function isSensitive(asset, policy) {
  const haystack = buildAssetHaystack(asset)
  return (policy.sensitivePathMarkers || []).some(marker => haystack.includes(String(marker).toLowerCase()))
}

function hasWorkflowApproval(row, policy) {
  const requiredStatus = policy.workflowApproval?.requiredCurationStatus
  const requiredTag = policy.workflowApproval?.requiredClassificationTag
  const tags = parseJson(row.annotation_tags_json, [])
  return row.curation_status === requiredStatus && Array.isArray(tags) && tags.includes(requiredTag)
}

function verifiedDeliveryDomain(policy, brand) {
  const route = (policy.deliveryDomains || []).find(item => item.brand === brand)
  return Boolean(route && route.status === 'verified' && typeof route.domain === 'string' && route.domain.length > 3)
}

function currentProvider(row) {
  if (row.storage_kind === 'drive' || /google drive|starlight creative vault/i.test(`${row.root || ''} ${row.absolute_path || ''}`)) return 'google-drive'
  if (row.storage_kind === 'onedrive' || /onedrive/i.test(`${row.root || ''} ${row.absolute_path || ''}`)) return 'onedrive'
  if (row.repo) return 'github'
  return row.storage_kind || 'local'
}

function findSyncedTarget(row, provider, bucket, application = null) {
  const records = String(row.synced_objects || '')
    .split(String.fromCharCode(30))
    .filter(Boolean)
    .map(value => {
      const [recordProvider, recordBucket, status, key, metadataJson] = value.split(String.fromCharCode(31))
      return { provider: recordProvider, bucket: recordBucket || null, status, key: key || null, metadata: parseJson(metadataJson, {}) }
    })
  return records.find(record => {
    if (!SYNCED_STORAGE_STATUSES.has(record.status)) return false
    if (normalizeProvider(record.provider) !== normalizeProvider(provider)) return false
    if (bucket !== null && bucket !== undefined && record.bucket !== bucket) return false
    if (!application) return true
    const recordedApplication = record.metadata.application || record.metadata.application_key || record.metadata.store_id || null
    return recordedApplication === application || String(record.key || '').includes(`/${sanitizeKeySegment(application)}/`)
  }) || null
}

function normalizeProvider(value) {
  const provider = String(value || '').toLowerCase()
  if (provider === 'r2' || provider === 'cloudflare') return 'cloudflare-r2'
  if (provider === 'vercel' || provider === 'blob') return 'vercel-blob'
  return provider
}

function normalizeActorId(value) {
  return String(value || '').trim().toLowerCase() || null
}

function normalizeExtension(extension) {
  const normalized = String(extension || '').replace(/^\./, '')
  return normalized ? `.${sanitizeKeySegment(normalized, 'bin')}` : '.bin'
}

function detectArcaneaGuardian(asset) {
  const text = buildAssetHaystack(asset)
  const known = ['draconia', 'nero', 'arion', 'shinkami', 'nova', 'stella', 'lumina', 'luminor']
  return known.find(guardian => text.includes(guardian)) || null
}

function requireSha(value) {
  const normalized = String(value || '').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`Invalid SHA-256 for DAM key: ${value || 'missing'}`)
  return normalized
}

function normalizeLimit(value, fallback = Number.POSITIVE_INFINITY) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error('limit must be a positive integer')
  return parsed
}

function countBy(items, selector) {
  return Object.fromEntries([...items.reduce((counts, item) => {
    const key = selector(item)
    counts.set(key, (counts.get(key) || 0) + 1)
    return counts
  }, new Map())].sort(([a], [b]) => a.localeCompare(b)))
}

function countStrings(values) {
  return Object.fromEntries([...values.reduce((counts, value) => {
    counts.set(value, (counts.get(value) || 0) + 1)
    return counts
  }, new Map())].sort(([, countA], [, countB]) => countB - countA))
}

function sumBytes(items) {
  return items.reduce((sum, item) => sum + Number(item.byte_size || 0), 0)
}

function sha(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '')
  } catch {
    return fallback
  }
}

export const DAM_SYNCED_STORAGE_STATUSES = SYNCED_STORAGE_STATUSES
