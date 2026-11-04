/**
 * VIS Placement Comparison Studio (VIS-029)
 *
 * Evaluates and compares 1-6 candidate visual assets inside authentic brand
 * placement frames (FrankX Hero, Arcanea Lore Card, GenCreator Product Box,
 * Starlight OpenGraph Social, and Music IS Square Cover).
 *
 * Read-only by default: never mutates rights, never uploads, and never exposes
 * workstation paths. Emits deterministic fit scores, mobile safe-crop diagnostics,
 * publish-gate blockers, and Cloudflare Artifacts / Derivative Plan handoffs.
 */

import { assetPublishGate, getAsset, resolveAssetId } from './vis-core.mjs'

export const PLACEMENT_FRAMES = Object.freeze([
  {
    id: 'frankx-hero',
    brand: 'frankx',
    title: 'FrankX Flagship Hero (16:9)',
    aspectRatioLabel: '16:9',
    aspectRatio: 16 / 9,
    targetWidth: 1280,
    targetHeight: 720,
    minWidth: 1200,
    minHeight: 630,
    surface: {
      bg: '#090A0F',
      border: '#1E293B',
      accent: '#38BDF8',
      text: '#F8FAFC',
      muted: '#94A3B8',
    },
    overlay: {
      eyebrow: 'AI ARCHITECT · ENTERPRISE SYSTEMS',
      headline: 'Build Sovereign Intelligence Systems',
      subhead: 'Production agent architectures, visual provenance, and high-velocity execution.',
      cta: 'Explore the Blueprint →',
    },
    mobileSafeCrop: {
      widthRatio: 0.56,
      label: '375px Mobile Viewport Safe Zone',
    },
    derivativePresetId: 'website',
    artifactsNamespace: 'Starlight',
    defaultRepo: 'frankx-web-assets',
  },
  {
    id: 'arcanea-lore-card',
    brand: 'arcanea',
    title: 'Arcanea Canon Gate / Tome Card (4:5)',
    aspectRatioLabel: '4:5',
    aspectRatio: 4 / 5,
    targetWidth: 1080,
    targetHeight: 1350,
    minWidth: 800,
    minHeight: 1000,
    surface: {
      bg: '#07080D',
      border: '#D4AF37',
      accent: '#D4AF37',
      text: '#F5F0E6',
      muted: '#C8B99E',
    },
    overlay: {
      eyebrow: 'GATE VII · CROWN OF ENLIGHTENMENT',
      headline: 'Aiyami — Guardian of the Seventh Gate',
      subhead: 'Canon-locked visual plate verified against CANON_LOCKED.md.',
      cta: 'Inspect Canon Record',
    },
    mobileSafeCrop: {
      widthRatio: 0.84,
      label: 'Portrait Feed Safe Zone',
    },
    derivativePresetId: 'nft',
    artifactsNamespace: 'Arcanea',
    defaultRepo: 'world-forge-starter',
  },
  {
    id: 'gencreator-product-box',
    brand: 'gencreator',
    title: 'GenCreator Digital Product Box (16:10)',
    aspectRatioLabel: '16:10',
    aspectRatio: 16 / 10,
    targetWidth: 1440,
    targetHeight: 900,
    minWidth: 1200,
    minHeight: 750,
    surface: {
      bg: '#0B0F17',
      border: '#2DD4BF',
      accent: '#2DD4BF',
      text: '#F1F5F9',
      muted: '#94A3B8',
    },
    overlay: {
      eyebrow: 'GENCREATOR TEMPLATE OS · INSTANT DELIVERY',
      headline: 'Visual Intelligence & Agent Pack',
      subhead: 'Includes MCP tools, provenance sidecars, and Cloudflare Artifacts templates.',
      cta: 'Get the Pack · €67',
    },
    mobileSafeCrop: {
      widthRatio: 0.65,
      label: 'Storefront Card Crop',
    },
    derivativePresetId: 'website',
    artifactsNamespace: 'GenCreator',
    defaultRepo: 'template-factory-starter',
  },
  {
    id: 'starlight-og-social',
    brand: 'starlight',
    title: 'Starlight OpenGraph / Social Card (1.91:1)',
    aspectRatioLabel: '1.91:1',
    aspectRatio: 1200 / 630,
    targetWidth: 1200,
    targetHeight: 630,
    minWidth: 1200,
    minHeight: 630,
    surface: {
      bg: '#05060A',
      border: '#7CB7FF',
      accent: '#7CB7FF',
      text: '#F2F5FA',
      muted: '#929AB0',
    },
    overlay: {
      eyebrow: 'STARLIGHT INTELLIGENCE PROTOCOL',
      headline: 'Built on SIP · Sovereign Memory & Media',
      subhead: 'Zero-hallucination provenance spine across 6 semantic vaults.',
      cta: 'starlightintelligence.ai',
    },
    mobileSafeCrop: {
      widthRatio: 0.75,
      label: 'Social Feed Timeline Crop',
    },
    derivativePresetId: 'social',
    artifactsNamespace: 'Starlight',
    defaultRepo: 'starter-repo',
  },
  {
    id: 'music-is-canvas-cover',
    brand: 'music',
    title: 'Music IS Square Release Cover (1:1)',
    aspectRatioLabel: '1:1',
    aspectRatio: 1,
    targetWidth: 3000,
    targetHeight: 3000,
    minWidth: 1000,
    minHeight: 1000,
    surface: {
      bg: '#08070C',
      border: '#F5C45D',
      accent: '#F5C45D',
      text: '#FAF8F5',
      muted: '#B8B2A6',
    },
    overlay: {
      eyebrow: 'VIBE OS · MUSIC INTELLIGENCE SYSTEM',
      headline: 'Release Master Preflight',
      subhead: 'Music IS remains canonical for release state, credits, and DSP distribution.',
      cta: 'Music IS Preflight',
    },
    mobileSafeCrop: {
      widthRatio: 0.9,
      label: 'DSP Square Thumbnail Zone',
    },
    derivativePresetId: 'music-release',
    artifactsNamespace: 'Starlight',
    defaultRepo: 'starter-repo',
  },
])

