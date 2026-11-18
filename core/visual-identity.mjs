// Use the installed estate resolver. Agent arguments cannot change an authority root.
import { join, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

export const identitySchema = {
  type: 'object', additionalProperties: false,
  required: ['identity_id', 'variant', 'channel', 'intended_use', 'required_approval'],
  properties: Object.fromEntries(['identity_id', 'variant', 'channel', 'intended_use', 'required_approval', 'expected_version', 'expected_sha256']
    .map(key => [key, { type: 'string', minLength: 1 }])),
}

export async function resolveVisualIdentity(request) {
  const root = process.env.VIS_ESTATE_ROOT
  if (!root || !isAbsolute(root)) return { status: 'unresolved', reason: 'estate_resolver_unavailable', publish_authorized: false }
  try {
    const { resolveIdentity } = await import(pathToFileURL(join(root, 'brand/scripts/identity.mjs')).href)
    return resolveIdentity(request)
  } catch {
    return { status: 'unresolved', reason: 'estate_resolver_unavailable', publish_authorized: false }
  }
}

// The loopback review surface may show a raster preview. Never send the master or its absolute path.
export async function identityPreview(request) {
  const r = await resolveVisualIdentity(request)
  if (r.status !== 'resolved') return null
  const { readFile, realpath } = await import('node:fs/promises')
  const { relative, sep } = await import('node:path')
  const { createHash } = await import('node:crypto')
  const roots = {
    'mini-me-storyboard': process.env.VIS_FOLIO_ROOT,
    'starlight-estate': process.env.VIS_ESTATE_ROOT,
    'starlightintelligence.ai': process.env.VIS_STARLIGHT_SITE_ROOT,
  }
  const mount = roots[r.source_authority]
  if (!mount || !r.source_path || !request.expected_sha256 || !request.expected_version) return null
  try {
    const root = await realpath(mount)
    const path = await realpath(join(root, r.source_path))
    const local = relative(root, path)
    if (!local || local === '..' || local.startsWith('..' + sep) || isAbsolute(local)) return null
    const bytes = await readFile(path)
    if (createHash('sha256').update(bytes).digest('hex') !== r.sha256) return null
    const { default: sharp } = await import('sharp')
    return await sharp(bytes, {limitInputPixels: 48_000_000}).resize({width:720,height:480,fit:'inside',withoutEnlargement:true}).webp().toBuffer()
  } catch { return null }
}
