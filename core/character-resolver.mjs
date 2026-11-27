// Character resolver: name or alias -> immutable identity ID + evidence, from an authorised harvest manifest.
// Read-only. Never sets rights or approval, never writes R2, never fuzzy-merges aliases.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { SHA256_RE, cacheDir, cacheHas, cacheKey } from './character-cache.mjs'
import { join } from 'node:path'

export const characterSchema = {
  type: 'object', additionalProperties: false, required: ['name'],
  properties: { name: { type: 'string', minLength: 1 } },
}

const STATUSES = new Set(['original', 'proposal', 'rejected', 'not accessible'])
// Rejected lineages can never be positive references, whatever a manifest row claims.
const REJECTED_LINEAGE = [/arcanea[\s_-]*fire/i, /\bunity[\s_-]*v?[12]\b/i]
const VENDOR_GUEST = [/\bclawd\b/i, /\bclaude\b/i, /\bcodex[\s_-]*pets?\b/i, /\bgithub[\s_-]*mona\b/i, /^mona$/i]

export const normalize = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const splitList = v => Array.isArray(v) ? v.map(String)
  : typeof v === 'string' ? v.split(/[;|]/).map(s => s.trim()).filter(Boolean) : []

const isRejectedLineage = row => REJECTED_LINEAGE.some(re => [row.family, row.edition, row.identity_name, row.stable_id].some(f => re.test(String(f ?? ''))))
const isVendorGuest = (row, names) => [row.identity_name, ...names].some(n => VENDOR_GUEST.some(re => re.test(String(n ?? '').trim())))

export async function loadManifest(path = process.env.VIS_CHARACTER_MANIFEST) {
  if (!path) return { ok: false, reason: 'manifest_unavailable' }
  let text
  try { text = await readFile(path, 'utf8') } catch { return { ok: false, reason: 'manifest_unreadable' } }
  try {
    let rows
    const t = text.trim()
    if (t.startsWith('[') || t.startsWith('{') && !t.includes('\n{')) {
      const j = JSON.parse(t)
      rows = Array.isArray(j) ? j : j.rows ?? j.records
    } else rows = t.split('\n').filter(Boolean).map(l => JSON.parse(l))
    if (!Array.isArray(rows)) throw new Error('not rows')
    return { ok: true, rows, manifest_sha256: createHash('sha256').update(text).digest('hex') }
  } catch { return { ok: false, reason: 'manifest_invalid' } }
}

function buildIndex(rows) {
  const identities = new Map() // identity_name -> { name, rows, aliases:Set }
  for (const row of rows) {
    const name = String(row.identity_name ?? '').trim()
    if (!name) continue
    const e = identities.get(name) ?? { name, rows: [], aliases: new Set() }
    e.rows.push(row); splitList(row.aliases).forEach(a => e.aliases.add(a))
    identities.set(name, e)
  }
  return identities
}

function identityId(entry, conflicts) {
  const ids = [...new Set(entry.rows.map(r => String(r.stable_id ?? '').trim()).filter(Boolean))]
  if (ids.length === 1) return ids[0]
  if (ids.length > 1) conflicts.push({ type: 'multiple_stable_ids', stable_ids: ids })
  return 'vis.char.' + createHash('sha256').update(normalize(entry.name)).digest('hex').slice(0, 16)
}

const dist1 = (a, b) => { // Damerau distance <= 1 (substitution, insert, delete, adjacent swap)
  if (a === b || Math.abs(a.length - b.length) > 1) return false
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++
  const x = a.slice(i), y = b.slice(i)
  if (x.length === y.length) return x.slice(1) === y.slice(1) || (x[0] === y[1] && x[1] === y[0] && x.slice(2) === y.slice(2))
  const [l, s] = x.length > y.length ? [x, y] : [y, x]
  return l.slice(1) === s
}

