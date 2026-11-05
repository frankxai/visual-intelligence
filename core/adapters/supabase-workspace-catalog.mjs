import { CatalogError } from '../vis-catalog-access.mjs'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
function client({ url, serviceKey, fetchImpl = fetch }) {
  const base = new URL(url)
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('A canonical Supabase HTTPS origin is required')
  if (typeof serviceKey !== 'string' || serviceKey.length < 20) throw new Error('Server-side Supabase credential required')
  return async (table, params) => {
    const endpoint = new URL('/rest/v1/' + table, base)
    for (const [key,value] of Object.entries(params)) endpoint.searchParams.set(key, String(value))
    const response = await fetchImpl(endpoint, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Accept: 'application/json' }, signal: AbortSignal.timeout(3000), redirect: 'error' })
    if (!response.ok) throw new CatalogError('source_unavailable', 503)
    // All queries are bounded. Still cap decoded response bytes independently.
    const reader = response.body.getReader(); let size = 0; const chunks = []
    try { while (true) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > 1024*1024) { await reader.cancel(); throw new CatalogError('source_unavailable',503) }; chunks.push(value) } } finally { reader.releaseLock() }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!Array.isArray(data)) throw new CatalogError('source_unavailable',503)
    return data
  }
}

/** Reuses the platform principal/tenant membership registry; never trusts a JWT tenant claim. */
export function createSupabaseMembershipResolver(config) {
  const read = client(config)
  if (!config.identityProvider) throw new Error('Configured identity provider required')
  return async ({ subject, requestedWorkspaceId }) => {
    if (requestedWorkspaceId && !UUID.test(requestedWorkspaceId)) return null
    const principals = await read('principals', { select:'id', identity_provider:'eq.' + config.identityProvider, external_subject:'eq.' + subject, limit:2 })
    if (principals.length !== 1) return null
    const members = await read('tenant_memberships', { select:'tenant_id', principal_id:'eq.' + principals[0].id, status:'eq.active', ...(requestedWorkspaceId ? {tenant_id:'eq.' + requestedWorkspaceId} : {}), limit:2 })
    if (members.length !== 1 || !UUID.test(members[0].tenant_id)) return null
    const tenants = await read('tenants', { select:'id', id:'eq.' + members[0].tenant_id, status:'eq.active', limit:1 })
    return tenants[0]?.id || null
  }
}

/** Tenant-scoped source discovery supports new members without owner catalog fallback. */
export function createSupabaseCatalogRegistry(config) {
  const read = client(config)
  return async context => {
    if (!UUID.test(context.workspaceId)) throw new CatalogError('workspace_forbidden',403)
    const rows = await read('vis_catalog_sources', { select:'source_id,kind,state', workspace_id:'eq.' + context.workspaceId, order:'source_id.asc', limit:9 })
    if (rows.length > 8) throw new CatalogError('catalog_configuration_invalid',503)
    return rows.map(row => ({ id:row.source_id, kind:row.kind, adapter:row.state === 'not_configured' ? null : createSupabaseWorkspaceCatalog({ ...config, workspaceId:context.workspaceId, sourceId:row.source_id }) }))
  }
}

/** Hosted adapter uses the same VIS identities; every query includes its enrolled tenant. */
export function createSupabaseWorkspaceCatalog(config) {
  if (!UUID.test(config.workspaceId) || !config.sourceId) throw new Error('Enroll an explicit tenant and source')
  const read = client(config)
  const scope = context => {
    if (context.workspaceId !== config.workspaceId) throw new CatalogError('workspace_forbidden',403)
    return { workspace_id:'eq.' + config.workspaceId, source_id:'eq.' + config.sourceId }
  }
  const describe = async context => {
    const data = await read('vis_catalog_sources', { ...scope(context), select:'state,indexed_at,asset_count', limit:1 })
    if (data[0]?.state !== 'ready') throw new CatalogError('source_unavailable',503)
    return { indexed_at:data[0].indexed_at, asset_count:data[0].asset_count, exhaustive:true }
  }
  const fields = 'asset_id,version_id,title,media_type,sha256,width,height,tags,rights_status,approval_status,approval_scope,observed_at'
  const project = row => ({ ...row, last_seen_at:row.observed_at, preview_available:false })
  return {
    describe,
    async search(args,context) {
      const filters = { ...scope(context), select:fields, limit:(args.limit || 12) + 1, order:'observed_at.desc,asset_id.asc' }
      if (args.query?.trim()) filters.search_document = 'plfts(simple).' + args.query.trim()
      if (args.brand) filters.brand = 'eq.' + args.brand
      if (args.character) filters.characters = 'cs.{' + JSON.stringify(args.character) + '}'
      if (args.approval_status) filters.approval_status = 'eq.' + args.approval_status
      if (args.aspect) filters.aspect = 'eq.' + args.aspect
      const info = await describe(context)
      const rows = await read('vis_catalog_search',filters), limit = args.limit || 12
      return { assets:rows.slice(0,limit).map(row => ({...project(row),match_reason:'Matched catalog text and requested metadata filters.'})), coverage:{...info,exhaustive:rows.length<=limit} }
    },
    async get(assetId,versionId,context) {
      const rows = await read('vis_catalog_search', { ...scope(context), select:fields, asset_id:'eq.' + assetId, ...(versionId ? {version_id:'eq.' + versionId} : {}), order:'observed_at.desc', limit:1 })
      return rows[0] ? project(rows[0]) : null
    },
    async preview() { return null }, // Enroll an authorized rendition resolver before exposing any R2 bytes.
  }
}