export function listPlacementFrames() {
  return PLACEMENT_FRAMES.map(frame => ({
    ...frame,
    surface: { ...frame.surface },
    overlay: { ...frame.overlay },
    mobileSafeCrop: { ...frame.mobileSafeCrop },
  }))
}

export function getPlacementFrame(frameId = 'frankx-hero') {
  const normalized = String(frameId || 'frankx-hero').trim().toLowerCase()
  const found = PLACEMENT_FRAMES.find(
    frame => frame.id === normalized || frame.brand === normalized,
  )
  return found || PLACEMENT_FRAMES[0]
}

function readCandidateDimensions(db, asset) {
  const version = asset.versions?.[0] || {}
  let width = Number(version.width || asset.width || 0)
  let height = Number(version.height || asset.height || 0)
  let thumbhash = null
  let hasPreviewRendition = false

  try {
    const renditions = db.prepare(
      'SELECT kind, width, height, data_text FROM asset_rendition WHERE asset_id = ?',
    ).all(asset.asset_id)
    const preview = renditions.find(r => r.kind === 'preview')
    const thumb = renditions.find(r => r.kind === 'thumb')
    const th = renditions.find(r => r.kind === 'thumbhash')
    if (preview) {
      hasPreviewRendition = true
      if (!width && preview.width) width = Number(preview.width)
      if (!height && preview.height) height = Number(preview.height)
    }
    if (!width && thumb?.width) width = Number(thumb.width)
    if (!height && thumb?.height) height = Number(thumb.height)
    if (th?.data_text) thumbhash = th.data_text
  } catch {
    // asset_rendition table may not exist in minimal non-library DB fixtures.
  }

  return {
    width: width > 0 ? width : null,
    height: height > 0 ? height : null,
    thumbhash,
    hasPreviewRendition,
  }
}

