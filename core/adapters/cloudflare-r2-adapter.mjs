import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getMimeType } from './vercel-blob-adapter.mjs'
import { validateUploadKey, resolvePrivateWorkerBase, DEFAULT_R2_BUCKET } from '../vis-r2-dam-plan.mjs'
import { evaluateUploadAgainstPreset } from '../vis-dam-layers.mjs'

export function planCloudflareR2Upload(assets, options = {}) {
  const bucket = options.bucket || 'media-masters'
  const brand = options.brand ? slugify(options.brand) : null
  const publicDomain = options.publicDomain || (brand === 'arcanea' ? 'https://media.arcanea.ai' : (brand === 'frankx' ? 'https://assets.frankx.ai' : 'https://cdn.starlightintelligence.ai'))

  const items = assets.map((asset, index) => {
    const filePath = asset.primary_path || asset.absolute_path || asset.path
    const filename = path.basename(filePath)
    const category = slugify(asset.category || 'general')
    const key = brand ? `${brand}/${category}/${filename}` : `${category}/${filename}`
    const expectedCdnUrl = `${publicDomain.replace(/\/$/, '')}/${key}`
    const mimeType = getMimeType(filePath)
    const sizeBytes = Number(asset.byte_size || (asset.sizeKB ? Math.round(asset.sizeKB * 1024) : 0))

    let sha256 = asset.sha256 || asset.source_hash || null
    if (!sha256 && fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath)
      sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex')
    }

    return {
      index: index + 1,
      asset_id: asset.asset_id,
      title: asset.title || filename,
      source_path: filePath,
      bucket,
      key,
      target_url: expectedCdnUrl,
      media_type: asset.media_type,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      size_mb: Number((sizeBytes / (1024 * 1024)).toFixed(2)),
      sha256,
      approval_status: asset.approval_status || 'candidate',
      rights_status: asset.rights_status || 'unknown',
    }
  })

  return {
    provider: 'cloudflare-r2',
    bucket,
    generated_at: new Date().toISOString(),
    total_assets: items.length,
    total_bytes: items.reduce((sum, item) => sum + item.size_bytes, 0),
    total_mb: Number((items.reduce((sum, item) => sum + item.size_bytes, 0) / (1024 * 1024)).toFixed(2)),
    options: {
      bucket,
      brand: brand || 'all',
      publicDomain,
    },
    items,
  }
}

export async function executeCloudflareR2Upload(manifest, options = {}) {
  const accountId = options.accountId || process.env.CLOUDFLARE_R2_ACCOUNT_ID
  const accessKeyId = options.accessKeyId || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = options.secretAccessKey || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  const endpoint = options.endpoint || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : process.env.CLOUDFLARE_R2_ENDPOINT)

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 credentials (CLOUDFLARE_R2_ACCOUNT_ID/ENDPOINT, ACCESS_KEY_ID, SECRET_ACCESS_KEY) are required to execute upload')
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
      const uploadUrl = `${endpoint.replace(/\/$/, '')}/${item.bucket}/${encodeURIComponent(item.key).replace(/%2F/g, '/')}`
      
      // Compute AWS Signature V4 Headers for S3-compatible R2 endpoint
      const headers = signAwsV4({
        method: 'PUT',
        url: uploadUrl,
        body: fileBuffer,
        accessKeyId,
        secretAccessKey,
        region: 'auto',
        service: 's3',
        contentType: item.mime_type,
      })

      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers,
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
        results.push({
          ...item,
          status: 'uploaded',
          uploaded_url: item.target_url,
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
    provider: 'cloudflare-r2',
    bucket: manifest.bucket,
    executed_at: new Date().toISOString(),
    total: results.length,
    uploaded_count: results.filter(r => r.status === 'uploaded').length,
    failed_count: results.filter(r => r.status === 'failed').length,
    results,
  }
}

