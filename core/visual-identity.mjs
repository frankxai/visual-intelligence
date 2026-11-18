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
