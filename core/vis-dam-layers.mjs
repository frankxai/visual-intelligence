/**
 * Advanced Agentic DAM layers:
 *   1. Structured Metadata Schema & Conditional Validation Engine
 *   2. Upload Presets with non-waivable Issue #41 safety locks (rights_default: 'unknown')
 *   3. Derivative Lineage & Safe Cache Purge Planner (derived/ only; masters/ immutable)
 *   4. Character Canon & Negative-Taste Briefing Builder
 *   5. Hybrid Lexical + Facet + Cosine Vector Reciprocal Rank Fusion (RRF) Search
 */

import { masterKey } from './vis-storage.mjs'
import { parseTransformSpec, derivedKey } from './vis-transform.mjs'

const SHA256_RE = /^[a-f0-9]{64}$/

export const DEFAULT_METADATA_FIELDS = Object.freeze({
  brand: {
    type: 'enum',
    required: false,
    values: ['frankx', 'arcanea', 'starlight', 'gencreator', 'music', 'estate', 'fixture'],
    description: 'Owning brand namespace',
  },
  content_pillar: {
    type: 'enum',
    required: false,
    values: ['hero', 'character-canon', 'editorial', 'social', 'product', 'album-art', 'diagram', 'research'],
    description: 'Editorial or product content pillar',
  },
  campaign: {
    type: 'string',
    required: false,
    maxLength: 120,
    description: 'Campaign or launch slug',
  },
  character_id: {
    type: 'string',
    required: false,
    maxLength: 120,
    pattern: '^[a-z0-9][a-z0-9-_]{1,119}$',
    description: 'Canonical character identifier (e.g. sable, luminor-sable)',
  },
  character_outfit: {
    type: 'string',
    required: false,
    maxLength: 120,
    description: 'Approved outfit or variant slug when depicting a character',
  },
  arcanea_gate: {
    type: 'enum',
    required: false,
    values: ['foundation', 'flow', 'fire', 'heart', 'voice', 'sight', 'crown', 'starweave', 'unity', 'source'],
    description: 'Arcanea Ten Gates taxonomy alignment',
  },
  arcanea_house: {
    type: 'enum',
    required: false,
    values: ['lumina', 'nero', 'pyros', 'aqualis', 'terran', 'ventis', 'aetheris'],
    description: 'Arcanea elemental or house alignment',
  },
  aspect_intent: {
    type: 'enum',
    required: false,
    values: ['square', 'landscape', 'portrait', 'ultrawide', 'vertical-story'],
    description: 'Target layout orientation intent',
  },
  usage_channels: {
    type: 'set',
    required: false,
    values: ['website', 'og-social', 'newsletter', 'youtube', 'x', 'linkedin', 'music-cover', 'print', 'docs'],
    description: 'Intended distribution channels',
  },
  license_expiry: {
    type: 'date',
    required: false,
    description: 'Optional ISO-8601 date/timestamp when licensed usage expires',
  },
  qa_score: {
    type: 'integer',
    required: false,
    min: 0,
    max: 30,
    description: 'VIS multimodal QA score (0-30, publication gate >=26)',
  },
  alt_text: {
    type: 'string',
    required: false,
    maxLength: 500,
    description: 'Accessible descriptive alt text',
  },
  negative_taste_flags: {
    type: 'set',
    required: false,
    values: ['plastic-skin', 'blurry', 'hallucinated-text', 'all-caps-heading', 'purple-gradient-slop', 'off-model', 'watermarked', 'cropped-face'],
    description: 'Observed defect or taste violation flags',
  },
})

export const DEFAULT_CONDITIONAL_RULES = Object.freeze([
  {
    id: 'arcanea-gate-recommended',
    when: { field: 'brand', equals: 'arcanea' },
    then: { require: ['arcanea_gate'], severity: 'warning', message: 'Arcanea assets should specify arcanea_gate for canon indexing' },
  },
  {
    id: 'character-outfit-required',
    when: { field: 'character_id', truthy: true },
    then: { require: ['character_outfit'], severity: 'error', message: 'Assets linked to character_id must declare character_outfit' },
  },
])

/**
 * Validates and normalizes structured metadata against typed field schemas and conditional rules.
 */
