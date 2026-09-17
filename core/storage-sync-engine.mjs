import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { searchAssets } from './vis-core.mjs'
import { planVercelBlobUpload, executeVercelBlobUpload } from './adapters/vercel-blob-adapter.mjs'
import { planCloudflareR2Upload, executeCloudflareR2Upload } from './adapters/cloudflare-r2-adapter.mjs'
import { planIpfsNftBundle, executeIpfsNftUpload } from './adapters/ipfs-nft-adapter.mjs'
import { routeAssetDestination, routeAndPlanBatch } from './adapters/upload-router.mjs'

export function queryAssetsForStorage(db, options = {}) {
  let query = `
    SELECT 
      a.asset_id,
      a.media_type,
      a.title,
      a.primary_path,
      a.source_hash,
      a.category,
      a.mood,
      a.tags_json,
      a.rights_status,
      a.approval_status,
      v.version_id,
      v.sha256,
      v.mime_type,
      v.byte_size,
      v.width,
      v.height,
      v.metadata_json,
      (SELECT COUNT(*) FROM asset_usage u WHERE u.asset_id = a.asset_id) as usage_count,
      (SELECT custom_tags_json FROM asset_annotation ann WHERE ann.asset_id = a.asset_id) as custom_tags_json
    FROM asset a
    LEFT JOIN asset_version v ON v.asset_id = a.asset_id
    WHERE 1=1
  `
  const params = []

  if (options.approvalStatus) {
    query += ' AND a.approval_status = ?'
    params.push(options.approvalStatus)
  }
  if (options.rightsStatus) {
    query += ' AND a.rights_status = ?'
    params.push(options.rightsStatus)
  }
  if (options.category) {
    query += ' AND a.category LIKE ?'
    params.push(`%${options.category}%`)
  }
  if (options.mediaType) {
    query += ' AND a.media_type = ?'
    params.push(options.mediaType)
  }
  if (options.collection) {
    query += ` AND a.asset_id IN (
      SELECT ci.asset_id FROM collection_item ci 
      JOIN collection c ON c.collection_id = ci.collection_id 
      WHERE c.name LIKE ? OR c.collection_id = ?
    )`
    params.push(`%${options.collection}%`, options.collection)
  }

  query += ' ORDER BY a.first_seen_at DESC'
  if (options.limit) {
    query += ' LIMIT ?'
    params.push(Number(options.limit))
  }

  const rows = db.prepare(query).all(...params)
  return rows.map(row => {
    let tags = []
    try { tags = JSON.parse(row.tags_json || '[]') } catch (_) {}
    let customTags = []
    try { customTags = JSON.parse(row.custom_tags_json || '[]') } catch (_) {}
    let metadata = {}
    try { metadata = JSON.parse(row.metadata_json || '{}') } catch (_) {}

    return {
      asset_id: row.asset_id,
      media_type: row.media_type,
      title: row.title,
      primary_path: row.primary_path,
      path: row.primary_path,
      source_hash: row.source_hash,
      sha256: row.sha256,
      category: row.category,
      mood: row.mood,
      tags: Array.from(new Set([...tags, ...customTags])),
      rights_status: row.rights_status,
      approval_status: row.approval_status,
      byte_size: row.byte_size,
      sizeKB: row.byte_size ? Math.round(row.byte_size / 1024) : 0,
      width: row.width,
      height: row.height,
      usage_count: row.usage_count,
      workflow: metadata.workflow || null,
      color_palette: metadata.palette || null,
    }
  })
}

export function planStorageUpload(db, options = {}) {
  const assets = queryAssetsForStorage(db, options)
  const target = options.target || 'auto'

  if (target === 'vercel-blob') {
    return {
      target: 'vercel-blob',
      plan: planVercelBlobUpload(assets, options),
    }
  }
  if (target === 'cloudflare-r2') {
    return {
      target: 'cloudflare-r2',
      plan: planCloudflareR2Upload(assets, options),
    }
  }
  if (target === 'ipfs' || target === 'ipfs-nft') {
    return {
      target: 'ipfs',
      plan: planIpfsNftBundle(assets, options),
    }
  }

  return {
    target: 'auto-routed',
    plan: routeAndPlanBatch(assets, options),
  }
}

export async function executeStorageUpload(db, plan, options = {}) {
  const target = plan.target || options.target
  let result = null

  if (target === 'vercel-blob') {
    result = await executeVercelBlobUpload(plan.plan || plan, options)
  } else if (target === 'cloudflare-r2') {
    result = await executeCloudflareR2Upload(plan.plan || plan, options)
  } else if (target === 'ipfs' || target === 'ipfs-nft') {
    result = await executeIpfsNftUpload(plan.plan || plan, options)
  } else {
    throw new Error(`Unsupported direct execution target: ${target}. Specify vercel-blob, cloudflare-r2, or ipfs.`)
  }

  // Record successful uploads into storage_object and provenance_event tables
  recordUploadResults(db, result)
  return result
}

export function recordUploadResults(db, executionResult) {
  const ts = new Date().toISOString()
  const provider = executionResult.provider

  const insertStorage = db.prepare(`
    INSERT INTO storage_object (storage_object_id, asset_id, provider, bucket, key, url, checksum, status, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(storage_object_id) DO UPDATE SET
      url = excluded.url,
      status = excluded.status,
      metadata_json = excluded.metadata_json
  `)

  const insertProvenance = db.prepare(`
    INSERT INTO provenance_event (provenance_event_id, asset_id, version_id, event_type, actor, source, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const item of executionResult.results || []) {
    if (item.status === 'uploaded' || item.status === 'pinned') {
      const storageId = `storage_${provider}_${crypto.createHash('md5').update(item.asset_id + provider).digest('hex').slice(0, 12)}`
      const url = item.uploaded_url || item.ipfs_metadata_uri || item.target_url
      const key = item.key || item.pathname || item.metadata_cid || null
      const bucket = item.bucket || executionResult.bucket || (provider === 'ipfs' ? 'pinata' : 'default')

      insertStorage.run(
        storageId,
        item.asset_id,
        provider,
        bucket,
        key,
        url,
        item.sha256 || null,
        'synced',
        JSON.stringify(item),
        ts
      )

      insertProvenance.run(
        `event_${crypto.randomUUID().slice(0, 8)}`,
        item.asset_id,
        item.version_id || null,
        'cloud-storage-synced',
        'vis-storage-engine',
        provider,
        JSON.stringify({ provider, url, key, bucket, uploaded_at: ts }),
        ts
      )
    }
  }
}

export function getStorageStats(db) {
  const totalAssets = db.prepare('SELECT COUNT(*) as count FROM asset').get().count
  const storageObjects = db.prepare(`
    SELECT provider, status, COUNT(*) as count 
    FROM storage_object 
    GROUP BY provider, status
  `).all()

  const providerCounts = {}
  for (const row of storageObjects) {
    if (!providerCounts[row.provider]) providerCounts[row.provider] = 0
    providerCounts[row.provider] += row.count
  }

  return {
    total_local_assets: totalAssets,
    storage_breakdown: providerCounts,
    storage_records: storageObjects,
  }
}