export async function resolveCharacter(request, { manifestPath, cache } = {}) {
  const base = { schema: 'vis.character.resolve/v1', publish_authorized: false, rights: 'unknown', approval: 'unknown', rights_set_by: null }
  const name = typeof request?.name === 'string' ? request.name.trim() : ''
  if (!name) return { ...base, status: 'unresolved', reason: 'name_required' }
  const m = await loadManifest(manifestPath)
  if (!m.ok) return { ...base, status: 'unresolved', reason: m.reason }

  const identities = buildIndex(m.rows)
  const key = normalize(name)
  const hits = [...identities.values()].filter(e => normalize(e.name) === key || [...e.aliases].some(a => normalize(a) === key))
  if (hits.length === 0) return { ...base, status: 'not_found', reason: 'no_exact_name_or_alias', query: name, manifest_sha256: m.manifest_sha256 }

  const confusable = (entry, matchedAlias) => {
    const out = []
    for (const other of identities.values()) for (const a of [other.name, ...other.aliases]) {
      const na = normalize(a), nm = normalize(matchedAlias)
      if (na !== nm && dist1(na, nm) && !(other === entry && a === matchedAlias)) out.push({ alias: a, identity_name: other.name })
    }
    return out
  }
  if (hits.length > 1) {
    return { ...base, status: 'ambiguous', reason: 'alias_matches_multiple_identities', query: name, manifest_sha256: m.manifest_sha256,
      alias_candidates: hits.map(e => ({ identity_name: e.name, identity_id: identityId(e, []) })) }
  }

  const entry = hits[0]
  const conflicts = [], missing = [], warnings = []
  const id = identityId(entry, conflicts)
  const dir = cache?.dir ?? cacheDir()

  // sha -> rows, to detect overlap with rejected lineage and cross-identity reuse
  const shaRejected = new Set(m.rows.filter(r => (r.status === 'rejected' || isRejectedLineage(r)) && SHA256_RE.test(r.sha256 ?? '')).map(r => r.sha256))
  const shaOwners = new Map()
  for (const r of m.rows) if (SHA256_RE.test(r.sha256 ?? '')) shaOwners.set(r.sha256, new Set([...(shaOwners.get(r.sha256) ?? []), r.identity_name]))

  const editions = [], positive = [], rejected = [], proposals = []
  for (const r of entry.rows) {
    const status = String(r.status ?? '').trim()
    const sha = SHA256_RE.test(r.sha256 ?? '') ? r.sha256 : null
    const label = r.edition || r.file_name || r.drive_file_id || 'unlabelled'
    if (!STATUSES.has(status)) conflicts.push({ type: 'unknown_status', edition: label, status })
    if (r.sha256 && !sha) conflicts.push({ type: 'invalid_sha256', edition: label })
    const lineageRejected = status === 'rejected' || isRejectedLineage(r)
    if (lineageRejected && status && status !== 'rejected') conflicts.push({ type: 'status_conflicts_with_rejected_lineage', edition: label, claimed_status: status })
    const cached = sha && dir ? await cacheHas(dir, sha) : false
    const locators = {
      figma_node: r.figma_node_id ?? null,
      drive_file_id: r.drive_file_id || null,
      r2_key: r.r2_key ?? null,
      local_cache_key: sha ? cacheKey(sha) : null,
      local_cache_path: cached ? join(dir, cacheKey(sha)) : null,
      cached,
    }
    const edition = {
      stable_id: r.stable_id || null, edition: r.edition || null, file_name: r.file_name || null, sha256: sha,
      width: r.width ?? null, height: r.height ?? null, family: r.family || null,
      depicted_characters: splitList(r.depicted_characters), source_type: r.source_type || null,
      duplicate_sha256_group: r.duplicate_sha256_group || null, manifest_status: status || null, locators,
    }
    editions.push(edition)

    if (lineageRejected) { rejected.push({ ...edition, class: 'rejected_lineage', use_as_positive_reference: false }); continue }
    if (status === 'not accessible') { missing.push({ type: 'not_accessible', edition: label, locators }); continue }
    if (!sha) { missing.push({ type: 'missing_sha256', edition: label }); continue }
    if (!r.drive_file_id && !r.r2_key && !r.figma_node_id) missing.push({ type: 'missing_source_locator', edition: label })
    if (shaRejected.has(sha)) { conflicts.push({ type: 'sha256_shared_with_rejected_lineage', edition: label, sha256: sha }); continue }
    if (shaOwners.get(sha).size > 1) conflicts.push({ type: 'sha256_shared_across_identities', edition: label, sha256: sha, identities: [...shaOwners.get(sha)] })
    if (status === 'proposal') { proposals.push({ ...edition, class: 'proposal', use_as_positive_reference: false }); continue }
    if (status === 'original') positive.push({ ...edition, class: 'recovered_bytes', use_as_positive_reference: true, note: 'Recovered bytes only; not rights or canon approval.' })
  }
  const dims = new Map()
  for (const e of editions) if (e.sha256) {
    const d = `${e.width}x${e.height}`; const prev = dims.get(e.sha256)
    if (prev && prev !== d) conflicts.push({ type: 'dimension_mismatch_same_sha256', sha256: e.sha256 })
    dims.set(e.sha256, d)
  }
  if (positive.length === 0) missing.push({ type: 'no_positive_reference', detail: 'No recovered original with a verified sha256.' })

  // aliases are returned separately; near-identical aliases are flagged, never merged
  const matchedAlias = [...entry.aliases, entry.name].find(a => normalize(a) === key)
  const near = confusable(entry, matchedAlias)
  if (near.length) warnings.push({ type: 'confusable_alias_not_merged', matched: matchedAlias, near })

  const vendor = isVendorGuest({ identity_name: entry.name }, [...entry.aliases])
  return {
    ...base,
    status: 'resolved',
    query: name,
    identity_id: id,
    identity_name: entry.name,
    matched_alias: normalize(entry.name) === key ? null : matchedAlias,
    aliases: [...entry.aliases].map(a => ({ alias: a })),
    class: vendor ? 'vendor-guest' : 'character',
    ...(vendor ? { unofficial: true, rights: 'pending' } : {}),
    editions,
    positive_references: positive,
    proposals,
    rejected_lineages: rejected,
    missing_references: missing,
    conflicts,
    warnings,
    cache_dir_configured: Boolean(dir),
    manifest_sha256: m.manifest_sha256,
  }
}
