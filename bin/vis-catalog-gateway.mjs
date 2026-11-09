#!/usr/bin/env node
import fs from 'node:fs'
import { createCatalogAccess } from '../core/vis-catalog-access.mjs'
import { createWorkspaceCatalogAdapter } from '../core/adapters/workspace-catalog-adapter.mjs'
import { createCatalogJwtAuthenticator } from '../mcp/vis-catalog-auth.mjs'
import { createCatalogHttpHandler } from '../mcp/vis-http-gateway.mjs'
import { createCatalogNodeServer } from '../mcp/vis-http-node.mjs'
import { createSupabaseCatalogRegistry, createSupabaseMembershipResolver } from '../core/adapters/supabase-workspace-catalog.mjs'

/** Operator-only registry. Keep it out of Git. There is no automatic owner fallback. */
const file = process.env.VIS_GATEWAY_CONFIG
if (!file) throw new Error('Set VIS_GATEWAY_CONFIG to a private gateway configuration file')
const config = JSON.parse(fs.readFileSync(file, 'utf8'))
if (!config.platform && (!Array.isArray(config.workspaces) || !config.workspaces.length || config.workspaces.length > 1000)) throw new Error('Configure the platform registry or enroll a workspace')
const registry = new Map()
for (const workspace of config.workspaces || []) {
  if (!workspace.id || registry.has(workspace.id) || !Array.isArray(workspace.subjects) || !workspace.subjects.length || !workspace.subjects.every(s => typeof s === 'string' && s.length > 0) || !Array.isArray(workspace.sources)) throw new Error('Invalid workspace enrollment')
  registry.set(workspace.id, { ...workspace, sources: workspace.sources.map(source => ({ id: source.id, kind: 'vis_sqlite', adapter: source.indexPath ? createWorkspaceCatalogAdapter({ workspaceId: workspace.id, indexPath: source.indexPath, renditionsDir: source.renditionsDir }) : null })) })
}
const platform = config.platform ? { url:config.platform.url, identityProvider:config.platform.identityProvider, serviceKey:process.env[config.platform.serviceKeyEnv] } : null
const localMembership = async ({ subject, requestedWorkspaceId }) => {
  // Refresh membership on every request so removing a subject revokes the next read.
  const latest = JSON.parse(fs.readFileSync(file,'utf8'))
  const candidates = latest.workspaces.filter(w => registry.has(w.id) && w.subjects.includes(subject))
  return requestedWorkspaceId ? candidates.find(w => w.id === requestedWorkspaceId)?.id : candidates.length === 1 ? candidates[0].id : null
}
const authenticate = createCatalogJwtAuthenticator({ ...config.auth, resolveMembership: platform ? createSupabaseMembershipResolver(platform) : localMembership })
const access = createCatalogAccess({ sourcesForContext: platform ? createSupabaseCatalogRegistry(platform) : context => registry.get(context.workspaceId)?.sources || [] })
const handler = createCatalogHttpHandler({ access, authenticate, resource: config.auth.resource, issuer: config.auth.issuer, allowedOrigins: config.allowedOrigins || [] })
const server = createCatalogNodeServer(handler, config.auth.resource)
server.listen(Number(process.env.PORT || 4324), process.env.VIS_GATEWAY_HOST || '127.0.0.1', () => process.stderr.write('VIS catalog gateway listening; authenticated enrolled workspaces only\n'))
