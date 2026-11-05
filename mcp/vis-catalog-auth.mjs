import { createRemoteJWKSet, jwtVerify } from 'jose'
import { CatalogError, assertCatalogContext } from '../core/vis-catalog-access.mjs'

export function createCatalogJwtAuthenticator({ issuer, resource, jwksUrl, resolveMembership, keySet }) {
  for (const value of [issuer, resource, jwksUrl]) {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error('Canonical HTTPS auth configuration required')
  }
  if (typeof resolveMembership !== 'function') throw new TypeError('Membership resolver required')
  // JWKS URL is operator-configured. Never follow a token-supplied jku/x5u URL.
  const keys = keySet || createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 3000, cooldownDuration: 30000, cacheMaxAge: 300000 })
  return async request => {
    const token = /^Bearer ([A-Za-z0-9_.-]{1,16384})$/.exec(request.headers.get('authorization') || '')?.[1]
    if (!token) throw new CatalogError('authentication_required', 401)
    let payload
    try { ({ payload } = await jwtVerify(token, keys, { issuer, audience: resource, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'iss', 'aud', 'exp', 'iat'], clockTolerance: 5, maxTokenAge: '1h' })) }
    catch { throw new CatalogError('authentication_required', 401) }
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/) : []
    const selected = request.headers.get('x-gencreator-workspace-id') || null
    // Membership is refreshed on every request, including preview requests and tool discovery.
    const workspaceId = await resolveMembership({ subject: payload.sub, issuer: payload.iss, requestedWorkspaceId: selected })
    if (!workspaceId || (selected && workspaceId !== selected)) throw new CatalogError('workspace_forbidden', 403)
    const context = { actorId: payload.sub, workspaceId, scopes }
    assertCatalogContext(context)
    return context
  }
}
