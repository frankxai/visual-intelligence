#!/usr/bin/env node
/**
 * VIS MCP Server — Visual Intelligence System
 * Zero-dependency stdio MCP server exposing visual registry tools to Claude Code.
 * Tools: vis_search, vis_audit, vis_report, vis_coverage, vis_suggest
 *
 * Install:  claude mcp add vis-mcp -- node path/to/vis-mcp-server.mjs
 * Set VIS_ROOT env var to your project root, or run from the project directory.
 */
import { createInterface } from 'readline'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const ROOT = process.env.VIS_ROOT || process.cwd()
const REGISTRY_PATH = path.join(ROOT, 'data/visual-registry.json')
const SITEMAP_PATH = path.join(ROOT, 'data/sitemap-image-map.json')
const CONTENT_DIR = path.join(ROOT, 'content/blog')
const PLACEHOLDERS = ['blog-hero-aurora.svg', 'placeholder.png', 'default-hero.png']

let _registry = null, _sitemap = null
function loadRegistry() { if (!_registry) _registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')); return _registry }
function loadSitemap() { if (!_sitemap) _sitemap = JSON.parse(fs.readFileSync(SITEMAP_PATH, 'utf-8')); return _sitemap }

function makeHaystack(img) {
  return `${img.path} ${img.filename} ${(img.tags||[]).join(' ')} ${img.mood||''} ${img.theme||''} ${img.category||''} ${(img.suitableFor||[]).join(' ')}`.toLowerCase()
}

// --- vis_search ---
function visSearch({ query, mood, theme, category, maxResults = 10 }) {
  const registry = loadRegistry(), q = (query || '').toLowerCase()
  const scored = registry.map(img => {
    let score = 0
    const hay = makeHaystack(img)
    if (q) { for (const w of q.split(/\s+/)) { if (hay.includes(w)) score += 10 } }
    if (mood && img.mood !== mood) return null
    if (mood) score += 5
    if (theme && img.theme !== theme) return null
    if (theme) score += 5
    if (category && img.category !== category) return null
    if (category) score += 5
    if (!q && !mood && !theme && !category) score = 1
    return score > 0 ? { ...img, _s: score } : null
  }).filter(Boolean)
  scored.sort((a, b) => b._s - a._s)
  return scored.slice(0, maxResults).map(({ _s, ...img }) => img)
}

// --- vis_audit ---
function visAudit() {
  _registry = null
  const registry = loadRegistry()
  const issues = []
  // Placeholder detection
  for (const ph of PLACEHOLDERS) {
    try {
      const r = execFileSync('grep', ['-rn', ph, path.join(ROOT, 'content/'), path.join(ROOT, 'app/'),
        '--include=*.mdx', '--include=*.tsx'], { encoding: 'utf-8', stdio: ['pipe','pipe','pipe'] })
      for (const line of r.split('\n').filter(Boolean)) {
        const f = line.split(':')[0]
        if (f.includes('visual-registry') || f.includes('sitemap-image-map')) continue
        issues.push({ type: 'placeholder', severity: 'high', file: f, image: ph })
      }
    } catch { /* no matches */ }
  }
  // Duplicate heroes in blog MDX
  if (fs.existsSync(CONTENT_DIR)) {
    for (const file of fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.mdx'))) {
      const content = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8')
      const fm = content.match(/^---\n([\s\S]*?)\n---/)
      if (!fm) continue
      const im = fm[1].match(/image:\s*['"]?([^\s'"]+)/)
      if (im && content.slice(fm[0].length).includes(im[1]))
        issues.push({ type: 'duplicate-hero', severity: 'medium', file: `content/blog/${file}`, image: im[1] })
    }
  }
  // Oversized images
  registry.filter(img => img.sizeKB > 2000).forEach(img =>
    issues.push({ type: 'oversized', severity: 'low', file: img.path, sizeKB: img.sizeKB }))

  const high = issues.filter(i => i.severity === 'high').length
  const med = issues.filter(i => i.severity === 'medium').length
  const low = issues.filter(i => i.severity === 'low').length
  const score = Math.max(0, 100 - high * 15 - med * 5 - low * 2)
  return {
    healthScore: score,
    status: score >= 90 ? 'EXCELLENT' : score >= 70 ? 'GOOD' : score >= 50 ? 'NEEDS_ATTENTION' : 'CRITICAL',
    issueCounts: { high, medium: med, low, total: issues.length },
    topIssues: issues.slice(0, 5),
  }
}

// --- vis_report ---
function visReport() {
  _registry = null
  const registry = loadRegistry()
  const categories = {}, moods = {}
  let oversized = 0, totalKB = 0
  for (const img of registry) {
    categories[img.category] = (categories[img.category] || 0) + 1
    if (img.mood) moods[img.mood] = (moods[img.mood] || 0) + 1
    if (img.sizeKB > 2000) oversized++
    totalKB += img.sizeKB || 0
  }
  const sortObj = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]))
  return {
    totalImages: registry.length, totalSizeMB: Math.round(totalKB / 1024),
    oversizedCount: oversized, categories: sortObj(categories),
    moods: sortObj(moods), avgSizeKB: Math.round(totalKB / registry.length),
  }
}

