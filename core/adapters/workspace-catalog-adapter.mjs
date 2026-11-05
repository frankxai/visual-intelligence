import fs from 'node:fs'
import path from 'node:path'
import { openVisDatabaseReadOnly, getAsset, listAssets } from '../vis-core.mjs'

/** A server-enrolled existing SQLite catalog. Never accepts a path from tool input. */
export function createWorkspaceCatalogAdapter({ workspaceId, indexPath, renditionsDir, poolLimit = 10000 }) {
  if (!workspaceId || !path.isAbsolute(indexPath) || !path.isAbsolute(renditionsDir) || !Number.isInteger(poolLimit) || poolLimit < 1 || poolLimit > 10000) throw new Error('Invalid catalog enrollment')
  const read = (context, fn) => {
    if (context.workspaceId !== workspaceId) throw new Error('workspace_forbidden')
    const db = openVisDatabaseReadOnly(indexPath)
    try { db.exec('BEGIN'); return fn(db) } finally { db.close() }
  }
  const coverage = db => {
    const row = db.prepare('SELECT COUNT(*) AS n, MAX(last_seen_at) AS indexed_at FROM asset').get()
    return { asset_count: row.n, indexed_at: row.indexed_at, exhaustive: row.n <= poolLimit }
  }
  const tagsOf = a => { try { return JSON.parse(a.tags_json || '[]') } catch { return [] } }
  const hasPreview = (db, assetId, hash) => {
    try { return !!db.prepare("SELECT 1 FROM asset_rendition WHERE asset_id=? AND sha256=? AND kind IN ('thumb','preview') LIMIT 1").get(assetId, hash) }
    catch { return false }
  }
  const rowFor = (db, a, v) => ({ ...a, ...v, asset_id: a.asset_id, tags: tagsOf(a), preview_available: hasPreview(db, a.asset_id, v.sha256) })
  return {
    describe(context) { return read(context, db => coverage(db)) },
    search(args, context) {
      return read(context, db => {
        const tokens = (args.query || '').toLowerCase().split(/\s+/).filter(Boolean)
        const rows = listAssets(db, { limit: poolLimit }).filter(a => {
          const tags = tagsOf(a)
          if (args.brand && !tags.includes('brand:' + args.brand)) return false
          if (args.character && !tags.includes('character:' + args.character)) return false
          if (args.approval_status && a.approval_status !== args.approval_status) return false
          if (args.aspect === 'square' && !(a.width === a.height && a.width > 0)) return false
          if (args.aspect === 'landscape' && !(a.width > a.height && a.height > 0)) return false
          if (args.aspect === 'portrait' && !(a.height > a.width && a.width > 0)) return false
          const hay = [a.asset_id, a.title, ...tags].join(' ').toLowerCase()
          return tokens.every(t => hay.includes(t))
        })
        const limit = args.limit || 12
        return { assets: rows.slice(0, limit).map(a => ({ ...rowFor(db, a, a), match_reason: tokens.length ? 'Matched all query terms in title, identity or tags.' : 'Matched requested metadata filters.' })), coverage: { ...coverage(db), exhaustive: coverage(db).exhaustive && rows.length <= limit } }
      })
    },
    get(assetId, versionId, context) {
      return read(context, db => {
        // IDs only. getAsset also supports paths locally; that convenience is not exposed remotely.
        const a = db.prepare('SELECT * FROM asset WHERE asset_id=?').get(assetId)
        if (!a) return null
        const full = getAsset(db, assetId)
        const version = full.versions.find(v => versionId ? v.version_id === versionId : true)
        if (!version) return null
        return { ...rowFor(db, a, version), provenance: full.generation_events.map(e => ({ provider: e.provider, model: e.model, recorded_at: e.created_at })) }
      })
    },
    preview(assetId, versionId, context) {
      return read(context, db => {
        const version = db.prepare('SELECT sha256 FROM asset_version WHERE asset_id=? AND version_id=?').get(assetId, versionId)
        if (!version) return null
        let r
        try { r = db.prepare("SELECT * FROM asset_rendition WHERE asset_id=? AND sha256=? AND kind IN ('thumb','preview') ORDER BY CASE kind WHEN 'thumb' THEN 0 ELSE 1 END LIMIT 1").get(assetId, version.sha256) } catch { return null }
        if (!r || r.storage !== 'local' || !r.path || !['image/png','image/jpeg','image/webp'].includes(r.mime_type)) return null
        const root = fs.realpathSync(renditionsDir), target = fs.realpathSync(r.path)
        const relative = path.relative(root, target)
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
        const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
        try {
          const stat = fs.fstatSync(fd)
          if (!stat.isFile() || stat.size > 1024 * 1024) return null
          const buffer = Buffer.alloc(1024 * 1024 + 1)
          const count = fs.readSync(fd, buffer, 0, buffer.length, 0)
          if (count > 1024 * 1024) return null
          const bytes = buffer.subarray(0, count)
          const valid = r.mime_type === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : r.mime_type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP'
          return valid ? { data: bytes.toString('base64'), mimeType: r.mime_type } : null
        } finally { fs.closeSync(fd) }
      })
    },
  }
}
