import crypto from 'crypto'
import path from 'path'
import { masterKey, renditionKey, signPath } from './vis-storage.mjs'

export const DEFAULT_R2_BUCKET = 'starlight-media-private'
export const DEFAULT_DRIVE_VAULT_ROOT = 'Google Drive/Starlight Creative Vault'

const SHA256_RE = /^[a-f0-9]{64}$/
const SAFE_KEY_RE = /^(masters|renditions|test)\/[A-Za-z0-9._\-/]{1,300}$/
const FORBIDDEN_HOST_RE = /(?:^|\.)(?:workers|r2)\.dev$/i

/**
 * Validates and normalizes an optional custom-domain Worker base URL.
 * Per `workers/vis-media/wrangler.jsonc`, `workers_dev` and `preview_urls` stay disabled
 * and `r2.dev` is never exposed; omitting `workerBase` produces relative private paths.
 */
export function resolvePrivateWorkerBase(workerBase) {
  if (workerBase === undefined || workerBase === null || workerBase === '') {
    return null
  }
  if (typeof workerBase !== 'string') {
    throw new Error('workerBase must be a custom HTTPS origin string or omitted for private relative endpoints')
  }
  let parsed
  try {
    parsed = new URL(workerBase.trim())
  } catch {
    throw new Error(`Invalid workerBase URL: ${workerBase}`)
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`workerBase must use https: protocol (received ${parsed.protocol})`)
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('workerBase must not contain credentials, query parameters, or fragments')
  }
  if (FORBIDDEN_HOST_RE.test(parsed.hostname)) {
    throw new Error(`Private vis-media contract forbids workers.dev / r2.dev endpoints: ${parsed.hostname}`)
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
}

/**
 * Hardened R2 upload key validation (aligned with `workers/vis-media/src/index.js` and VIS#44).
 * Rejects traversal, encoded dots, backslashes, NUL bytes, non-allowlisted prefixes, and
 * content-hash mismatches on `masters/` and `renditions/` keys.
 */
export function validateUploadKey(key, expectedSha256) {
  if (typeof key !== 'string' || key.length === 0) {
    return { valid: false, reason: 'empty_key' }
  }
  if (key.includes('\0') || key.includes('\\') || key.includes('..') || /%2e/i.test(key) || /%2f/i.test(key) || /%5c/i.test(key)) {
    return { valid: false, reason: 'unsafe_key_characters' }
  }
  if (!SAFE_KEY_RE.test(key)) {
    return { valid: false, reason: 'invalid_key_format' }
  }
  if (expectedSha256 !== undefined) {
    if (typeof expectedSha256 !== 'string' || !SHA256_RE.test(expectedSha256)) {
      return { valid: false, reason: 'invalid_expected_sha256' }
    }
    if (key.startsWith('masters/') && key !== masterKey(expectedSha256)) {
      return { valid: false, reason: 'master_key_sha256_mismatch' }
    }
    if (key.startsWith('renditions/')) {
      const validThumb = renditionKey(expectedSha256, 'thumb')
      const validPreview = renditionKey(expectedSha256, 'preview')
      if (key !== validThumb && key !== validPreview) {
        return { valid: false, reason: 'rendition_key_sha256_mismatch' }
      }
    }
  }
  return { valid: true, key }
}

/**
 * Normalizes and deduplicates usage edges (`usedIn`) for an asset (VIS#44).
 */