// --- vis_coverage ---
function visCoverage({ route } = {}) {
  const sitemap = loadSitemap()
  if (route) {
    const pages = sitemap.pages || sitemap
    if (Array.isArray(pages)) {
      return pages.find(p => p.route === route || p.path === route) || { error: `Route "${route}" not found` }
    }
    return pages[route] || { error: `Route "${route}" not found` }
  }
  const s = sitemap._summary || {}
  return { totalPages: s.totalPages || 0, statusBreakdown: s.statusBreakdown || {},
    coverage: s.coverage || {}, topNeedsImages: (s.topNeedsImages || []).slice(0, 15) }
}

// --- vis_suggest ---
function visSuggest({ context, mood }) {
  const registry = loadRegistry()
  const ctx = (context || '').toLowerCase(), words = ctx.split(/\s+/).filter(w => w.length > 2)
  const scored = registry.map(img => {
    let score = 0
    const hay = makeHaystack(img)
    for (const w of words) { if (hay.includes(w)) score += 10 }
    if (ctx.includes('hero') && (img.suitableFor||[]).includes('hero')) score += 20
    if (ctx.includes('blog') && (img.suitableFor||[]).includes('blog-inline')) score += 15
    if (ctx.includes('og') && (img.suitableFor||[]).includes('og-image')) score += 15
    if (ctx.includes('product') && (img.suitableFor||[]).includes('product-page')) score += 15
    if (mood && img.mood === mood) score += 10
    if (mood && img.mood !== mood) score -= 5
    if (img.sizeKB && img.sizeKB < 1500) score += 2
    return { img, score }
  }).filter(s => s.score > 0)
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 3).map(({ img, score }) => {
    const reasons = []
    for (const w of words) { if (`${img.path} ${(img.tags||[]).join(' ')}`.toLowerCase().includes(w)) reasons.push(`matches "${w}"`) }
    if (mood && img.mood === mood) reasons.push(`mood: ${mood}`)
    if ((img.suitableFor||[]).some(s => ctx.includes(s.split('-')[0]))) reasons.push(`suitable for ${ctx}`)
    return { path: img.path, category: img.category, tags: img.tags, mood: img.mood,
      sizeKB: img.sizeKB, reasoning: reasons.length ? reasons.join(', ') : `relevance score ${score}` }
  })
}

// --- MCP Protocol layer ---
const TOOLS = [
  { name: 'vis_search',
    description: 'Search the FrankX visual registry for images by query, mood, theme, or category.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Search query (matches path, tags, filename)' },
      mood: { type: 'string', description: 'Filter by mood (atmospheric, informational, cinematic, etc.)' },
      theme: { type: 'string', description: 'Filter by theme (dark, light)' },
      category: { type: 'string', description: 'Filter by category (blog, acos, mascot, arcanea, etc.)' },
      maxResults: { type: 'number', description: 'Max results (default 10)' },
    }}},
  { name: 'vis_audit',
    description: 'Run visual health audit: placeholder detection, duplicate heroes, oversized images. Returns health score 0-100.',
    inputSchema: { type: 'object', properties: {} }},
  { name: 'vis_report',
    description: 'Get full visual registry stats: total images, category breakdown, mood distribution, size info.',
    inputSchema: { type: 'object', properties: {} }},
  { name: 'vis_coverage',
    description: 'Check image coverage for site pages. Optionally check a specific route.',
    inputSchema: { type: 'object', properties: {
      route: { type: 'string', description: 'Specific route (e.g. "/coaching"). Omit for overall stats.' },
    }}},
  { name: 'vis_suggest',
    description: 'Suggest best existing image for a given context (e.g. "homepage hero", "blog about music").',
    inputSchema: { type: 'object', properties: {
      context: { type: 'string', description: 'Usage context (e.g. "blog hero about AI architecture")' },
      mood: { type: 'string', description: 'Preferred mood (atmospheric, cinematic, informational, etc.)' },
    }, required: ['context'] }},
  { name: 'vis_intelligence',
    description: 'Unified intelligence report cross-referencing visual health, content strategy pillars, and page coverage. Shows where strategy, content, and visuals align or misalign.',
    inputSchema: { type: 'object', properties: {} }},
]