function signAwsV4({ method, url, body, accessKeyId, secretAccessKey, region = 'auto', service = 's3', contentType }) {
  const parsed = new URL(url)
  const host = parsed.host
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const payloadHash = crypto.createHash('sha256').update(body).digest('hex')
  const canonicalUri = parsed.pathname
  const canonicalQuery = parsed.search.slice(1)

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  return {
    'content-type': contentType,
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    authorization: `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

function hmac(key, str) {
  return crypto.createHmac('sha256', key).update(str).digest()
}

function slugify(value) {
  return String(value || 'asset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'asset'
}

/**
 * Generates an AWS S3v4 pre-signed URL for Cloudflare R2 without third-party SDK dependencies.
 * Enforces VIS key hygiene and blocks DELETE against immutable `masters/` and `renditions/` prefixes.
 */
export function createR2PresignedUrl({
  method = 'GET',
  bucket = DEFAULT_R2_BUCKET,
  key,
  endpoint,
  accountId,
  accessKeyId,
  secretAccessKey,
  expiresIn = 300,
  contentType = null,
  contentSha256 = undefined,
  now = new Date(),
}) {
  const upperMethod = String(method || 'GET').toUpperCase()
  if (!['GET', 'HEAD', 'PUT', 'DELETE'].includes(upperMethod)) {
    throw new Error(`Unsupported R2 presign HTTP method: ${upperMethod}`)
  }
  if (!key || typeof key !== 'string') {
    throw new Error('R2 object key is required')
  }
  if (key.includes('\0') || key.includes('\\') || key.includes('..') || /%2e|%2f|%5c/i.test(key)) {
    throw new Error(`Unsafe R2 object key rejected: ${key}`)
  }
  if (/^(masters|renditions|derived|test)\//.test(key)) {
    const check = validateUploadKey(key, contentSha256)
    if (!check.valid) {
      throw new Error(`Invalid R2 key (${check.reason}): ${key}`)
    }
  }
  if (upperMethod === 'DELETE' && (key.startsWith('masters/') || key.startsWith('renditions/'))) {
    throw new Error(`DELETE presign refused for immutable prefix: ${key}`)
  }

  const baseEndpoint = endpoint || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null)
  if (!baseEndpoint) throw new Error('R2 endpoint or accountId is required')
  const parsedEndpoint = new URL(baseEndpoint)
  if (parsedEndpoint.protocol !== 'https:') {
    throw new Error('R2 endpoint must use https:')
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('accessKeyId and secretAccessKey are required to presign R2 URLs')
  }

  const cleanExpires = Math.max(1, Math.min(3600, Math.floor(Number(expiresIn) || 300)))
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const encodedKey = key.split('/').map(seg => encodeURIComponent(seg)).join('/')
  const canonicalUri = `/${encodeURIComponent(bucket)}/${encodedKey}`

  const signedHeaderNames = ['host']
  const headerLines = [`host:${parsedEndpoint.host}`]
  const requiredHeaders = {}
  if (contentType && upperMethod === 'PUT') {
    signedHeaderNames.push('content-type')
    headerLines.push(`content-type:${contentType}`)
    requiredHeaders['content-type'] = contentType
  }
  if (contentSha256 && upperMethod === 'PUT') {
    requiredHeaders['x-content-sha256'] = contentSha256
  }
  signedHeaderNames.sort()
  headerLines.sort()

  const signedHeaders = signedHeaderNames.join(';')
  const canonicalHeaders = `${headerLines.join('\n')}\n`

  const queryParams = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(cleanExpires)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ].sort(([a], [b]) => a.localeCompare(b))

  const canonicalQuery = queryParams
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const canonicalRequest = `${upperMethod}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  const url = `${parsedEndpoint.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
  const expiresAt = new Date(now.getTime() + cleanExpires * 1000).toISOString()

  return {
    method: upperMethod,
    bucket,
    key,
    url,
    expiresIn: cleanExpires,
    expiresAt,
    signedHeaders,
    headers: requiredHeaders,
  }
}

/**
 * Dry-run planner for content-addressed Cloudflare R2 intake with upload preset & private Worker endpoint checks.
 */
export function planContentAddressedR2Intake({
  preset = 'brand_hero_intake',
  filename,
  mimeType,
  byteSize,
  sha256,
  metadata = {},
  bucket = DEFAULT_R2_BUCKET,
  workerBase = null,
}) {
  const normalizedBase = resolvePrivateWorkerBase(workerBase)
  const evaluation = evaluateUploadAgainstPreset({
    preset,
    filename,
    mimeType,
    byteSize,
    sha256,
    metadata,
    bucket,
  })
  const endpointPrefix = normalizedBase || ''
  return {
    schemaVersion: 'vis.r2-intake-plan.v1',
    dryRun: true,
    ...evaluation,
    workerBase: normalizedBase,
    putMasterEndpoint: evaluation.key ? `${endpointPrefix}/o/${evaluation.key}` : null,
    transformPaths: evaluation.sha256
      ? evaluation.autoTransforms.map(t => ({
          preset: t.preset,
          canonical: t.canonical,
          path: `${endpointPrefix}/t/${evaluation.sha256}/${t.canonical}`,
        }))
      : [],
  }
}