function scoreAspectAndResolution(frame, dims, mimeType = '') {
  const isVector = String(mimeType || '').includes('svg')
  if (isVector) {
    return {
      score: 35,
      aspectDeltaPct: 0,
      cropWarning: null,
      upscaleWarning: null,
      fitLabel: 'vector-exact',
    }
  }

  if (!dims.width || !dims.height) {
    return {
      score: 20,
      aspectDeltaPct: null,
      cropWarning: 'Raster dimensions not indexed yet; run library ingest or verify crop in frame.',
      upscaleWarning: null,
      fitLabel: 'unverified-dimensions',
    }
  }

  const actualRatio = dims.width / dims.height
  const ratioDelta = Math.abs(actualRatio - frame.aspectRatio) / frame.aspectRatio
  const aspectDeltaPct = Math.round(ratioDelta * 100)

  let aspectPts = 20
  let cropWarning = null
  if (ratioDelta <= 0.05) {
    aspectPts = 20
  } else if (ratioDelta <= 0.18) {
    aspectPts = 16
    cropWarning = `Minor crop (${aspectDeltaPct}% aspect delta vs ${frame.aspectRatioLabel})`
  } else if (ratioDelta <= 0.35) {
    aspectPts = 11
    cropWarning = `Moderate crop (${aspectDeltaPct}% aspect delta vs ${frame.aspectRatioLabel}); check mobile safe zone`
  } else {
    aspectPts = 5
    cropWarning = `Heavy crop (${aspectDeltaPct}% aspect delta vs ${frame.aspectRatioLabel}); consider reframing`
  }

  let resPts = 15
  let upscaleWarning = null
  if (dims.width >= frame.targetWidth && dims.height >= frame.targetHeight) {
    resPts = 15
  } else if (dims.width >= frame.minWidth && dims.height >= frame.minHeight) {
    resPts = 12
  } else {
    resPts = 5
    upscaleWarning = `Below minimum frame resolution (${dims.width}x${dims.height} < ${frame.minWidth}x${frame.minHeight})`
  }

  const total = aspectPts + resPts
  const fitLabel = total >= 32 ? 'native-fit' : total >= 24 ? 'acceptable-crop' : 'needs-reframe'

  return {
    score: total,
    aspectDeltaPct,
    cropWarning,
    upscaleWarning,
    fitLabel,
  }
}

export function evaluateCandidateInFrame(db, asset, frame) {
  const dims = readCandidateDimensions(db, asset)
  const gate = assetPublishGate(asset, { intendedUse: `${frame.brand} ${frame.derivativePresetId}` })
  const version = asset.versions?.[0] || {}
  const fit = scoreAspectAndResolution(frame, dims, version.mime_type || asset.media_type)

  // Rights & publish gate score (0-30)
  const clearedRights = new Set(['owned', 'generated-owned', 'licensed'])
  let rightsScore = 0
  if (gate.allowed && clearedRights.has(asset.rights_status)) {
    rightsScore = 30
  } else if (clearedRights.has(asset.rights_status)) {
    rightsScore = 22
  } else if (asset.rights_status === 'blocked') {
    rightsScore = 0
  } else {
    rightsScore = 10
  }

  // Provenance & hash integrity score (0-20)
  let provenanceScore = 0
  if (asset.source_hash && /^[a-f0-9]{64}$/i.test(asset.source_hash)) provenanceScore += 10
  if ((asset.prompts && asset.prompts.length > 0) || (asset.provenance && asset.provenance.length > 0)) provenanceScore += 5
  if (dims.hasPreviewRendition || (asset.versions && asset.versions.length > 0)) provenanceScore += 5

  // Operator curation rank & palette signal (0-15)
  const rating = Number(asset.annotation?.rating || 0)
  const rankScore = Math.min(10, rating * 2)
  const paletteScore = (dims.thumbhash || version.palette?.dominant_hex) ? 5 : 2
  const curationScore = rankScore + paletteScore

  const totalScore = Math.min(100, fit.score + rightsScore + provenanceScore + curationScore)

  return {
    asset_id: asset.asset_id,
    visual_uri: `visual://asset/${asset.asset_id}`,
    title: asset.title,
    media_type: asset.media_type,
    category: asset.category || 'uncategorized',
    source_hash: asset.source_hash,
    rights_status: asset.rights_status,
    approval_status: asset.approval_status,
    rating,
    width: dims.width,
    height: dims.height,
    thumbhash: dims.thumbhash,
    dominant_hex: version.palette?.dominant_hex || null,
    thumb_url: `/r/${asset.asset_id}/thumb`,
    preview_url: `/r/${asset.asset_id}/preview`,
    publish_gate: gate,
    scores: {
      total: totalScore,
      fit: fit.score,
      rights: rightsScore,
      provenance: provenanceScore,
      curation: curationScore,
    },
    diagnostics: {
      fit_label: fit.fitLabel,
      aspect_delta_pct: fit.aspectDeltaPct,
      crop_warning: fit.cropWarning,
      upscale_warning: fit.upscaleWarning,
      blockers: gate.blockers || [],
    },
  }
}