// --- vis_intelligence ---
function visIntelligence() {
  const registry = loadRegistry()
  const sitemapData = loadSitemap()
  const pages = sitemapData?.pages || (Array.isArray(sitemapData) ? sitemapData : [])

  // Try to load content strategy
  const strategyPath = path.join(ROOT, 'data/content-strategy.json')
  let pillars = []
  try { pillars = JSON.parse(fs.readFileSync(strategyPath, 'utf-8')).pillars || [] } catch {}

  const statusCounts = {}
  for (const p of pages) { statusCounts[p.status || 'unknown'] = (statusCounts[p.status || 'unknown'] || 0) + 1 }

  // Cross-reference pillars with visual coverage
  const pillarCoverage = pillars.map(pillar => {
    const keywords = (pillar.id || '').split('-').filter(k => k.length > 3)
    const related = pages.filter(p => keywords.some(kw => (p.route || '').includes(kw)))
    const complete = related.filter(p => p.status === 'complete').length
    const gaps = related.filter(p => p.status === 'needs-images' || p.status === 'placeholder').map(p => p.route).slice(0, 3)
    return {
      pillar: pillar.name,
      pages: related.length,
      complete,
      coverage: related.length > 0 ? Math.round((complete / related.length) * 100) + '%' : 'n/a',
      topGaps: gaps,
    }
  })

  const actions = []
  for (const p of pillarCoverage) {
    for (const route of p.topGaps) {
      actions.push(`[${p.pillar}] ${route} needs images`)
    }
  }

  return {
    overallScore: pillarCoverage.length > 0
      ? Math.round(pillarCoverage.reduce((s, p) => s + parseInt(p.coverage) || 0, 0) / pillarCoverage.length * 0.6 + 100 * 0.4)
      : 100,
    visual: { score: 100, images: registry.length },
    pages: { total: pages.length, ...statusCounts },
    pillarCoverage,
    topActions: actions.slice(0, 5),
    recommendation: actions.length > 0
      ? `Focus on ${pillarCoverage.sort((a, b) => parseInt(a.coverage) - parseInt(b.coverage))[0]?.pillar} pillar — lowest visual coverage.`
      : 'All pillars have full visual coverage.',
  }
}

const HANDLERS = { vis_search: visSearch, vis_audit: visAudit, vis_report: visReport, vis_coverage: visCoverage, vis_suggest: visSuggest, vis_intelligence: visIntelligence }

function send(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n') }
function sendErr(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n') }

const rl = createInterface({ input: process.stdin, terminal: false })
rl.on('line', (line) => {
  if (!line.trim()) return
  let msg
  try { msg = JSON.parse(line) } catch { return }
  const { id, method, params } = msg

  if (method === 'initialize') {
    send(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'vis-mcp', version: '1.0.0' } })
  } else if (method === 'notifications/initialized') {
    // no response
  } else if (method === 'tools/list') {
    send(id, { tools: TOOLS })
  } else if (method === 'tools/call') {
    const { name, arguments: args } = params || {}
    const handler = HANDLERS[name]
    if (!handler) { send(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }); return }
    try {
      const result = handler(args || {})
      send(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] })
    } catch (err) {
      send(id, { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true })
    }
  } else if (id !== undefined) {
    sendErr(id, -32601, `Method not found: ${method}`)
  }
})

process.on('uncaughtException', () => {})
