import test from 'node:test'
import assert from 'node:assert/strict'
import { routeAssetDestination, routeAndPlanBatch } from '../core/adapters/upload-router.mjs'

test('an unlabelled file stays on the machine', () => {
  const route = routeAssetDestination({
    asset_id: 'x',
    category: 'experiments',
    primary_path: 'notes/sketch.png',
    tags: [],
  })
  assert.equal(route.brand, 'unassigned')
  assert.equal(route.primary, 'local')
  assert.deepEqual(route.destinations, [])
})

test('a Starlight category is not labelled FrankX', () => {
  const route = routeAssetDestination({
    asset_id: 's',
    category: 'Starlight-Intelligence-System',
    primary_path: 'map.png',
    tags: [],
  })
  assert.equal(route.brand, 'starlight')
  assert.equal(route.primary, 'cloudflare-r2')
})

test('video media routes to Cloudflare R2 public-cdn bucket', () => {
  const route = routeAssetDestination({
    asset_id: 'v1',
    category: 'trailers',
    primary_path: 'videos/trailer.mp4',
    tags: ['promo', 'frankx'], // force brand so it bypasses unassigned
    media_type: 'video',
  })
  assert.equal(route.brand, 'frankx')
  assert.equal(route.primary, 'cloudflare-r2')
  assert.equal(route.target_bucket, 'public-cdn')
  assert.deepEqual(route.destinations, ['cloudflare-r2'])
})

test('routeAndPlanBatch batches and plans for multiple destinations', () => {
  const assets = [
    {
      asset_id: 'a1',
      category: 'blog-hero',
      primary_path: 'frankx/hero.png',
      tags: ['hero', 'frankx'], // force brand
      workflow: 'website',
      approval_status: 'approved',
      rights_status: 'owned'
    },
    {
      asset_id: 'a2',
      category: 'nft-collection',
      primary_path: 'arcanea/guardian.png',
      tags: ['nft-mint-ready', 'arcanea'], // force brand
      approval_status: 'approved',
      rights_status: 'owned'
    },
    {
      asset_id: 'a3',
      category: 'general',
      primary_path: 'starlight/bg.png',
      tags: ['starlight'], // force brand
      approval_status: 'approved',
      rights_status: 'owned'
    }
  ]
  const batch = routeAndPlanBatch(assets, { brand: 'all' })
  assert.equal(batch.total_assets, 3)
  assert.equal(batch.summary.vercel_blob_count, 1)
  assert.equal(batch.summary.ipfs_nft_count, 1)
  assert.equal(batch.summary.cloudflare_r2_count, 3) // frankx hero routes to vercel + r2, arcanea nft to ipfs + r2, starlight to r2

  assert.ok(batch.plans.vercel_blob)
  assert.equal(batch.plans.vercel_blob.items.length, 1)

  assert.ok(batch.plans.ipfs_nft)
  assert.equal(batch.plans.ipfs_nft.items.length, 1)

  assert.ok(batch.plans.cloudflare_r2)
  assert.equal(batch.plans.cloudflare_r2.items.length, 3)
})

test('music media routes to Cloudflare R2 music-releases bucket', () => {
  const route = routeAssetDestination({
    asset_id: 'm1',
    category: 'music-releases',
    primary_path: 'music/track.mp3',
    tags: ['music', 'suno'],
    media_type: 'audio',
    workflow: 'music-release',
  })
  assert.equal(route.brand, 'music')
  assert.equal(route.primary, 'cloudflare-r2')
  assert.equal(route.target_bucket, 'music-releases')
  assert.deepEqual(route.destinations, ['cloudflare-r2'])
})