export function compareAssetPlacements(db, options = {}) {
  const frame = getPlacementFrame(options.frameId || options.frame || options.brand || 'frankx-hero')
  const rawRefs = Array.isArray(options.assetIds)
    ? options.assetIds
    : Array.isArray(options.assets)
      ? options.assets
      : String(options.assetIds || options.assets || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)

  let targetIds = []
  const notFound = []
  for (const ref of rawRefs.slice(0, 6)) {
    const resolved = resolveAssetId(db, ref)
    if (resolved) {
      if (!targetIds.includes(resolved)) targetIds.push(resolved)
    } else {
      notFound.push(String(ref))
    }
  }

  // If no explicit assets were passed, pick up to 4 top-ranked or recent image assets for studio preview.
  if (targetIds.length === 0) {
    const fallbackRows = db.prepare(`
      SELECT a.asset_id
      FROM asset a
      LEFT JOIN asset_annotation an ON an.asset_id = a.asset_id
      WHERE a.media_type = 'image'
      ORDER BY COALESCE(an.rating, 0) DESC, a.last_seen_at DESC, a.asset_id ASC
      LIMIT 4
    `).all()
    targetIds = fallbackRows.map(r => r.asset_id)
  }

  const candidates = targetIds
    .map(id => getAsset(db, id))
    .filter(Boolean)
    .map(asset => evaluateCandidateInFrame(db, asset, frame))
    .sort((a, b) => {
      if (b.scores.total !== a.scores.total) return b.scores.total - a.scores.total
      return a.asset_id.localeCompare(b.asset_id)
    })
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }))

  const publishableWinner = candidates.find(c => c.publish_gate.allowed)
  const winner = publishableWinner || candidates[0] || null
  const repoName = options.repoName || options.repo || frame.defaultRepo

  const handoff = winner
    ? {
        recommended_asset_id: winner.asset_id,
        recommended_title: winner.title,
        publish_ready: winner.publish_gate.allowed,
        gate_note: winner.publish_gate.allowed
          ? 'Publish gate open. Ready for Cloudflare Artifacts curation packet or derivative plan.'
          : `Publish gate closed (${winner.diagnostics.blockers.join('; ')}). Clear rights/approval before external publication.`,
        cli_artifacts_command: `vis artifacts-pack --brand ${frame.brand} --repo ${repoName} --collection ${frame.id}`,
        cli_derivative_command: `vis derivative-plan --preset ${frame.derivativePresetId} --assets ${winner.asset_id}`,
        mcp_artifacts_tool: {
          tool: 'build_artifacts_curation_packet',
          arguments: {
            brand: frame.brand,
            namespace: frame.artifactsNamespace,
            repo: repoName,
          },
        },
      }
    : null

  return {
    studio_version: '1.0.0',
    dryRun: true,
    mutated: false,
    frame,
    candidate_count: candidates.length,
    not_found: notFound,
    candidates,
    winner: winner
      ? {
          asset_id: winner.asset_id,
          title: winner.title,
          total_score: winner.scores.total,
          publish_ready: winner.publish_gate.allowed,
          fit_label: winner.diagnostics.fit_label,
        }
      : null,
    handoff,
  }
}
