#!/usr/bin/env node
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const TABLES = ['asset', 'asset_version', 'asset_location', 'asset_usage', 'prompt',
  'generation_event', 'eval_record', 'publication', 'storage_object', 'feedback_outbox']

export function buildCoverage(db, { now = new Date(), sampleLimit = 8 } = {}) {
  if (!Number.isInteger(sampleLimit) || sampleLimit < 0 || sampleLimit > 100) {
    throw new Error('sampleLimit must be an integer from 0 to 100')
  }
  const present = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name))
  const missing = TABLES.filter(table => !present.has(table))
  if (missing.length) throw new Error(`Unsupported VIS index: missing tables ${missing.join(', ')}. No migration was attempted.`)
  const count = query => Number(db.prepare(query).get().n)
  const records = Object.fromEntries(TABLES.map(table => [table, count(`SELECT COUNT(*) AS n FROM ${table}`)]))
  const latest = db.prepare('SELECT MIN(first_seen_at) AS first_seen, MAX(last_seen_at) AS last_seen FROM asset').get()
  const lastSeenMs = latest.last_seen ? Date.parse(latest.last_seen) : NaN
  const groups = (column, table) => db.prepare(`SELECT ${column} AS value, COUNT(*) AS count FROM ${table} GROUP BY ${column} ORDER BY count DESC`).all()
  const coverage = db.prepare(`
    WITH p AS (SELECT DISTINCT asset_id FROM prompt WHERE LENGTH(TRIM(COALESCE(prompt_text, ''))) > 0),
    g AS (SELECT DISTINCT asset_id FROM generation_event
      WHERE LENGTH(TRIM(COALESCE(model, ''))) > 0 AND LENGTH(TRIM(COALESCE(provider, ''))) > 0),
    e AS (SELECT DISTINCT asset_id FROM eval_record),
    u AS (SELECT DISTINCT asset_id FROM asset_usage),
    l AS (SELECT DISTINCT asset_id FROM asset_location WHERE exists_now = 1),
    s AS (SELECT DISTINCT asset_id FROM storage_object WHERE status IN ('uploaded', 'pinned')),
    pub AS (SELECT DISTINCT asset_id FROM publication WHERE status IN ('published', 'live')
      AND LENGTH(TRIM(COALESCE(url, ''))) > 0 AND LENGTH(TRIM(COALESCE(published_at, ''))) > 0)
    SELECT a.media_type, COUNT(*) AS assets,
      COUNT(p.asset_id) AS with_prompt_text, COUNT(g.asset_id) AS with_model_and_provider,
      COUNT(e.asset_id) AS with_evaluation_record, COUNT(u.asset_id) AS with_source_usage,
      COUNT(l.asset_id) AS with_location_last_recorded_present,
      COUNT(s.asset_id) AS with_recorded_upload, COUNT(pub.asset_id) AS with_publication_receipt
    FROM asset a LEFT JOIN p USING(asset_id) LEFT JOIN g USING(asset_id)
    LEFT JOIN e USING(asset_id) LEFT JOIN u USING(asset_id) LEFT JOIN l USING(asset_id)
    LEFT JOIN s USING(asset_id) LEFT JOIN pub USING(asset_id)
    GROUP BY a.media_type ORDER BY assets DESC
  `).all()
  const promptGap = db.prepare(`SELECT a.asset_id, a.title, a.primary_path,
    (SELECT COUNT(*) FROM asset_usage u WHERE u.asset_id = a.asset_id) AS source_usage_edges
    FROM asset a WHERE a.media_type = 'image' AND NOT EXISTS
      (SELECT 1 FROM prompt p WHERE p.asset_id = a.asset_id AND LENGTH(TRIM(COALESCE(p.prompt_text, ''))) > 0)
    ORDER BY source_usage_edges DESC, a.asset_id LIMIT ?`).all(sampleLimit)
  return {
    schema: 'vis.asset-coverage.v1', observed_at: now.toISOString(),
    scope: 'Stored VIS records only; no filesystem scan, provider sync, visual inspection, or live URL verification.',
    freshness: {
      first_asset_seen_at: latest.first_seen, last_asset_seen_at: latest.last_seen,
      days_since_last_asset_observation: Number.isFinite(lastSeenMs)
        ? Math.max(0, Math.floor((now.getTime() - lastSeenMs) / 86400000)) : null,
    },
    record_counts: records, coverage_by_media_type: coverage,
    rights: groups('rights_status', 'asset'), approvals: groups('approval_status', 'asset'),
    recorded_models: db.prepare('SELECT model, provider, COUNT(*) AS records FROM generation_event GROUP BY model, provider ORDER BY records DESC').all(),
    provider_locations: db.prepare('SELECT provider, storage_kind, COUNT(*) AS records FROM asset_location GROUP BY provider, storage_kind ORDER BY records DESC').all(),
    queues: { image_prompt_gap_sample: promptGap },
    interpretation: {
      downloaded: 'A location marked present reflects its last scan; original bytes and checksum must be checked again before claiming a current download.',
      processed: 'Prompt, evaluation, upload, and publication coverage are separate facts. None implies the next stage.',
      model_identity: 'Model/provider strings are historical supplied labels, not independently verified model identities.',
      taste: 'Evaluation records are coverage only. File extension, byte size, and existing readiness scores do not establish aesthetic quality.',
      usage: 'Source usage edges are detected references. A publication receipt is a recorded URL/date/status, not a fresh live-site check.',
      cloud: 'Missing provider records mean unknown reconciliation; they do not prove a cloud file is absent.',
      privacy: 'This report includes local paths and model labels. Keep it private; commit only the reusable script.',
    },
  }
}

export function auditIndex(indexPath, options) {
  const db = new DatabaseSync(path.resolve(indexPath), { readOnly: true })
  try {
    db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 2000; BEGIN')
    const result = buildCoverage(db, options)
    db.exec('COMMIT')
    return result
  } finally {
    db.close()
  }
}

function main(args) {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/asset-coverage.mjs --index <existing-vis.sqlite> [--limit 0..100]')
    console.log('Read-only JSON to stdout. Keep output private. Does not initialize or migrate the index.')
    return
  }
  let indexPath
  let sampleLimit = 8
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--index' && args[i + 1]) indexPath = args[++i]
    else if (args[i] === '--limit' && args[i + 1]) sampleLimit = Number(args[++i])
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`)
  }
  if (!indexPath) throw new Error('--index must name an existing VIS SQLite file')
  console.log(JSON.stringify(auditIndex(indexPath, { sampleLimit }), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)) } catch (error) {
    console.error(`VIS coverage audit failed: ${error.message}`)
    process.exitCode = 1
  }
}
