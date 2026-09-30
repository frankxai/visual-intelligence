import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  openVisDatabase,
  planVercelBlobUpload,
  planCloudflareR2Upload,
  planIpfsNftBundle,
  generateNftMetadata,
  routeAssetDestination,
  routeAndPlanBatch,
  planStorageUpload,
  recordUploadResults,
  getStorageStats,
} from '../core/vis-core.mjs'

test('routes asset destinations based on brand, category, and media role', () => {
  const arcaneaGuardian = {
    asset_id: 'arcanea-1',
    primary_path: 'public/images/guardians/khorvath.webp',
    category: 'arcanea-guardians',
    media_type: 'image',
    tags: ['arcanea', 'fire', 'guardian', 'hero'],
    approval_status: 'approved',
  }
  const route1 = routeAssetDestination(arcaneaGuardian)
  assert.equal(route1.brand, 'arcanea')
  assert.equal(route1.primary, 'cloudflare-r2', 'an approved guardian is not an NFT mint')
  assert.equal(route1.destinations.includes('ipfs-nft'), false)
  assert.ok(route1.destinations.includes('cloudflare-r2'))

  const nftCategoryUnknownRights = {
    asset_id: 'arcanea-2',
    primary_path: 'public/images/guardians/lyssa.webp',
    category: 'nft-collection',
    media_type: 'image',
    tags: ['arcanea', 'nft-mint-ready'],
    approval_status: 'candidate',
    rights_status: 'unknown',
  }
  assert.ok(!routeAssetDestination(nftCategoryUnknownRights).destinations.includes('ipfs-nft'), 'a category name is not approval')

  const musicAsset = {
    asset_id: 'music-1',
    primary_path: 'tracks/song-canvas.mp4',
    category: 'music-releases',
    workflow: 'music-release',
    media_type: 'video',
    media_role: 'music-canvas',
    tags: ['music', 'suno', 'canvas'],
  }
  const route2 = routeAssetDestination(musicAsset)
  assert.equal(route2.primary, 'cloudflare-r2')
  assert.equal(route2.target_bucket, 'music-releases')

  const frankxHero = {
    asset_id: 'frankx-1',
    primary_path: 'public/images/blog/ai-architect.webp',
    category: 'blog-hero',
    workflow: 'website',
    media_type: 'image',
    tags: ['hero', 'frankx', 'architecture'],
    usage_count: 2,
  }
  const route3 = routeAssetDestination(frankxHero)
  assert.equal(route3.brand, 'frankx')
  assert.equal(route3.primary, 'vercel-blob')
  assert.ok(route3.destinations.includes('vercel-blob'))
})

test('generates compliant ERC-721 / Metaplex NFT metadata for Arcanea assets', () => {
  const asset = {
    asset_id: 'test-guardian',
    title: 'Aiyami Guardian of Wisdom',
    primary_path: 'public/images/guardians/aiyami.png',
    category: 'arcanea-guardians',
    media_type: 'image',
    tags: ['arcanea', 'light', 'crown'],
    mood: 'cinematic',
    rights_status: 'generated-owned',
    palette: { dominant: '#7fffd4' },
    notes: 'Crown Guardian embodying 741Hz frequency and enlightenment.',
  }

  const metadata = generateNftMetadata(asset, {
    collectionName: 'Arcanea Guardians',
    imageCid: 'bafybeic7guardian123',
  })

  assert.equal(metadata.name, 'Aiyami Guardian of Wisdom')
  assert.equal(metadata.image, 'ipfs://bafybeic7guardian123')
  assert.equal(metadata.compiler, 'Visual Intelligence OS / Arcanea Creator Engine')
  
  const classTrait = metadata.attributes.find(a => a.trait_type === 'Class')
  assert.equal(classTrait?.value, 'Guardian')
  
  const elementTrait = metadata.attributes.find(a => a.trait_type === 'Element')
  assert.equal(elementTrait?.value, 'Light')

  const dominantTrait = metadata.attributes.find(a => a.trait_type === 'Dominant Color')
  assert.equal(dominantTrait?.value, '#7fffd4')
})

test('plans multi-cloud storage upload manifests and records SQLite storage objects', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-storage-test-'))
  const db = openVisDatabase(tmpDir, { indexPath: 'data/vis.sqlite' })

  try {
    // Insert mock asset
    db.prepare(`
      INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'mock-asset-1',
      'image',
      'FrankX Hero Visual',
      'public/images/heroes/hero-1.webp',
      'hash123',
      'heroes',
      'atmospheric',
      JSON.stringify(['hero', 'frankx']),
      'generated-owned',
      'approved',
      new Date().toISOString(),
      new Date().toISOString()
    )

    db.prepare(`
      INSERT INTO asset_version (version_id, asset_id, sha256, media_type, mime_type, byte_size, width, height, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'v-1',
      'mock-asset-1',
      'sha256abc',
      'image',
      'image/webp',
      500000,
      1920,
      1080,
      new Date().toISOString(),
      JSON.stringify({ workflow: 'website' })
    )

    // Plan Vercel Blob upload
    const vercelPlan = planStorageUpload(db, { target: 'vercel-blob', brand: 'frankx' })
    assert.equal(vercelPlan.target, 'vercel-blob')
    assert.equal(vercelPlan.plan.total_assets, 1)
    assert.equal(vercelPlan.plan.items[0].pathname, 'frankx/heroes/hero-1.webp')

    // Plan Cloudflare R2 upload
    const r2Plan = planStorageUpload(db, { target: 'cloudflare-r2', bucket: 'media-masters' })
    assert.equal(r2Plan.target, 'cloudflare-r2')
    assert.equal(r2Plan.plan.items[0].key, 'heroes/hero-1.webp')

    // Record mock upload result in SQLite
    recordUploadResults(db, {
      provider: 'cloudflare-r2',
      bucket: 'media-masters',
      results: [
        {
          asset_id: 'mock-asset-1',
          status: 'uploaded',
          uploaded_url: 'https://media.arcanea.ai/heroes/hero-1.webp',
          key: 'heroes/hero-1.webp',
          sha256: 'sha256abc',
        },
      ],
    })

    const stats = getStorageStats(db)
    assert.equal(stats.total_local_assets, 1)
    assert.equal(stats.storage_breakdown['cloudflare-r2'], 1)
  } finally {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
