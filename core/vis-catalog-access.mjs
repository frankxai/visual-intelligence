/** Read-only, workspace-bound projection of existing VIS catalogs. No second index. */
export class CatalogError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status }
}

const id = { type: 'string', minLength: 1, maxLength: 160 }
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
export const catalogTools = [
  { name: 'search_assets', description: 'Find visual references in the signed-in workspace. Returns stable asset/version identities, measured dimensions, recorded approval state, and source coverage. Missing or unavailable sources are explicit. Metadata retrieval, not semantic visual similarity.', inputSchema: object({ query: { type: 'string', maxLength: 500 }, brand: id, character: id, approval_status: { enum: ['candidate', 'approved', 'rejected', 'archived'] }, aspect: { enum: ['square', 'landscape', 'portrait'] }, limit: { type: 'integer', minimum: 1, maximum: 24 } }) },
  { name: 'get_asset', description: 'Read one version of an asset from an authorized workspace catalog. Returns bounded provenance and recorded rights/approval state. Local paths, credentials, master bytes, and private prompts are excluded.', inputSchema: object({ source_id: id, asset_id: id, version_id: id }, ['source_id', 'asset_id']) },
  { name: 'get_asset_preview', description: 'Load one existing thumbnail or preview for an exact asset version in the signed-in workspace. Does not generate, upload, approve, publish, or serve original masters. An absent rendition is reported explicitly.', inputSchema: object({ source_id: id, asset_id: id, version_id: id }, ['source_id', 'asset_id', 'version_id']) },
  { name: 'get_asset_sources', description: 'Inspect this workspace catalog coverage and index timestamps. Reports unconfigured and unavailable sources separately from a completed search with no matches. Does not connect accounts or scan files.', inputSchema: object({}) },
].map(tool => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }))

export function validateCatalogInput(name, args = {}) {
  const tool = catalogTools.find(t => t.name === name)
  if (!tool) throw new CatalogError('unsupported_tool', 404)
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new CatalogError('invalid_arguments')
  for (const key of Object.keys(args)) {
    if (!Object.hasOwn(tool.inputSchema.properties, key)) throw new CatalogError('invalid_arguments')
    const schema = tool.inputSchema.properties[key]
    if (!schema) throw new CatalogError('invalid_arguments')
    const value = args[key]
    if (schema.enum && !schema.enum.includes(value)) throw new CatalogError('invalid_arguments')
    if (schema.type === 'string' && (typeof value !== 'string' || value.length > schema.maxLength || value.length < (schema.minLength || 0) || /[\u0000-\u001f]/.test(value))) throw new CatalogError('invalid_arguments')
    if (schema.type === 'integer' && (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum)) throw new CatalogError('invalid_arguments')
  }
  if (tool.inputSchema.required.some(key => args[key] === undefined)) throw new CatalogError('invalid_arguments')
  return { ...args }
}

export function assertCatalogContext(context) {
  if (!context || typeof context.actorId !== 'string' || !context.actorId || typeof context.workspaceId !== 'string' || !context.workspaceId) throw new CatalogError('authentication_required', 401)
  if (!context.scopes?.includes('catalog:read')) throw new CatalogError('insufficient_scope', 403)
}

function boundedText(value, limit = 500) { return typeof value === 'string' ? value.slice(0, limit) : null }

/** Explicit allowlist: adapters cannot leak their raw rows through a tool response. */
export function projectCatalogAsset(row, sourceId) {
  return {
    source_id: sourceId, asset_id: boundedText(row.asset_id, 160), version_id: boundedText(row.version_id, 160),
    title: boundedText(row.title), media_type: boundedText(row.media_type, 30), sha256: /^[a-f0-9]{64}$/.test(row.sha256 || '') ? row.sha256 : null,
    width: Number.isFinite(row.width) ? row.width : null, height: Number.isFinite(row.height) ? row.height : null,
    tags: Array.isArray(row.tags) ? row.tags.filter(t => typeof t === 'string').slice(0, 60).map(t => t.slice(0, 160)) : [],
    rights_status: boundedText(row.rights_status, 40) || 'unknown', approval_status: boundedText(row.approval_status, 40) || 'candidate',
    approval_scope: row.approval_scope === 'version_record' ? 'version_record' : 'asset_record',
    observed_at: boundedText(row.last_seen_at, 40), preview_available: row.preview_available === true,
    match_reason: boundedText(row.match_reason),
  }
}

function safeCoverage(source, data = {}, state = 'ready') {
  return { source_id: source.id, kind: source.kind, state, indexed_at: boundedText(data.indexed_at, 40),
    asset_count: Number.isSafeInteger(data.asset_count) && data.asset_count >= 0 ? data.asset_count : null,
    exhaustive: data.exhaustive === true }
}

export function createCatalogAccess({ sourcesForContext }) {
  if (typeof sourcesForContext !== 'function') throw new TypeError('sourcesForContext required')
  return {
    async call(name, raw, context) {
      assertCatalogContext(context)
      const args = validateCatalogInput(name, raw)
      // The host chooses sources after authentication. No workspace/path/provider URL argument exists.
      const sources = await sourcesForContext(context)
      if (!Array.isArray(sources) || sources.length > 8 || new Set(sources.map(s => s.id)).size !== sources.length) throw new CatalogError('catalog_configuration_invalid', 503)
      if (name === 'get_asset_sources' || name === 'search_assets') {
        const results = [], coverage = []
        for (const source of sources) {
          if (!source.adapter) { coverage.push(safeCoverage(source, {}, 'not_configured')); continue }
          try {
            const value = name === 'search_assets' ? await source.adapter.search(args, context) : await source.adapter.describe(context)
            coverage.push(safeCoverage(source, value.coverage || value))
            if (name === 'search_assets') results.push(...value.assets.map(a => projectCatalogAsset(a, source.id)))
          } catch { coverage.push(safeCoverage(source, {}, 'unavailable')) }
        }
        const limit = args.limit || 12
        return { workspace_id: context.workspaceId, retrieval: 'metadata', assets: results.slice(0, limit), coverage,
          complete: coverage.length > 0 && coverage.every(s => s.state === 'ready' && s.exhaustive),
          truncated: results.length > limit, no_matches: name === 'search_assets' && results.length === 0 }
      }
      const source = sources.find(s => s.id === args.source_id)
      if (!source) throw new CatalogError('not_found', 404)
      if (!source.adapter) throw new CatalogError('source_not_configured', 503)
      let row
      try { row = await source.adapter.get(args.asset_id, args.version_id, context) }
      catch { throw new CatalogError('source_unavailable', 503) }
      if (!row) throw new CatalogError('not_found', 404)
      if (name === 'get_asset_preview') {
        let preview
        try { preview = await source.adapter.preview(args.asset_id, args.version_id, context) }
        catch { throw new CatalogError('preview_unavailable', 404) }
        if (!preview) throw new CatalogError('preview_unavailable', 404)
        return { asset: projectCatalogAsset(row, source.id), preview }
      }
      return { asset: projectCatalogAsset(row, source.id), provenance: (row.provenance || []).slice(0, 12).map(p => ({
        provider: boundedText(p.provider, 80), model: boundedText(p.model, 100), recorded_at: boundedText(p.recorded_at, 40),
      })), approval_is_recorded_state: true }
    },
  }
}
