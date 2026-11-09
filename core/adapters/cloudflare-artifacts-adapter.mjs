/**
 * Cloudflare Artifacts versioned curation & catalog adapter for VIS.
 *
 * Bridges `visual-intelligence` with the 3 sovereign Cloudflare Artifacts
 * brand namespaces on Account 0b5c0d4435bdb220b9ed28efa0a98554:
 *   - `Starlight`  (Starlight SIS, FrankX flagship & shared substrate)
 *   - `Arcanea`    (Arcanea realms, AnimeLegends & narrative IP)
 *   - `GenCreator` (GenCreator templates, funnels & Music IS packs)
 *
 * Safety invariants:
 *   1. Never embeds credentials, API tokens, or OAuth tokens in remote URLs,
 *      Git configs, or curation manifests.
 *   2. Never leaks workstation absolute file paths (Windows drive roots or
 *      POSIX home directories) into committed Artifacts manifests.
 *   3. Refuses unapproved or unknown-rights assets unless `dryRunPreview: true`
 *      is explicitly requested for local inspection.
 */

import path from 'path'
import crypto from 'crypto'
import { isPublishable } from '../storage-sync-engine.mjs'
import { detectAssetBrand } from './upload-router.mjs'

export const DEFAULT_CLOUDFLARE_ACCOUNT_ID = '0b5c0d4435bdb220b9ed28efa0a98554'

export const BRAND_TO_ARTIFACTS_NAMESPACE = {
  starlight: {
    namespace: 'Starlight',
    defaultRepo: 'starter-repo',
  },
  frankx: {
    namespace: 'Starlight',
    defaultRepo: 'starter-repo',
  },
  arcanea: {
    namespace: 'Arcanea',
    defaultRepo: 'world-forge-starter',
  },
  animelegends: {
    namespace: 'Arcanea',
    defaultRepo: 'world-forge-starter',
  },
  gencreator: {
    namespace: 'GenCreator',
    defaultRepo: 'template-factory-starter',
  },
  music: {
    namespace: 'GenCreator',
    defaultRepo: 'template-factory-starter',
  },
}

export function resolveArtifactsTarget(brandOrNamespace = 'starlight', repoOverride = null) {
  const key = String(brandOrNamespace || 'starlight').trim().toLowerCase()
  const mapped = BRAND_TO_ARTIFACTS_NAMESPACE[key] || {
    namespace: 'Starlight',
    defaultRepo: 'starter-repo',
  }
  return {
    namespace: mapped.namespace,
    repo: repoOverride || mapped.defaultRepo,
  }
}

export function sanitizeManifestPath(rawPath = '') {
  const text = String(rawPath || '').replace(/\\/g, '/')
  // Never leak Windows drive roots or home directories into public/versioned manifests.
  const base = path.posix.basename(text)
  return base || 'asset'
}

export function buildArtifactsCurationPacket(assets = [], options = {}) {
  const accountId = options.accountId || DEFAULT_CLOUDFLARE_ACCOUNT_ID
  const brandHint = options.brand || (assets[0] ? detectAssetBrand(assets[0]) : 'starlight')
  const { namespace, repo } = resolveArtifactsTarget(options.namespace || brandHint, options.repo)
  const dryRunPreview = options.dryRunPreview === true

  const accepted = []
  const refused = []

  for (const asset of assets) {
    if (!dryRunPreview && !isPublishable(asset)) {
      refused.push({
        asset_id: asset.asset_id,
        rights_status: asset.rights_status || 'unknown',
        approval_status: asset.approval_status || 'candidate',
        reason: 'Asset must have approval_status=approved and publishable rights before entering an Artifacts release manifest.',
      })
      continue
    }

    const fileName = sanitizeManifestPath(asset.primary_path || asset.relative_path || asset.title)
    const brand = detectAssetBrand(asset)
    const sha256 = asset.sha256 || asset.source_hash || null

    accepted.push({
      asset_id: asset.asset_id,
      sha256,
      title: asset.title || fileName,
      file_name: fileName,
      brand,
      category: asset.category || 'general',
      media_type: asset.media_type || 'image',
      mime_type: asset.mime_type || 'image/webp',
      width: asset.width || null,
      height: asset.height || null,
      byte_size: Number(asset.byte_size || 0),
      rights_status: asset.rights_status,
      approval_status: asset.approval_status,
      tags: Array.isArray(asset.tags) ? asset.tags : [],
      r2_master_key: sha256 ? `masters/${sha256.slice(0, 2)}/${sha256}` : null,
      r2_thumb_key: sha256 ? `renditions/${sha256.slice(0, 2)}/${sha256}.thumb.webp` : null,
      r2_preview_key: sha256 ? `renditions/${sha256.slice(0, 2)}/${sha256}.preview.webp` : null,
    })
  }

  const packetBody = {
    schema: 'starlight.vis.artifacts-curation-packet.v1',
    attestation: 'Built on SIP',
    account_id: accountId,
    namespace,
    repository: repo,
    remote_url: `https://${accountId}.artifacts.cloudflare.net/git/${namespace}/${repo}.git`,
    generated_at: new Date().toISOString(),
    dry_run_preview: dryRunPreview,
    total_accepted: accepted.length,
    total_refused: refused.length,
    assets: accepted,
    refused,
  }

  const packetHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(packetBody.assets))
    .digest('hex')

  return {
    ...packetBody,
    packet_sha256: packetHash,
  }
}

export function buildArtifactsGitPushPlan({
  accountId = DEFAULT_CLOUDFLARE_ACCOUNT_ID,
  namespace = 'Starlight',
  repo = 'starter-repo',
  branch = 'main',
} = {}) {
  const cleanRemote = `https://${accountId}.artifacts.cloudflare.net/git/${namespace}/${repo}.git`
  return {
    namespace,
    repo,
    branch,
    remote_url: cleanRemote,
    credentials_in_remote: false,
    commands: [
      `$tokenObj = npx wrangler artifacts repos issue-token ${repo} --namespace ${namespace} --scope write --ttl 3600 --json | ConvertFrom-Json`,
      `$env:ARTIFACTS_TOKEN = $tokenObj.plaintext`,
      `git remote add artifacts ${cleanRemote}`,
      `git -c "credential.helper=" -c "http.extraHeader=Authorization: Bearer $env:ARTIFACTS_TOKEN" push --no-verify -u artifacts ${branch}`,
      `Remove-Item Env:ARTIFACTS_TOKEN`,
    ],
  }
}
