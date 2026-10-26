/**
 * Google Drive Creative Vault intake & proposal adapter (VIS-007).
 *
 * Strictly read-only and human-gated:
 * - Parses the canonical Starlight Creative Vault folder taxonomy:
 *     01_INBOX_RAW
 *     02_BRAND_VAULTS/{FrankX,Arcanea,Starlight,Music_IS,AnimeLegends}
 *     03_PRODUCTION_PROJECTS
 *     04_APPROVED_MASTERS
 *     05_ARCHIVE_COLD
 * - Supports both local Google Drive for Desktop mirrors and Google Drive API v3
 *   file/change records.
 * - Every newly discovered Drive asset starts with `rights_status: 'unknown'`
 *   and `approval_status: 'candidate'`. Folder placement never silently grants
 *   rights or publishes; instead, it emits structured VIS proposals (`tags`,
 *   `set`, `rights`) for human review in `vis library serve`.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const DRIVE_VAULT_TIERS = {
  '01_INBOX_RAW': {
    tier: 'inbox-raw',
    stage: 'intake',
    proposedSet: 'drive-inbox',
    proposeRightsHint: null,
  },
  '02_BRAND_VAULTS': {
    tier: 'brand-vault',
    stage: 'curated',
    proposedSet: 'brand-vault',
    proposeRightsHint: null,
  },
  '03_PRODUCTION_PROJECTS': {
    tier: 'production-project',
    stage: 'work-in-progress',
    proposedSet: 'production-projects',
    proposeRightsHint: null,
  },
  '04_APPROVED_MASTERS': {
    tier: 'approved-master',
    stage: 'master-candidate',
    proposedSet: 'approved-masters',
    // Even in 04_APPROVED_MASTERS, a human must accept the proposal in VIS before rights change.
    proposeRightsHint: 'generated-owned',
  },
  '05_ARCHIVE_COLD': {
    tier: 'archive-cold',
    stage: 'archived',
    proposedSet: 'cold-archive',
    proposeRightsHint: null,
  },
}

const BRAND_FOLDER_MAP = {
  frankx: 'frankx',
  'frankx-ai': 'frankx',
  arcanea: 'arcanea',
  starlight: 'starlight',
  'starlight-sis': 'starlight',
  music_is: 'music',
  'music-is': 'music',
  vibe_os: 'music',
  animelegends: 'animelegends',
  'anime-legends': 'animelegends',
  gencreator: 'gencreator',
}

const SUPPORTED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg',
  '.mp4', '.webm', '.mov', '.m4v', '.mp3', '.wav', '.flac',
])

export function parseDriveVaultPath(relativePath = '') {
  const normalized = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)

  let tierKey = null
  let tierIndex = -1
  for (let i = 0; i < segments.length; i++) {
    const upper = segments[i].toUpperCase()
    if (DRIVE_VAULT_TIERS[upper]) {
      tierKey = upper
      tierIndex = i
      break
    }
  }

  const tierInfo = tierKey
    ? DRIVE_VAULT_TIERS[tierKey]
    : {
        tier: 'unclassified-drive',
        stage: 'intake',
        proposedSet: 'drive-unclassified',
        proposeRightsHint: null,
      }

  let brand = 'unassigned'
  const afterTier = tierIndex >= 0 ? segments.slice(tierIndex + 1) : segments
  for (const seg of afterTier) {
    const slug = seg.toLowerCase().replace(/[^a-z0-9_-]+/g, '')
    if (BRAND_FOLDER_MAP[slug]) {
      brand = BRAND_FOLDER_MAP[slug]
      break
    }
  }

  const tags = new Set(['source:gdrive', `tier:${tierInfo.tier}`])
  if (brand !== 'unassigned') tags.add(`brand:${brand}`)
  if (afterTier.length > 1) {
    const subFolder = afterTier[afterTier.length - 2]
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '')
    if (subFolder && !BRAND_FOLDER_MAP[subFolder]) {
      tags.add(`folder:${subFolder}`)
    }
  }

  return {
    relative_path: normalized,
    tier_key: tierKey,
    tier: tierInfo.tier,
    stage: tierInfo.stage,
    brand,
    proposed_set: tierInfo.proposedSet,
    proposed_rights_hint: tierInfo.proposeRightsHint,
    tags: Array.from(tags),
  }
}

export function buildDriveAssetProposals(assetId, parsedPath, actor = 'vis-gdrive-adapter') {
  if (!assetId) throw new Error('assetId is required to build Drive proposals')
  const now = new Date().toISOString()
  const proposals = []

  if (parsedPath.tags && parsedPath.tags.length > 0) {
    proposals.push({
      proposal_id: `prop_tags_${crypto.createHash('sha1').update(`${assetId}:${parsedPath.relative_path}:tags`).digest('hex').slice(0, 12)}`,
      asset_id: assetId,
      kind: 'tags',
      rule: 'gdrive-vault-taxonomy',
      payload_json: JSON.stringify({ add: parsedPath.tags }),
      rationale: `Derived from Google Drive Creative Vault path (${parsedPath.relative_path || 'root'})`,
      proposed_by: actor,
      status: 'open',
      created_at: now,
    })
  }

  if (parsedPath.proposed_set) {
    const setName = parsedPath.brand !== 'unassigned'
      ? `${parsedPath.brand}-${parsedPath.proposed_set}`
      : parsedPath.proposed_set
    proposals.push({
      proposal_id: `prop_set_${crypto.createHash('sha1').update(`${assetId}:${setName}:set`).digest('hex').slice(0, 12)}`,
      asset_id: assetId,
      kind: 'set',
      rule: 'gdrive-vault-taxonomy',
      payload_json: JSON.stringify({ set: setName }),
      rationale: `Folder tier ${parsedPath.tier_key || 'default'} maps to collection ${setName}`,
      proposed_by: actor,
      status: 'open',
      created_at: now,
    })
  }

  if (parsedPath.proposed_rights_hint) {
    proposals.push({
      proposal_id: `prop_rights_${crypto.createHash('sha1').update(`${assetId}:${parsedPath.proposed_rights_hint}:rights`).digest('hex').slice(0, 12)}`,
      asset_id: assetId,
      kind: 'rights',
      rule: 'gdrive-approved-masters-folder-hint',
      payload_json: JSON.stringify({ rights_status: parsedPath.proposed_rights_hint }),
      rationale: 'Located in 04_APPROVED_MASTERS; requires explicit human acceptance before rights change from unknown.',
      proposed_by: actor,
      status: 'open',
      created_at: now,
    })
  }

  return proposals
}

export function normalizeDriveApiFile(driveFile = {}, options = {}) {
  if (!driveFile || (!driveFile.id && !driveFile.name)) {
    throw new Error('Invalid Google Drive file record: missing id or name')
  }
  const relativePath = driveFile.vaultPath || driveFile.path || driveFile.name
  const parsed = parseDriveVaultPath(relativePath)
  const sha256 = driveFile.sha256Checksum || driveFile.sha256 || null
  const assetId = sha256
    ? `asset_${sha256.slice(0, 16)}`
    : `asset_gdrive_${crypto.createHash('sha256').update(String(driveFile.id || relativePath)).digest('hex').slice(0, 16)}`

  // Invariant: Drive intake never auto-grants rights or approval.
  const record = {
    asset_id: assetId,
    drive_file_id: driveFile.id || null,
    title: path.basename(driveFile.name || relativePath),
    relative_path: parsed.relative_path,
    brand: parsed.brand,
    category: parsed.brand !== 'unassigned' ? `${parsed.brand}-${parsed.tier}` : parsed.tier,
    mime_type: driveFile.mimeType || 'application/octet-stream',
    byte_size: Number(driveFile.size || 0),
    sha256,
    md5_checksum: driveFile.md5Checksum || null,
    web_view_link: driveFile.webViewLink || null,
    modified_time: driveFile.modifiedTime || null,
    source_kind: 'google-drive-vault',
    rights_status: 'unknown',
    approval_status: 'candidate',
    tags: parsed.tags,
  }

  const proposals = buildDriveAssetProposals(
    assetId,
    parsed,
    options.actor || 'vis-gdrive-adapter'
  )

  return { record, proposals, taxonomy: parsed }
}

export function scanDriveVaultMirror(vaultRootDir, options = {}) {
  if (!vaultRootDir || !fs.existsSync(vaultRootDir)) {
    throw new Error(`Google Drive vault mirror directory not found: ${vaultRootDir}`)
  }
  const limit = Number(options.limit || 250)
  const discovered = []

  function walk(currentDir) {
    if (discovered.length >= limit) return
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      if (discovered.length >= limit) break
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'desktop.ini') {
        continue
      }
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue
        const stat = fs.statSync(fullPath)
        const sha256 = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex')
        const relPath = path.relative(vaultRootDir, fullPath).replace(/\\/g, '/')
        const normalized = normalizeDriveApiFile(
          {
            id: `mirror_${sha256.slice(0, 12)}`,
            name: entry.name,
            vaultPath: relPath,
            size: stat.size,
            sha256Checksum: sha256,
            modifiedTime: stat.mtime.toISOString(),
          },
          options
        )
        discovered.push(normalized)
      }
    }
  }

  walk(vaultRootDir)

  return {
    source: 'google-drive-mirror',
    scanned_at: new Date().toISOString(),
    total_discovered: discovered.length,
    items: discovered,
  }
}
