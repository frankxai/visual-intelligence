import test from 'node:test'
import assert from 'node:assert/strict'
import { planCloudflareR2Upload } from '../core/adapters/cloudflare-r2-adapter.mjs'

test('planCloudflareR2Upload generates correct manifest with default options', () => {
  const assets = [
    {
      asset_id: 'asset1',
      primary_path: 'mock/path/test-image.jpg',
      category: 'blog-hero',
      sha256: 'mockhash1',
      media_type: 'image',
      sizeKB: 1024,
      approval_status: 'approved',
      rights_status: 'owned'
    }
  ]

  const manifest = planCloudflareR2Upload(assets)

  assert.equal(manifest.provider, 'cloudflare-r2')
  assert.equal(manifest.bucket, 'media-masters')
  assert.equal(manifest.total_assets, 1)
  assert.equal(manifest.total_bytes, 1048576) // 1024 * 1024
  assert.equal(manifest.total_mb, 1)

  const item = manifest.items[0]
  assert.equal(item.asset_id, 'asset1')
  assert.equal(item.bucket, 'media-masters')
  assert.equal(item.key, 'blog-hero/test-image.jpg')
  assert.equal(item.target_url, 'https://cdn.starlightintelligence.ai/blog-hero/test-image.jpg')
  assert.equal(item.sha256, 'mockhash1')
  assert.equal(item.mime_type, 'image/jpeg')
})

test('planCloudflareR2Upload applies brand routing (arcanea) correctly', () => {
  const assets = [
    {
      asset_id: 'asset2',
      primary_path: 'mock/video.mp4',
      category: 'trailers',
      sha256: 'mockhash2',
      media_type: 'video',
      byte_size: 5242880 // 5 MB
    }
  ]

  const manifest = planCloudflareR2Upload(assets, { brand: 'arcanea', bucket: 'public-cdn' })

  assert.equal(manifest.bucket, 'public-cdn')
  assert.equal(manifest.total_assets, 1)
  assert.equal(manifest.total_bytes, 5242880)
  assert.equal(manifest.total_mb, 5)

  const item = manifest.items[0]
  assert.equal(item.bucket, 'public-cdn')
  assert.equal(item.key, 'arcanea/trailers/video.mp4')
  assert.equal(item.target_url, 'https://media.arcanea.ai/arcanea/trailers/video.mp4')
  assert.equal(item.sha256, 'mockhash2')
  assert.equal(item.mime_type, 'video/mp4')
  assert.equal(item.approval_status, 'candidate') // default
  assert.equal(item.rights_status, 'unknown') // default
})

test('planCloudflareR2Upload applies brand routing (frankx) correctly', () => {
  const assets = [
    {
      asset_id: 'asset3',
      primary_path: 'logo.png',
      sha256: 'mockhash3',
      media_type: 'image',
      byte_size: 104857
    }
  ]

  const manifest = planCloudflareR2Upload(assets, { brand: 'frankx' })

  const item = manifest.items[0]
  assert.equal(item.key, 'frankx/general/logo.png')
  assert.equal(item.target_url, 'https://assets.frankx.ai/frankx/general/logo.png')
  assert.equal(item.sha256, 'mockhash3')
})

test('planCloudflareR2Upload uses publicDomain option if specified', () => {
  const assets = [
    {
      asset_id: 'asset4',
      primary_path: 'song.mp3',
      sha256: 'mockhash4',
      category: 'music-releases'
    }
  ]

  const manifest = planCloudflareR2Upload(assets, { publicDomain: 'https://music.example.com/' })
  const item = manifest.items[0]

  // Note: key has no brand prefix, domain comes from publicDomain config. Trims trailing slash.
  assert.equal(item.target_url, 'https://music.example.com/music-releases/song.mp3')
})

test('planCloudflareR2Upload computes exact sizes across multiple assets', () => {
  const assets = [
    { asset_id: 'a1', primary_path: 'f1.jpg', sha256: 'h1', byte_size: 500000 },
    { asset_id: 'a2', primary_path: 'f2.png', sha256: 'h2', sizeKB: 1000 } // 1024000 bytes
  ]

  const manifest = planCloudflareR2Upload(assets)
  assert.equal(manifest.total_assets, 2)
  assert.equal(manifest.total_bytes, 1524000)
  assert.equal(manifest.total_mb, 1.45) // (1524000 / 1048576).toFixed(2) == 1.45
})
