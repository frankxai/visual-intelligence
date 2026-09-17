import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json',
}

export function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_MAP[ext] || 'application/octet-stream'
}

export function planVercelBlobUpload(assets, options = {}) {
  const brandPrefix = options.brand ? `${slugify(options.brand)}/` : ''
  const publicBaseUrl = options.baseUrl || 'https://public.blob.vercel-storage.com'

  const items = assets.map((asset, index) => {
    const filePath = asset.primary_path || asset.absolute_path || asset.path
    const filename = path.basename(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mimeType = getMimeType(filePath)
    const category = slugify(asset.category || 'general')
    const pathname = `${brandPrefix}${category}/${filename}`
    const expectedUrl = `${publicBaseUrl.replace(/\/$/, '')}/${pathname}`
    const sizeBytes = Number(asset.byte_size || (asset.sizeKB ? Math.round(asset.sizeKB * 1024) : 0))

    const isOversized = sizeBytes > 4.5 * 1024 * 1024 // 4.5MB edge limit
    const warnings = []
    if (isOversized) warnings.push('Exceeds standard 4.5MB Vercel edge upload threshold without streaming')
    if (asset.approval_status !== 'approved') warnings.push(`Asset approval status is "${asset.approval_status || 'candidate'}"`)

    return {
      index: index + 1,
      asset_id: asset.asset_id,
      title: asset.title || filename,
      source_path: filePath,
      pathname,
      target_url: expectedUrl,
      media_type: asset.media_type,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      size_kb: Number((sizeBytes / 1024).toFixed(1)),
      approval_status: asset.approval_status || 'candidate',
      rights_status: asset.rights_status || 'unknown',
      warnings,
    }
  })

  return {
    provider: 'vercel-blob',
    generated_at: new Date().toISOString(),
    total_assets: items.length,
    total_bytes: items.reduce((sum, item) => sum + item.size_bytes, 0),
    total_mb: Number((items.reduce((sum, item) => sum + item.size_bytes, 0) / (1024 * 1024)).toFixed(2)),
    options: {
      brand: options.brand || 'all',
      baseUrl: publicBaseUrl,
    },
    items,
  }
}

export async function executeVercelBlobUpload(manifest, options = {}) {
  const token = options.token || process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required in environment or options to execute Vercel Blob upload')
  }

  const results = []
  for (const item of manifest.items) {
    if (!fs.existsSync(item.source_path)) {
      results.push({
        ...item,
        status: 'failed',
        error: `Source file not found: ${item.source_path}`,
      })
      continue
    }

    try {
      const fileBuffer = fs.readFileSync(item.source_path)
      const res = await fetch(`https://blob.vercel-storage.com/${item.pathname}`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token}`,
          'x-content-type': item.mime_type,
          'x-add-random-suffix': options.addRandomSuffix ? '1' : '0',
        },
        body: fileBuffer,
      })

      if (!res.ok) {
        const errorText = await res.text()
        results.push({
          ...item,
          status: 'failed',
          error: `HTTP ${res.status}: ${errorText}`,
        })
      } else {
        const payload = await res.json()
        results.push({
          ...item,
          status: 'uploaded',
          uploaded_url: payload.url || item.target_url,
          download_url: payload.downloadUrl || payload.url,
          uploaded_at: new Date().toISOString(),
        })
      }
    } catch (err) {
      results.push({
        ...item,
        status: 'failed',
        error: err.message,
      })
    }
  }

  return {
    provider: 'vercel-blob',
    executed_at: new Date().toISOString(),
    total: results.length,
    uploaded_count: results.filter(r => r.status === 'uploaded').length,
    failed_count: results.filter(r => r.status === 'failed').length,
    results,
  }
}

function slugify(value) {
  return String(value || 'asset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'asset'
}
