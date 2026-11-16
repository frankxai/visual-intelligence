import path from 'path'
import { masterKey, renditionKey } from './vis-storage.mjs'

/**
 * Plans Cloudflare R2 `vis-media` keys, Google Drive mirror paths, and Vercel edge delivery slots
 * for passing (`>=26/30`) lifecycle assets without making live network mutations.
 */
export function buildR2DamPlan(assets = [], opts = {}) {
  const bucket = opts.bucket || 'starlight-media-lake'
  const workerBase = (opts.workerBase || 'https://vis-media.starlightintelligence.workers.dev').replace(/\/$/, '')
  const driveVaultRoot = opts.driveVaultRoot || 'Google Drive/Starlight Creative Vault'

  const uploadManifest = []
  const skipped = []

  for (const asset of assets) {
    const score = asset.qa?.total ?? asset.qaScore?.total ?? 0
    if (!asset.sha256 || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
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
    const brand = asset.brand || 'unassigned'
    const fileBase = asset.rawPath ? path.basename(asset.rawPath) : `${asset.assetId}.png`

    uploadManifest.push({
      assetId: asset.assetId,
      brand,
      sha256: asset.sha256,
      qaScore: score,
      r2: {
        bucket,
        masterKey: r2Master,
        thumbKey: r2Thumb,
        previewKey: r2Preview,
        putMasterEndpoint: `${workerBase}/o/${r2Master}`,
        putPreviewEndpoint: `${workerBase}/o/${r2Preview}`,
        putThumbEndpoint: `${workerBase}/o/${r2Thumb}`,
        signedPreviewPattern: `${workerBase}/r/${asset.sha256}/preview?exp=<unix>&sig=<hmac>`,
      },
      driveMirrorPath: `${driveVaultRoot}/04_APPROVED_MASTERS/${brand}/${fileBase}`,
      derivatives: asset.derivatives || [],
      targetUrls: asset.targetUrls || [],
    })
  }

  return {
    schemaVersion: 'vis.r2-dam-plan.v1',
    generatedAt: new Date().toISOString(),
    dryRun: true,
    bucket,
    workerBase,
    readyCount: uploadManifest.length,
    skippedCount: skipped.length,
    uploadManifest,
    skipped,
  }
}