export function validateStructuredMetadata(values = {}, options = {}) {
  const fields = options.fields || DEFAULT_METADATA_FIELDS
  const rules = options.rules || DEFAULT_CONDITIONAL_RULES
  const strict = options.strict === true
  const errors = []
  const warnings = []
  const normalized = {}

  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return { valid: false, errors: [{ field: '_root', code: 'invalid_payload', message: 'Metadata must be a plain object' }], warnings: [], normalized: {} }
  }

  for (const [key, def] of Object.entries(fields)) {
    if (def.required && (values[key] === undefined || values[key] === null || values[key] === '')) {
      errors.push({ field: key, code: 'required_missing', message: `Missing required structured field: ${key}` })
    }
  }

  for (const [key, raw] of Object.entries(values)) {
    const def = fields[key]
    if (!def) {
      if (strict) {
        errors.push({ field: key, code: 'unknown_field', message: `Unknown structured metadata field: ${key}` })
      } else {
        warnings.push({ field: key, code: 'unknown_field', message: `Field ${key} is not in schema and was skipped` })
      }
      continue
    }
    if (raw === undefined || raw === null) continue

    if (def.type === 'string') {
      if (typeof raw !== 'string') {
        errors.push({ field: key, code: 'invalid_type', message: `${key} must be a string` })
        continue
      }
      const trimmed = raw.trim()
      if (def.maxLength && trimmed.length > def.maxLength) {
        errors.push({ field: key, code: 'max_length_exceeded', message: `${key} exceeds maxLength ${def.maxLength}` })
        continue
      }
      if (def.pattern && !new RegExp(def.pattern).test(trimmed)) {
        errors.push({ field: key, code: 'pattern_mismatch', message: `${key} does not match pattern ${def.pattern}` })
        continue
      }
      normalized[key] = trimmed
    } else if (def.type === 'integer') {
      if (!Number.isInteger(raw)) {
        errors.push({ field: key, code: 'invalid_type', message: `${key} must be an integer` })
        continue
      }
      if (def.min !== undefined && raw < def.min) {
        errors.push({ field: key, code: 'below_min', message: `${key} must be >= ${def.min}` })
        continue
      }
      if (def.max !== undefined && raw > def.max) {
        errors.push({ field: key, code: 'above_max', message: `${key} must be <= ${def.max}` })
        continue
      }
      normalized[key] = raw
    } else if (def.type === 'boolean') {
      if (typeof raw !== 'boolean') {
        errors.push({ field: key, code: 'invalid_type', message: `${key} must be a boolean` })
        continue
      }
      normalized[key] = raw
    } else if (def.type === 'date') {
      if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
        errors.push({ field: key, code: 'invalid_date', message: `${key} must be a valid ISO-8601 date string` })
        continue
      }
      normalized[key] = raw.trim()
    } else if (def.type === 'enum') {
      if (typeof raw !== 'string' || !def.values.includes(raw)) {
        errors.push({ field: key, code: 'invalid_enum', message: `${key} must be one of: ${def.values.join(', ')}` })
        continue
      }
      normalized[key] = raw
    } else if (def.type === 'set') {
      if (!Array.isArray(raw)) {
        errors.push({ field: key, code: 'invalid_type', message: `${key} must be an array of allowed values` })
        continue
      }
      const deduped = [...new Set(raw)]
      const invalidItems = deduped.filter(item => typeof item !== 'string' || (def.values && !def.values.includes(item)))
      if (invalidItems.length) {
        errors.push({ field: key, code: 'invalid_set_member', message: `${key} contains invalid values: ${invalidItems.join(', ')}` })
        continue
      }
      normalized[key] = deduped
    }
  }

  for (const rule of rules) {
    const val = normalized[rule.when.field] ?? values[rule.when.field]
    const triggered = rule.when.equals !== undefined ? val === rule.when.equals : Boolean(rule.when.truthy && val)
    if (!triggered) continue
    for (const reqField of rule.then.require || []) {
      const present = normalized[reqField] !== undefined && normalized[reqField] !== '' && (!Array.isArray(normalized[reqField]) || normalized[reqField].length > 0)
      if (!present) {
        const entry = { field: reqField, ruleId: rule.id, code: 'conditional_rule', message: rule.then.message }
        if (rule.then.severity === 'error') errors.push(entry)
        else warnings.push(entry)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized,
  }
}

export const DEFAULT_UPLOAD_PRESETS = Object.freeze({
  brand_hero_intake: {
    id: 'brand_hero_intake',
    description: 'Website or campaign hero image intake with responsive web derivative planning',
    folder: '01_INBOX/brand-hero',
    allowed_mime_types: ['image/png', 'image/webp', 'image/jpeg', 'image/avif'],
    max_bytes: 20 * 1024 * 1024,
    rights_default: 'unknown',
    approval_default: 'candidate',
    auto_transforms: ['hero_desktop', 'hero_mobile', 'og_card', 'preview', 'thumb'],
    default_tags: ['intake', 'hero-candidate'],
    required_metadata: ['brand'],
  },
  character_canon_intake: {
    id: 'character_canon_intake',
    description: 'Character sheet / turn-around / canon portrait intake (private R2 master only)',
    folder: '02_CHARACTER_CANON/intake',
    allowed_mime_types: ['image/png', 'image/webp', 'image/jpeg'],
    max_bytes: 25 * 1024 * 1024,
    rights_default: 'unknown',
    approval_default: 'candidate',
    auto_transforms: ['lore_card', 'avatar_lg', 'avatar_sm', 'preview', 'thumb'],
    default_tags: ['intake', 'character-canon'],
    required_metadata: ['brand', 'character_id', 'character_outfit'],
  },
  social_derivative_intake: {
    id: 'social_derivative_intake',
    description: 'Social campaign visual intake (square & OpenGraph pre-warmed specs)',
    folder: '01_INBOX/social',
    allowed_mime_types: ['image/png', 'image/webp', 'image/jpeg'],
    max_bytes: 15 * 1024 * 1024,
    rights_default: 'unknown',
    approval_default: 'candidate',
    auto_transforms: ['square_1080', 'og_card', 'thumb'],
    default_tags: ['intake', 'social'],
    required_metadata: ['brand'],
  },
  music_cover_intake: {
    id: 'music_cover_intake',
    description: 'Music IS release artwork intake targeting 3000x3000 streaming spec',
    folder: '03_MUSIC_RELEASES/covers',
    allowed_mime_types: ['image/png', 'image/jpeg'],
    max_bytes: 30 * 1024 * 1024,
    rights_default: 'unknown',
    approval_default: 'candidate',
    auto_transforms: ['cover_3000', 'square_1080', 'preview', 'thumb'],
    default_tags: ['intake', 'music-cover'],
    required_metadata: [],
  },
  raw_master_archive: {
    id: 'raw_master_archive',
    description: 'Original master ingest (PNG/WEBP/TIFF/MP4/WAV) archived by SHA-256 with thumb/preview',
    folder: '00_MASTERS_ARCHIVE',
    allowed_mime_types: ['image/png', 'image/webp', 'image/jpeg', 'image/tiff', 'video/mp4', 'audio/wav', 'audio/flac'],
    max_bytes: 200 * 1024 * 1024,
    rights_default: 'unknown',
    approval_default: 'candidate',
    auto_transforms: ['preview', 'thumb'],
    default_tags: ['intake', 'raw-master'],
    required_metadata: [],
  },
})

/**
 * Verifies an upload preset enforces Issue #41 human gates (rights_default='unknown', approval_default='candidate').
 */
export function validateUploadPreset(preset) {
  const errors = []
  if (!preset || typeof preset !== 'object') {
    return { valid: false, errors: ['Preset object is required'] }
  }
  if (preset.rights_default !== 'unknown') {
    errors.push('Upload preset must hard-lock rights_default to "unknown" (Issue #41 human gate)')
  }
  if (preset.approval_default !== 'candidate') {
    errors.push('Upload preset must hard-lock approval_default to "candidate"')
  }
  if (!Array.isArray(preset.allowed_mime_types) || preset.allowed_mime_types.length === 0) {
    errors.push('Upload preset must declare non-empty allowed_mime_types')
  }
  if (!Number.isInteger(preset.max_bytes) || preset.max_bytes < 1024 || preset.max_bytes > 500 * 1024 * 1024) {
    errors.push('Upload preset max_bytes must be between 1024 bytes and 500 MiB')
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Evaluates a candidate file + structured metadata against an upload preset in dry-run intake mode.
 */
export function evaluateUploadAgainstPreset({
  preset = 'brand_hero_intake',
  filename,
  mimeType,
  byteSize,
  sha256,
  metadata = {},
  bucket = 'starlight-media-private',
}) {
  const resolvedPreset = typeof preset === 'string' ? DEFAULT_UPLOAD_PRESETS[preset] : preset
  const blockers = []

  if (!resolvedPreset) {
    return {
      accepted: false,
      blockers: [`Unknown upload preset: ${preset}`],
      bucket,
      key: null,
      autoTransforms: [],
      normalizedMetadata: {},
      rights_status: 'unknown',
      approval_status: 'candidate',
    }
  }

  const presetCheck = validateUploadPreset(resolvedPreset)
  if (!presetCheck.valid) {
    blockers.push(...presetCheck.errors)
  }

  if (!filename || typeof filename !== 'string' || !filename.trim()) {
    blockers.push('filename is required')
  } else if (/[\\/\0<>:"|?*]|\.\./.test(filename.trim())) {
    blockers.push('filename contains unsafe path or reserved characters')
  }
  if (!mimeType || !resolvedPreset.allowed_mime_types.includes(String(mimeType).toLowerCase())) {
    blockers.push(`MIME type ${mimeType || 'missing'} is not allowed by preset ${resolvedPreset.id}`)
  }
  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > resolvedPreset.max_bytes) {
    blockers.push(`byteSize ${byteSize} exceeds limit 1..${resolvedPreset.max_bytes}`)
  }
  if (!SHA256_RE.test(sha256 || '')) {
    blockers.push('Valid 64-hex sha256 checksum is required before intake')
  }

  const metaCheck = validateStructuredMetadata(metadata)
  if (!metaCheck.valid) {
    for (const err of metaCheck.errors) blockers.push(err.message)
  }
  for (const reqField of resolvedPreset.required_metadata || []) {
    const v = metaCheck.normalized[reqField]
    if (v === undefined || v === null || v === '') {
      blockers.push(`Preset ${resolvedPreset.id} requires metadata.${reqField}`)
    }
  }

  const cleanKey = SHA256_RE.test(sha256 || '') ? masterKey(sha256) : null
  const autoTransforms = (resolvedPreset.auto_transforms || []).map(name => {
    const parsed = parseTransformSpec(`t_${name}`)
    return {
      preset: name,
      canonical: parsed.canonical,
    }
  })

  return {
    accepted: blockers.length === 0,
    presetId: resolvedPreset.id,
    blockers,
    bucket,
    folder: resolvedPreset.folder,
    key: cleanKey,
    sha256: SHA256_RE.test(sha256 || '') ? sha256 : null,
    autoTransforms,
    normalizedMetadata: metaCheck.normalized,
    metadataWarnings: metaCheck.warnings,
    defaultTags: [...(resolvedPreset.default_tags || [])],
    rights_status: 'unknown',
    approval_status: 'candidate',
  }
}

/**
 * Dry-run planner for invalidating/purging edge-cached derived/ objects without ever touching masters/ or renditions/.
 */
export function planDerivativePurge({
  sha256,
  derivatives = [],
  specFilter = null,
  reason = 'cache-invalidation',
}) {
  if (sha256 && !SHA256_RE.test(sha256)) {
    throw new Error(`Invalid sha256 for derivative purge: ${sha256}`)
  }

  const filterCanonical = specFilter ? parseTransformSpec(specFilter).canonical : null
  const purgeTargets = []
  const refused = []

  for (const entry of derivatives) {
    const key = typeof entry === 'string' ? entry : (entry?.r2_object_key || entry?.key || '')
    const canonical = typeof entry === 'object' ? (entry.transform_spec || entry.canonical || null) : null
    if (!key) continue

    if (key.startsWith('masters/') || key.startsWith('renditions/')) {
      refused.push({ key, reason: 'immutable_key_protected' })
      continue
    }
    if (!key.startsWith('derived/')) {
      refused.push({ key, reason: 'non_derived_prefix_blocked' })
      continue
    }
    if (sha256 && !key.includes(`/${sha256}.`)) {
      refused.push({ key, reason: 'sha256_scope_mismatch' })
      continue
    }
    if (filterCanonical && canonical !== filterCanonical) {
      continue
    }
    if (!SHA256_RE.test(sha256 || '')) {
      const m = key.match(/^derived\/[a-f0-9]{2}\/([a-f0-9]{64})\.([a-f0-9]{16})\.(avif|webp|jpeg|jpg|png)$/)
      if (!m) {
        refused.push({ key, reason: 'invalid_derived_key_format' })
        continue
      }
      void derivedKey(m[1], m[2], m[3])
    }

    purgeTargets.push({
      key,
      canonical,
      action: 'delete_derived_cache_only',
    })
  }

  return {
    dryRun: true,
    sha256: sha256 || null,
    reason,
    specFilter: filterCanonical,
    purgeTargets,
    refused,
    purgeCount: purgeTargets.length,
    refusedCount: refused.length,
    mastersUntouched: true,
  }
}

/**
 * Builds an agent-ready Character Canon & Negative-Taste Briefing from VIS assets, taste directives, and lineage records.
 */
export function buildCharacterCanonBrief({
  characterId,
  brand = null,
  assets = [],
  tasteDirectives = [],
  lineageRecords = [],
  identityReceipt = null,
}) {
  if (!characterId || typeof characterId !== 'string') {
    throw new Error('characterId is required to build a character canon brief')
  }
  const needle = characterId.trim().toLowerCase()
  const brandNeedle = brand ? brand.trim().toLowerCase() : null

  const matchingAssets = assets.filter(asset => {
    const tags = Array.isArray(asset.tags) ? asset.tags : (typeof asset.tags_json === 'string' ? safeJson(asset.tags_json, []) : [])
    const chars = Array.isArray(asset.characters) ? asset.characters : []
    const text = `${asset.asset_id || ''} ${asset.title || ''} ${asset.relative_path || ''} ${tags.join(' ')} ${chars.join(' ')}`.toLowerCase()
    const matchesChar = chars.some(c => String(c).toLowerCase() === needle) ||
      tags.some(t => String(t).toLowerCase() === `character:${needle}` || String(t).toLowerCase() === needle) ||
      text.includes(needle)
    if (!matchesChar) return false
    if (brandNeedle) {
      const assetBrand = String(asset.brand || asset.category || '').toLowerCase()
      return !assetBrand || assetBrand === brandNeedle || tags.some(t => String(t).toLowerCase() === `brand:${brandNeedle}`)
    }
    return true
  })

  const isOwnedOrApprovedRights = r => ['owned', 'generated-owned', 'licensed'].includes(r)
  const canonicalReferences = matchingAssets
    .filter(a => a.approval_status === 'approved' && isOwnedOrApprovedRights(a.rights_status) && SHA256_RE.test(a.sha256 || ''))
    .map(compactAssetSummary)

  const identityResolved = Boolean(
    identityReceipt &&
    identityReceipt.status === 'resolved' &&
    SHA256_RE.test(identityReceipt.sha256 || '') &&
    typeof identityReceipt.approved_version === 'string' &&
    identityReceipt.approved_version.trim()
  )
  const matchedIdentityRef = identityResolved
    ? canonicalReferences.find(c => c.sha256 === identityReceipt.sha256) || null
    : null

  const approvedVariants = matchingAssets
    .filter(a => a.approval_status === 'approved' && !canonicalReferences.some(c => c.asset_id === a.asset_id))
    .map(compactAssetSummary)

  const rejectedDriftExamples = matchingAssets
    .filter(a => a.approval_status === 'rejected' || a.rights_status === 'blocked')
    .map(a => ({
      ...compactAssetSummary(a),
      rejection_reason: a.notes || a.reason || 'Marked rejected/blocked in VIS catalog',
    }))

  const relevantDirectives = tasteDirectives.filter(d => {
    const dBrand = String(d.brand || 'estate').toLowerCase()
    return !brandNeedle || dBrand === brandNeedle || dBrand === 'estate'
  })

  const positiveDirectives = relevantDirectives
    .filter(d => d.polarity === 'positive')
    .map(d => d.doctrine || d.subject || d.notes)
    .filter(Boolean)

  const negativeTasteRules = relevantDirectives
    .filter(d => d.polarity === 'negative')
    .map(d => d.doctrine || d.subject || d.notes)
    .filter(Boolean)

  const defects = new Set()
  for (const d of relevantDirectives) {
    if (Array.isArray(d.defects)) {
      for (const defect of d.defects) defects.add(defect)
    }
  }

  return {
    schemaVersion: 'vis.character-canon-brief.v1',
    status: matchedIdentityRef ? 'resolved' : 'unresolved_identity_authority',
    publish_authorized: false,
    characterId: needle,
    brand: brandNeedle,
    matchedCount: matchingAssets.length,
    canonicalReferences,
    approvedVariants,
    rejectedDriftExamples,
    lineageRecords: lineageRecords.slice(0, 20),
    positiveDirectives: [...new Set(positiveDirectives)],
    negativeTasteRules: [...new Set(negativeTasteRules)],
    avoidDefects: [...defects],
    identityReceipt: identityResolved
      ? {
          status: identityReceipt.status,
          approved_version: identityReceipt.approved_version,
          sha256: identityReceipt.sha256,
        }
      : null,
    guardrails: [
      'A resolved, version-and-digest-bound visual.identity.resolve receipt matching canonicalReferences[].sha256 is required BEFORE generation or placement.',
      'Do not infer rights from folder names; require rights_status in owned|generated-owned|licensed before publication.',
      'Cross-check visual.identity.resolve again before channel placement.',
    ],
    readyForGeneration: Boolean(matchedIdentityRef),
  }
}

export function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) {
    return null
  }
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    const a = Number(vecA[i])
    const b = Number(vecB[i])
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    dot += a * b
    normA += a * a
    normB += b * b
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Reciprocal Rank Fusion (RRF) combining lexical matching, facet filters, and cosine vector similarity.
 */
export function hybridScoreAssets(assets = [], options = {}) {
  const query = String(options.query || '').trim().toLowerCase()
  const words = query.split(/\s+/).filter(Boolean)
  const queryEmbedding = Array.isArray(options.queryEmbedding) ? options.queryEmbedding : null
  const filters = options.filters || {}
  const k = Number.isFinite(options.k) && options.k > 0 ? options.k : 60
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20

  const filtered = assets.filter(asset => {
    if (filters.brand && String(asset.brand || '').toLowerCase() !== String(filters.brand).toLowerCase()) return false
    if (filters.media_type && asset.media_type !== filters.media_type) return false
    if (filters.rights_status && asset.rights_status !== filters.rights_status) return false
    if (filters.approval_status && asset.approval_status !== filters.approval_status) return false
    if (filters.character) {
      const target = String(filters.character).toLowerCase()
      const chars = Array.isArray(asset.characters) ? asset.characters.map(c => String(c).toLowerCase()) : []
      if (!chars.includes(target)) return false
    }
    return true
  })

  const scored = filtered.map(asset => {
    const tags = Array.isArray(asset.tags) ? asset.tags : safeJson(asset.tags_json, [])
    const chars = Array.isArray(asset.characters) ? asset.characters : []
    const hay = `${asset.asset_id || ''} ${asset.title || ''} ${asset.brand || ''} ${asset.caption || ''} ${asset.category || ''} ${tags.join(' ')} ${chars.join(' ')}`.toLowerCase()
    let lexicalScore = words.length ? 0 : 1
    const matchReasons = []
    for (const word of words) {
      if (hay.includes(word)) {
        lexicalScore += String(asset.title || '').toLowerCase().includes(word) ? 15 : 10
      }
    }
    if (lexicalScore > 0 && words.length > 0) matchReasons.push('lexical')

    const semanticScore = queryEmbedding && Array.isArray(asset.embedding)
      ? cosineSimilarity(queryEmbedding, asset.embedding)
      : null
    if (semanticScore !== null && semanticScore > 0) matchReasons.push('semantic-vector')
    if (Object.keys(filters).length > 0) matchReasons.push('facet-filter')

    return { asset, lexicalScore, semanticScore, matchReasons }
  })

  const lexicalRanked = [...scored]
    .filter(item => item.lexicalScore > 0)
    .sort((a, b) => b.lexicalScore - a.lexicalScore)
  const semanticRanked = queryEmbedding
    ? [...scored].filter(item => item.semanticScore !== null && item.semanticScore > 0).sort((a, b) => b.semanticScore - a.semanticScore)
    : []

  const lexRankMap = new Map(lexicalRanked.map((item, idx) => [item.asset, idx + 1]))
  const semRankMap = new Map(semanticRanked.map((item, idx) => [item.asset, idx + 1]))

  const combined = scored
    .filter(item => !words.length || item.lexicalScore > 0 || (item.semanticScore !== null && item.semanticScore > 0))
    .map(item => {
      const lr = lexRankMap.get(item.asset)
      const sr = semRankMap.get(item.asset)
      const rrfScore = (lr ? 1 / (k + lr) : 0) + (sr ? 1 / (k + sr) : 0)
      return {
        ...item,
        rrfScore: Number(rrfScore.toFixed(6)),
      }
    })
    .sort((a, b) => b.rrfScore - a.rrfScore || b.lexicalScore - a.lexicalScore)

  return combined.slice(0, limit)
}

function compactAssetSummary(asset) {
  return {
    asset_id: asset.asset_id,
    title: asset.title || null,
    sha256: asset.sha256 || null,
    brand: asset.brand || asset.category || null,
    rights_status: asset.rights_status || 'unknown',
    approval_status: asset.approval_status || 'candidate',
    media_type: asset.media_type || 'image',
    width: asset.width ?? null,
    height: asset.height ?? null,
  }
}

function safeJson(raw, fallback) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}