export function normalizeUsageEdges(usedIn = []) {
  if (!Array.isArray(usedIn)) return []
  const seen = new Set()
  const edges = []
  for (const raw of usedIn) {
    if (!raw) continue
    const edge =
      typeof raw === 'string'
        ? { domain: null, route: raw.trim(), component: null, sourceFile: null }
        : {
            domain: typeof raw.domain === 'string' && raw.domain.trim() ? raw.domain.trim().toLowerCase() : null,
            route: typeof raw.route === 'string' && raw.route.trim() ? raw.route.trim() : null,
            component: typeof raw.component === 'string' && raw.component.trim() ? raw.component.trim() : null,
            sourceFile: typeof raw.sourceFile === 'string' && raw.sourceFile.trim() ? raw.sourceFile.trim().replaceAll('\\', '/') : null,
          }
    if (!edge.domain && !edge.route && !edge.component && !edge.sourceFile) continue
    const dedupeKey = `${edge.domain || ''}|${edge.route || ''}|${edge.component || ''}|${edge.sourceFile || ''}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    edges.push(edge)
  }
  return edges
}

/**
 * Generates an HMAC-SHA256 signed rendition URL compatible with `workers/vis-media/src/index.js`.
 */
export function createSignedPreviewUrl({
  workerBase,
  sha256,
  kind = 'preview',
  signingKey,
  ttlSeconds = 3600,
  nowSec = Math.floor(Date.now() / 1000),
}) {
  if (!SHA256_RE.test(sha256 || '')) throw new Error(`Invalid sha256: ${sha256}`)
  if (kind !== 'thumb' && kind !== 'preview') throw new Error(`Invalid rendition kind: ${kind}`)
  if (!signingKey || typeof signingKey !== 'string') throw new Error('signingKey is required')
  const normalizedBase = resolvePrivateWorkerBase(workerBase)
  const pathPart = `/r/${sha256}/${kind}`
  const exp = Math.floor(nowSec) + Math.max(1, Math.floor(ttlSeconds))
  const sig = signPath(signingKey, pathPart, exp)
  const query = `?exp=${exp}&sig=${sig}`
  return normalizedBase ? `${normalizedBase}${pathPart}${query}` : `${pathPart}${query}`
}

/**
 * Constant-time HMAC-SHA256 verification matching `workers/vis-media/src/index.js`.
 */
export function verifyPreviewSignature({
  signingKey,
  pathPart,
  exp,
  sig,
  nowSec = Math.floor(Date.now() / 1000),
}) {
  if (!signingKey || !pathPart || !exp || !sig) return false
  const expStr = String(exp)
  if (!/^\d+$/.test(expStr)) return false
  if (Number(expStr) < Math.floor(nowSec)) return false
  const expected = signPath(signingKey, pathPart, expStr)
  const a = Buffer.from(String(sig), 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Plans Cloudflare R2 `vis-media` keys, Google Drive mirror paths, and usage-edge metadata
 * for passing (`>=26/30`) lifecycle assets without making live network mutations.
 */
export function buildR2DamPlan(assets = [], opts = {}) {
  const bucket = opts.bucket || DEFAULT_R2_BUCKET
  const workerBase = resolvePrivateWorkerBase(opts.workerBase)
  const driveVaultRoot = opts.driveVaultRoot || DEFAULT_DRIVE_VAULT_ROOT
  const endpointPrefix = workerBase || ''

  const uploadManifest = []
  const skipped = []

  for (const asset of assets) {
    const score = asset.qa?.total ?? asset.qaScore?.total ?? 0
    if (!asset.sha256 || !SHA256_RE.test(asset.sha256)) {
      skipped.push({ assetId: asset.assetId, reason: 'missing_valid_sha256' })
      continue
    }
    if (score < 26) {
      skipped.push({ assetId: asset.assetId, reason: `qa_below_gate_${score}` })
      continue
    }
    if (asset.rightsStatus === 'unknown' || asset.rightsStatus === 'blocked') {
      skipped.push({ assetId: asset.assetId, reason: `rights_${asset.rightsStatus}` })
      continue
    }

    const r2Master = masterKey(asset.sha256)
    const r2Thumb = renditionKey(asset.sha256, 'thumb')
    const r2Preview = renditionKey(asset.sha256, 'preview')
    for (const k of [r2Master, r2Thumb, r2Preview]) {
      const check = validateUploadKey(k, asset.sha256)
      if (!check.valid) {
        throw new Error(`Generated invalid R2 upload key (${check.reason}): ${k}`)
      }
    }

    const brand = asset.brand || 'unassigned'
    const rawBase = asset.rawPath ? path.basename(asset.rawPath) : `${asset.assetId}.png`
    const fileBase = rawBase.replace(/[\\/\0<>:"|?*]+/g, '_')
    const usedIn = normalizeUsageEdges(asset.usedIn)

    uploadManifest.push({
      assetId: asset.assetId,
      brand,
      sha256: asset.sha256,
      qaScore: score,
      r2: {
        bucket,
        accessMode: workerBase ? 'private-custom-domain' : 'private-worker-binding',
        masterKey: r2Master,
        thumbKey: r2Thumb,
        previewKey: r2Preview,
        putMasterEndpoint: `${endpointPrefix}/o/${r2Master}`,
        putPreviewEndpoint: `${endpointPrefix}/o/${r2Preview}`,
        putThumbEndpoint: `${endpointPrefix}/o/${r2Thumb}`,
        signedPreviewPattern: `${endpointPrefix}/r/${asset.sha256}/preview?exp=<unix>&sig=<hmac>`,
        signedThumbPattern: `${endpointPrefix}/r/${asset.sha256}/thumb?exp=<unix>&sig=<hmac>`,
      },
      driveMirrorPath: `${driveVaultRoot}/04_APPROVED_MASTERS/${brand}/${fileBase}`,
      derivatives: asset.derivatives || [],
      targetUrls: asset.targetUrls || [],
      usedIn,
      usageCount: usedIn.length,
      hasActivePlacement: usedIn.length > 0,
    })
  }

  return {
    schemaVersion: 'vis.r2-dam-plan.v1',
    generatedAt: new Date().toISOString(),
    dryRun: true,
    bucket,
    workerBase,
    accessMode: workerBase ? 'private-custom-domain' : 'private-worker-binding',
    readyCount: uploadManifest.length,
    skippedCount: skipped.length,
    totalUsageEdges: uploadManifest.reduce((sum, item) => sum + item.usageCount, 0),
    uploadManifest,
    skipped,
  }
}

/**
 * Dry-run reconciliation against a `vis-media` Worker (read-only HEAD + signed preview GET).
 * Never issues PUT or DELETE requests.
 */
export async function reconcileR2DamPlanDryRun(plan, opts = {}) {
  const { fetchImpl, adminToken, signingKey, ttlSeconds = 300, nowSec = Math.floor(Date.now() / 1000) } = opts
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required for dry-run reconciliation')
  if (!adminToken || !signingKey) throw new Error('adminToken and signingKey are required for dry-run reconciliation')
  const workerBase = resolvePrivateWorkerBase(opts.workerBase || plan.workerBase)
  if (!workerBase) {
    throw new Error('A custom HTTPS workerBase is required to dispatch dry-run reconciliation probes')
  }

  const authHeaders = { authorization: `Bearer ${adminToken}` }
  const results = []

  for (const item of plan.uploadManifest || []) {
    const keyChecks = [
      validateUploadKey(item.r2.masterKey, item.sha256),
      validateUploadKey(item.r2.previewKey, item.sha256),
      validateUploadKey(item.r2.thumbKey, item.sha256),
    ]
    const invalidKey = keyChecks.find(c => !c.valid)
    if (invalidKey) {
      results.push({
        assetId: item.assetId,
        sha256: item.sha256,
        status: 'invalid_key',
        reason: invalidKey.reason,
      })
      continue
    }

    const [masterHead, previewHead, thumbHead] = await Promise.all([
      fetchImpl(`${workerBase}/o/${item.r2.masterKey}`, { method: 'HEAD', headers: authHeaders }),
      fetchImpl(`${workerBase}/o/${item.r2.previewKey}`, { method: 'HEAD', headers: authHeaders }),
      fetchImpl(`${workerBase}/o/${item.r2.thumbKey}`, { method: 'HEAD', headers: authHeaders }),
    ])

    const signedPreviewUrl = createSignedPreviewUrl({
      workerBase,
      sha256: item.sha256,
      kind: 'preview',
      signingKey,
      ttlSeconds,
      nowSec,
    })
    const previewGet = await fetchImpl(signedPreviewUrl, { method: 'GET' })
    const unsignedPreviewGet = await fetchImpl(`${workerBase}/r/${item.sha256}/preview`, { method: 'GET' })

    const masterExists = masterHead.status === 200
    const masterShaMatches = !masterExists || masterHead.headers.get('x-content-sha256') === item.sha256
    const previewExists = previewHead.status === 200
    const thumbExists = thumbHead.status === 200
    const signedPreviewOk = previewExists ? previewGet.status === 200 : previewGet.status === 404
    const unsignedDenied = unsignedPreviewGet.status === 401

    const missingKeys = []
    if (!masterExists) missingKeys.push(item.r2.masterKey)
    if (!previewExists) missingKeys.push(item.r2.previewKey)
    if (!thumbExists) missingKeys.push(item.r2.thumbKey)

    results.push({
      assetId: item.assetId,
      sha256: item.sha256,
      masterExists,
      masterShaMatches,
      previewExists,
      thumbExists,
      signedPreviewStatus: previewGet.status,
      signedPreviewOk,
      unsignedDenied,
      missingKeys,
      needsSync: missingKeys.length > 0,
      status: !masterShaMatches
        ? 'checksum_drift'
        : !unsignedDenied || !signedPreviewOk
          ? 'signature_gate_error'
          : missingKeys.length === 0
            ? 'synced'
            : 'pending_upload',
    })
  }

  return {
    schemaVersion: 'vis.r2-dam-reconcile.v1',
    dryRun: true,
    bucket: plan.bucket,
    workerBase,
    checkedCount: results.length,
    syncedCount: results.filter(r => r.status === 'synced').length,
    pendingUploadCount: results.filter(r => r.status === 'pending_upload').length,
    errorCount: results.filter(r => !['synced', 'pending_upload'].includes(r.status)).length,
    results,
  }
}
