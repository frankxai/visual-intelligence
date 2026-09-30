import { planVercelBlobUpload } from './vercel-blob-adapter.mjs'
import { planCloudflareR2Upload } from './cloudflare-r2-adapter.mjs'
import { planIpfsNftBundle } from './ipfs-nft-adapter.mjs'

export const BRAND_CONFIGS = {
  frankx: {
    name: 'FrankX Demand',
    website: 'https://frankx.ai',
    primaryStorage: 'vercel-blob',
    backupStorage: 'cloudflare-r2',
    defaultBucket: 'public-cdn',
    blobPrefix: 'frankx',
  },
  arcanea: {
    name: 'Arcanea Product & IP',
    website: 'https://arcanea.ai',
    primaryStorage: 'cloudflare-r2',
    nftStorage: 'ipfs-nft',
    defaultBucket: 'public-cdn',
    blobPrefix: 'arcanea',
  },
  starlight: {
    name: 'Starlight Substrate',
    website: 'https://starlightintelligence.ai',
    primaryStorage: 'cloudflare-r2',
    backupStorage: 'vercel-blob',
    defaultBucket: 'media-masters',
    blobPrefix: 'starlight',
  },
  music: {
    name: 'Music Intelligence / Vibe OS',
    website: 'https://frankx.ai/music',
    primaryStorage: 'cloudflare-r2',
    defaultBucket: 'music-releases',
    blobPrefix: 'music',
  },
  animelegends: {
    name: 'Anime Legends / Media IP',
    website: 'https://animelegends.ai',
    primaryStorage: 'cloudflare-r2',
    nftStorage: 'ipfs-nft',
    defaultBucket: 'public-cdn',
    blobPrefix: 'animelegends',
  },
}

export function routeAssetDestination(asset) {
  const brand = detectAssetBrand(asset)
  if (brand === 'unassigned') {
    return {
      asset_id: asset.asset_id,
      brand,
      primary: 'local',
      destinations: [],
      target_bucket: null,
      reasons: ['Unclassified asset stays on the machine until a brand is set'],
    }
  }
  const explicitNftIntent = asset.workflow === 'nft-mint' || (asset.tags || []).includes('nft-mint-ready') || asset.category === 'nft-collection' || asset.target_storage === 'ipfs-nft'
  // NFT routing needs explicit intent AND a publishable record; a category name is not approval.
  const isNft = explicitNftIntent && asset.approval_status === 'approved' && ['owned', 'generated-owned', 'licensed'].includes(asset.rights_status)
  const isMusic = asset.workflow === 'music-release' || asset.media_type === 'audio' || ['cover-art', 'music-canvas', 'music-stem'].includes(asset.media_role) || asset.category === 'music-releases'
  const isWebHero = (asset.tags || []).includes('hero') || asset.workflow === 'website' || (asset.usage_count && Number(asset.usage_count) > 0)
  const isVideo = asset.media_type === 'video'

  const destinations = []
  let primary = 'cloudflare-r2'
  let targetBucket = 'media-masters'
  let reasons = []

  if (isMusic) {
    primary = 'cloudflare-r2'
    targetBucket = 'music-releases'
    destinations.push('cloudflare-r2')
    reasons.push('Music IS release media (covers, Canvas, audio stems) routes to Cloudflare R2 music-releases bucket')
  } else if (isNft) {
    primary = 'ipfs-nft'
    targetBucket = 'public-cdn'
    destinations.push('ipfs-nft', 'cloudflare-r2')
    reasons.push('Verified NFT release asset routes to IPFS for permanent token metadata & R2 for CDN delivery')
  } else if (isWebHero && brand === 'frankx') {
    primary = 'vercel-blob'
    targetBucket = 'public-cdn'
    destinations.push('vercel-blob', 'cloudflare-r2')
    reasons.push('Active FrankX web asset routes to Vercel Blob for edge performance and R2 for master archive')
  } else if (isVideo) {
    primary = 'cloudflare-r2'
    targetBucket = 'public-cdn'
    destinations.push('cloudflare-r2')
    reasons.push('Video media routes to Cloudflare R2 / Stream for high-bandwidth zero-egress playback')
  } else {
    primary = 'cloudflare-r2'
    targetBucket = 'media-masters'
    destinations.push('cloudflare-r2')
    reasons.push('General asset archive routes to Cloudflare R2 media-masters')
  }

  return {
    asset_id: asset.asset_id,
    brand,
    primary,
    destinations,
    target_bucket: targetBucket,
    reasons,
  }
}

export function detectAssetBrand(asset) {
  const cat = String(asset.category || '').toLowerCase()
  const pathText = String(asset.primary_path || asset.absolute_path || asset.path || '').toLowerCase()
  const relPath = String(asset.relative_path || '').toLowerCase()
  const tags = (asset.tags || []).map(t => String(t).toLowerCase())

  // Check specific repo names and brand tokens before generic estate path matches
  if (cat.includes('frankx') || relPath.includes('frankx') || tags.includes('frankx') || pathText.includes('frankx.ai')) return 'frankx'
  if (cat.includes('arcanea') || relPath.includes('arcanea') || tags.includes('arcanea') || pathText.includes('arcanea')) return 'arcanea'
  if (cat.includes('anime') || relPath.includes('animelegends') || tags.includes('animelegends') || pathText.includes('animelegends')) return 'animelegends'
  if (cat.includes('music') || relPath.includes('music') || tags.includes('music') || pathText.includes('music-releases') || pathText.includes('suno')) return 'music'
  if (cat.includes('starlight') || relPath.includes('starlight-') || tags.includes('starlight') || pathText.includes('starlight-intelligence') || pathText.includes('starlightintelligence')) return 'starlight'

  return 'unassigned'
}

export function routeAndPlanBatch(assets, options = {}) {
  const routed = assets.map(a => ({ asset: a, route: routeAssetDestination(a) }))

  const vercelAssets = routed.filter(r => r.route.destinations.includes('vercel-blob')).map(r => r.asset)
  const r2Assets = routed.filter(r => r.route.destinations.includes('cloudflare-r2')).map(r => r.asset)
  const ipfsAssets = routed.filter(r => r.route.destinations.includes('ipfs-nft')).map(r => r.asset)

  return {
    total_assets: assets.length,
    generated_at: new Date().toISOString(),
    summary: {
      vercel_blob_count: vercelAssets.length,
      cloudflare_r2_count: r2Assets.length,
      ipfs_nft_count: ipfsAssets.length,
    },
    plans: {
      vercel_blob: vercelAssets.length ? planVercelBlobUpload(vercelAssets, options) : null,
      cloudflare_r2: r2Assets.length ? planCloudflareR2Upload(r2Assets, options) : null,
      ipfs_nft: ipfsAssets.length ? planIpfsNftBundle(ipfsAssets, options) : null,
    },
  }
}
