import fs from 'fs'
import http from 'http'
import path from 'path'
import {
  assetPublishGate,
  createCurationPacket,
  drainFeedbackOutbox,
  findDuplicates,
  findOrphans,
  findSimilarAssets,
  getAsset,
  getSummary,
  listAssetActionRecipes,
  listAssets,
  listDerivativePresets,
  listSavedSearches,
  listSmartCollections,
  loadConfig,
  openVisDatabase,
  parseJson,
  recordCurationFeedback,
  resolveProjectPath,
  scoreAsset,
  undoCurationFeedback,
} from '../core/vis-core.mjs'

export function generateDashboard(root, options = {}) {
  const config = loadConfig(root)
  const db = openVisDatabase(root, config)
  try {
    const limit = Number(options.limit || 3000)
    const assets = listAssets(db, { limit })
    const summary = getSummary(db)
    const duplicates = findDuplicates(db, { limit: 20 })
    const orphans = findOrphans(db, { limit: 60 })
    const similar = findSimilarAssets(db, { limit: 20, minScore: 58 })
    const savedSearches = listSavedSearches(db)
    const smartCollections = listSmartCollections(db)
    const actionRecipes = listAssetActionRecipes()
    const derivativePresets = listDerivativePresets()
    const packetSamples = Object.fromEntries(
      assets.slice(0, 300).map(asset => [asset.asset_id, createCurationPacket(db, asset.asset_id)]),
    )
    const scores = Object.fromEntries(
      assets.slice(0, 600).map(asset => [asset.asset_id, scoreAsset(db, asset.asset_id)]),
    )
    const promptRows = db.prepare(`
      SELECT p.asset_id, p.prompt_text, p.negative_prompt, p.model_hint, p.source_path,
             gen.model, gen.provider, gen.seed
      FROM prompt p
      LEFT JOIN generation_event gen ON gen.prompt_id = p.prompt_id OR gen.asset_id = p.asset_id
    `).all()
    const promptMap = new Map()
    for (const row of promptRows) {
      if (!promptMap.has(row.asset_id)) {
        promptMap.set(row.asset_id, row)
      }
    }
    const genRows = db.prepare('SELECT asset_id, model, provider, seed FROM generation_event').all()
    const genMap = new Map()
    for (const row of genRows) {
      if (!genMap.has(row.asset_id)) genMap.set(row.asset_id, row)
    }
    const usageRows = db.prepare('SELECT asset_id, source_file, route, reference_text FROM asset_usage ORDER BY detected_at DESC').all()
    const usageMap = new Map()
    for (const row of usageRows) {
      let list = usageMap.get(row.asset_id)
      if (!list) {
        list = []
        usageMap.set(row.asset_id, list)
      }
      if (list.length < 8) list.push(row)
    }
    const normalizedAssets = assets.map(asset => {
      const prompt = promptMap.get(asset.asset_id)
      const gen = genMap.get(asset.asset_id)
      const usages = usageMap.get(asset.asset_id) || []
      return {
        ...asset,
        tags: parseJson(asset.tags_json, []),
        publish_gate: assetPublishGate(asset, { intendedUse: 'dashboard public handoff' }),
        prompt_text: prompt?.prompt_text || null,
        negative_prompt: prompt?.negative_prompt || null,
        gen_model: prompt?.model || gen?.model || prompt?.model_hint || null,
        gen_provider: prompt?.provider || gen?.provider || null,
        gen_seed: prompt?.seed || gen?.seed || null,
        sidecar_path: prompt?.source_path || null,
        usages: usages.map(u => ({ file: u.source_file, route: u.route, ref: u.reference_text })),
      }
    })
    const facets = deriveDashboardFacets(normalizedAssets, duplicates, orphans, similar)
    const payload = {
      generatedAt: new Date().toISOString(),
      root,
      limit,
      summary,
      assets: normalizedAssets,
      duplicates,
      orphans,
      similar,
      smartCollections,
      savedSearches,
      actionRecipes,
      derivativePresets,
      packetSamples,
      scores,
      ...facets,
    }
    const outputPath = resolveProjectPath(root, options.output || config.dashboardPath)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    const pwa = writeDashboardPwaArtifacts(outputPath, payload)
    fs.writeFileSync(outputPath, renderDashboardHtml({ ...payload, pwa }), 'utf-8')
    return { outputPath, assets: assets.length, summary, pwa }
  } finally {
    db.close()
  }
}

export function serveDashboard(root, options = {}) {
  const config = loadConfig(root)
  const outputPath = resolveProjectPath(root, options.output || config.dashboardPath)
  const generated = options.generate === false && fs.existsSync(outputPath)
    ? { outputPath, assets: null, summary: null, pwa: null }
    : generateDashboard(root, options)
  const directory = path.dirname(generated.outputPath)
  const dashboardFile = path.basename(generated.outputPath)
  const host = options.host || '127.0.0.1'
  const preferredPort = options.port === 0 ? 0 : Number(options.port || 3766)

  const server = http.createServer((request, response) => {
    try {
      handleDashboardRequest({ root, config, directory, dashboardFile, request, response })
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(error.stack || error.message || String(error))
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(preferredPort, host, () => {
      server.off('error', reject)
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : preferredPort
      resolve({
        server,
        url: `http://${host}:${port}/`,
        outputPath: generated.outputPath,
        directory,
        assets: generated.assets,
      })
    })
  })
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', chunk => {
      body += chunk
      if (body.length > 5 * 1024 * 1024) {
        request.destroy()
        reject(new Error('Request payload too large'))
      }
    })
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        reject(new Error('Invalid JSON: ' + err.message))
      }
    })
    request.on('error', reject)
  })
}

function setCorsHeaders(response) {
  response.setHeader('access-control-allow-origin', '*')
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS, HEAD')
  response.setHeader('access-control-allow-headers', 'content-type')
}

function handleDashboardRequest({ root, config, directory, dashboardFile, request, response }) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  if (request.method === 'OPTIONS') {
    setCorsHeaders(response)
    response.writeHead(204)
    response.end()
    return
  }

  if (url.pathname.startsWith('/__vis_media/')) {
    serveMediaAsset(root, config, decodeURIComponent(url.pathname.slice('/__vis_media/'.length)), request, response)
    return
  }

  if (url.pathname.startsWith('/api/asset/')) {
    const assetId = decodeURIComponent(url.pathname.slice('/api/asset/'.length))
    const db = openVisDatabase(root, config)
    try {
      const asset = getAsset(db, assetId)
      if (!asset) {
        setCorsHeaders(response)
        response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: 'Asset not found' }))
        return
      }
      const curationPacket = createCurationPacket(db, assetId)
      setCorsHeaders(response)
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ ok: true, asset, curationPacket }))
      return
    } finally {
      db.close()
    }
  }

  if (url.pathname === '/api/feedback' && request.method === 'POST') {
    parseRequestBody(request).then(body => {
      const db = openVisDatabase(root, config)
      try {
        const result = recordCurationFeedback(db, {
          ...body,
          brand: body.brand || config.defaultBrand || 'estate',
        })
        setCorsHeaders(response)
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(result))
      } finally {
        db.close()
      }
    }).catch(err => {
      setCorsHeaders(response)
      response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ ok: false, error: err.message }))
    })
    return
  }

  if (url.pathname === '/api/feedback/undo' && request.method === 'POST') {
    parseRequestBody(request).then(body => {
      const db = openVisDatabase(root, config)
      try {
        const result = undoCurationFeedback(db, body.asset_id || body.assetId)
        setCorsHeaders(response)
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(result))
      } finally {
        db.close()
      }
    }).catch(err => {
      setCorsHeaders(response)
      response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ ok: false, error: err.message }))
    })
    return
  }

  if (url.pathname === '/api/stats' && (request.method === 'GET' || request.method === 'HEAD')) {
    const db = openVisDatabase(root, config)
    try {
      const summary = getSummary(db)
      setCorsHeaders(response)
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ ok: true, summary }))
      return
    } finally {
      db.close()
    }
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD, POST, OPTIONS' })
    response.end()
    return
  }

  const requested = url.pathname === '/' ? dashboardFile : decodeURIComponent(url.pathname).replace(/^\/+/, '')
  const target = path.resolve(directory, requested)
  const relativeTarget = path.relative(directory, target)
  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Forbidden')
    return
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }
  setCorsHeaders(response)
  response.writeHead(200, {
    'content-type': contentType(target),
    'cache-control': target.endsWith('.html') ? 'no-cache' : 'public, max-age=3600',
  })
  if (request.method !== 'HEAD') fs.createReadStream(target).pipe(response)
  else response.end()
}

function serveMediaAsset(root, config, assetId, request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' })
    response.end()
    return
  }
  const db = openVisDatabase(root, config)
  try {
    const location = db.prepare(`
SELECT absolute_path FROM asset_location
WHERE asset_id = ? AND exists_now = 1
ORDER BY is_primary DESC, seen_at DESC
LIMIT 1`).get(assetId)
    if (!location || !fs.existsSync(location.absolute_path)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Asset media not found')
      return
    }
    streamFile(location.absolute_path, request, response)
  } finally {
    db.close()
  }
}

function streamFile(filePath, request, response) {
  const stat = fs.statSync(filePath)
  const range = request.headers.range
  const headers = {
    'content-type': contentType(filePath),
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=300',
  }

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/)
    const start = match?.[1] ? Number(match[1]) : 0
    const end = match?.[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1
    if (start >= stat.size || end >= stat.size || start > end) {
      response.writeHead(416, { 'content-range': `bytes */${stat.size}` })
      response.end()
      return
    }
    response.writeHead(206, {
      ...headers,
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${stat.size}`,
    })
    if (request.method !== 'HEAD') fs.createReadStream(filePath, { start, end }).pipe(response)
    else response.end()
    return
  }

  response.writeHead(200, { ...headers, 'content-length': stat.size })
  if (request.method !== 'HEAD') fs.createReadStream(filePath).pipe(response)
  else response.end()
}

function writeDashboardPwaArtifacts(outputPath, payload) {
  const directory = path.dirname(outputPath)
  const dashboardFile = path.basename(outputPath)
  const manifestPath = path.join(directory, 'vis-dashboard.webmanifest')
  const serviceWorkerPath = path.join(directory, 'vis-dashboard-sw.js')
  const iconPath = path.join(directory, 'vis-icon.svg')
  const cacheKey = Buffer.from(`${payload.generatedAt}:${payload.assets.length}:${dashboardFile}`).toString('base64url').slice(0, 18)
  const manifest = {
    name: 'Visual Intelligence OS',
    short_name: 'VIS',
    description: 'Local-first media asset cockpit for visual, video, audio, prompt, provenance, and Music IS handoff work.',
    start_url: `./${dashboardFile}`,
    scope: './',
    display: 'standalone',
    background_color: '#05060A',
    theme_color: '#05060A',
    orientation: 'any',
    categories: ['productivity', 'utilities', 'photo', 'music'],
    icons: [
      { src: './vis-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  fs.writeFileSync(iconPath, renderIconSvg(), 'utf-8')
  fs.writeFileSync(serviceWorkerPath, renderServiceWorker({ cacheKey, dashboardFile }), 'utf-8')
  return {
    manifest: path.basename(manifestPath),
    serviceWorker: path.basename(serviceWorkerPath),
    icon: path.basename(iconPath),
    cacheKey,
  }
}

function renderIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="VIS">
  <rect width="512" height="512" rx="96" fill="#05060A"/>
  <path d="M118 336 196 132h52l-78 204h-52Zm126 0 36-94 34 94h54l-74-204h-30l-74 204h54Zm148 0V132h-46v204h46Z" fill="#F2F5FA"/>
  <path d="M96 390h320" stroke="#7CB7FF" stroke-width="18" stroke-linecap="round"/>
  <path d="M110 390h146" stroke="#45D6A5" stroke-width="18" stroke-linecap="round"/>
</svg>`
}

function renderServiceWorker({ cacheKey, dashboardFile }) {
  return `const CACHE_NAME = "vis-dashboard-${cacheKey}";
const SHELL_ASSETS = ["./", "./${dashboardFile}", "./vis-dashboard.webmanifest", "./vis-icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("vis-dashboard-") && key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/__vis_media/")) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (url.origin === self.location.origin && response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
    }
    return response;
  }).catch(() => caches.match("./${dashboardFile}"))));
});`
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const types = {
    '.avif': 'image/avif',
    '.css': 'text/css; charset=utf-8',
    '.flac': 'audio/flac',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.m4a': 'audio/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.webp': 'image/webp',
  }
  return types[ext] || 'application/octet-stream'
}

function deriveDashboardFacets(assets, duplicates, orphans, similar) {
  const duplicateAssetIds = new Set(duplicates.flatMap(group => (group.assets || []).map(asset => asset.asset_id)))
  const similarAssetIds = new Set((similar.groups || []).flatMap(group => (group.assets || []).map(asset => asset.asset_id)))

  return {
    duplicateAssetIds: [...duplicateAssetIds],
    similarAssetIds: [...similarAssetIds],
    sources: topCounts(assets.map(sourceLabel), 20),
    folders: topCounts(assets.map(folderLabel), 30),
    tags: topCounts(assets.flatMap(asset => asset.tags || []), 40),
  }
}

function topCounts(values, limit) {
  const counts = new Map()
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id, count]) => ({ id, label: id, count }))
}

function sourceLabel(asset) {
  return asset.repo || path.basename(asset.root || '') || 'local'
}

function folderLabel(asset) {
  const rel = String(asset.relative_path || asset.primary_path || '').replace(/\\/g, '/')
  const parts = rel.split('/').filter(Boolean)
  if (parts.length > 2) return parts.slice(0, 2).join('/')
  if (parts.length > 1) return parts[0]
  return asset.category || 'assets'
}

function renderDashboardHtml(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#05060A">
<meta name="application-name" content="VIS">
<link rel="manifest" href="./${data.pwa.manifest}">
<link rel="icon" href="./${data.pwa.icon}" type="image/svg+xml">
<title>Visual Intelligence OS</title>
<style>
:root{
  --bg:#05060A;
  --rail:#070910;
  --surface:#0B0E14;
  --surface-2:#111723;
  --surface-3:#151B27;
  --border:#202838;
  --ink:#F2F5FA;
  --muted:#929AB0;
  --soft:#B9C0D1;
  --accent:#7CB7FF;
  --mint:#45D6A5;
  --gold:#F5C45D;
  --rose:#FF7A90;
  --violet:#B6A1FF;
  --radius:8px;
}
*{box-sizing:border-box}
html{font-size:16px;scroll-behavior:smooth}
body{
  margin:0;
  background:var(--bg);
  color:var(--ink);
  font-family:Instrument Sans,Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  line-height:1.45;
  letter-spacing:0;
}
button,input,select{font:inherit}
button{
  border:1px solid var(--border);
  background:var(--surface-2);
  color:var(--ink);
  border-radius:var(--radius);
  min-height:36px;
  padding:0 12px;
  cursor:pointer;
}
button:hover{border-color:#34415A;background:#151D2C}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.shell{min-height:100vh;display:grid;grid-template-columns:310px minmax(0,1fr)}
.rail{
  border-right:1px solid var(--border);
  background:var(--rail);
  padding:18px;
  position:sticky;
  top:0;
  height:100vh;
  overflow:auto;
}
.mark{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.mark-badge{
  width:36px;height:36px;border:1px solid #2D3750;border-radius:8px;
  display:grid;place-items:center;color:var(--accent);font-weight:750;background:#0D1420;
}
.mark h1{font-size:18px;line-height:1.15;margin:0;font-weight:700}
.mark p{margin:2px 0 0;color:var(--muted);font-size:12px}
.rail-section{margin:20px 0 0}
.rail-section h2{font-size:12px;text-transform:uppercase;color:#A9B0C6;margin:0 0 10px;font-weight:700}
.metric{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding:9px 0;font-size:14px}
.metric span:first-child{color:var(--muted)}
.metric strong{font-variant-numeric:tabular-nums}
.lane-list{display:grid;gap:6px}
.lane-btn{
  display:flex;align-items:center;justify-content:space-between;width:100%;
  background:transparent;border-color:transparent;text-align:left;padding:8px 10px;color:#CDD3E5;
}
.lane-btn[aria-pressed="true"]{background:#101827;border-color:#2B3954;color:var(--ink)}
.lane-btn span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lane-count{color:var(--muted);font-size:12px;margin-left:10px}
.main{min-width:0}
.topbar{
  position:sticky;top:0;z-index:5;
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:12px 18px;border-bottom:1px solid var(--border);
  background:rgba(5,6,10,.94);backdrop-filter:blur(16px);
}
.search{
  flex:1 1 280px;min-width:220px;height:40px;border:1px solid var(--border);
  background:var(--surface);border-radius:var(--radius);color:var(--ink);padding:0 12px;
}
.select{height:40px;border:1px solid var(--border);background:var(--surface);color:var(--ink);border-radius:var(--radius);padding:0 10px;max-width:180px}
.action-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.workspace{padding:18px;display:grid;gap:18px}
.band{border-bottom:1px solid var(--border);padding-bottom:16px;display:grid;gap:8px}
.band h2{font-size:18px;margin:0}
.band p{color:var(--muted);margin:0;font-size:14px;max-width:880px}
.focus-line{display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:var(--soft);font-size:12px}
.status-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.status{
  min-height:86px;border:1px solid var(--border);border-radius:var(--radius);
  background:var(--surface);padding:13px;
}
.status small{color:var(--muted);display:block;font-size:12px}
.status strong{display:block;font-size:24px;line-height:1.1;margin-top:8px;font-variant-numeric:tabular-nums}
.status.good strong{color:var(--mint)}
.status.warn strong{color:var(--gold)}
.status.accent strong{color:var(--accent)}
.status.rose strong{color:var(--rose)}
.boards{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:14px;align-items:start}
.grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(168px,1fr));
  gap:10px;
}
.asset{
  position:relative;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);
  overflow:hidden;min-width:0;min-height:236px;display:flex;flex-direction:column;
}
.asset.selected{border-color:var(--accent);box-shadow:0 0 0 1px rgba(124,183,255,.22)}
.asset-open{all:unset;display:flex;flex-direction:column;min-height:236px;cursor:pointer}
.asset-open:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.asset-select{
  position:absolute;top:8px;right:8px;z-index:2;width:30px;height:30px;min-height:30px;padding:0;
  display:grid;place-items:center;border-radius:999px;background:rgba(5,6,10,.76);backdrop-filter:blur(8px);
}
.asset-select[aria-pressed="true"]{background:#12314A;border-color:var(--accent);color:var(--accent)}
.thumb{
  aspect-ratio:1/1;background:#080B12;border-bottom:1px solid var(--border);
  display:grid;place-items:center;overflow:hidden;
}
.thumb img,.thumb video{width:100%;height:100%;object-fit:cover;display:block}
.thumb .fallback{color:var(--muted);font-size:12px;text-align:center;padding:12px}
.audio-tile{width:100%;height:100%;display:grid;place-items:center;padding:12px;background:#0D1018}
.audio-mark{width:100%;height:100%;border:1px solid #26324B;border-radius:8px;display:grid;place-items:center;color:var(--mint);font-weight:800;font-size:12px}
.preview .audio-tile{min-height:260px;gap:14px}
.preview .audio-mark{height:150px}
.preview audio{width:min(460px,100%)}
.asset-body{padding:10px;display:grid;gap:6px}
.asset-title{font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asset-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:var(--muted);font-size:11px;min-height:22px}
.pill{border:1px solid var(--border);background:#0D1320;border-radius:999px;padding:2px 7px;color:#B9C1D8;font-size:11px;line-height:1.45}
.pill.good{border-color:rgba(69,214,165,.35);color:#8FE8C0}
.pill.warn{border-color:rgba(245,196,93,.42);color:#F7D68B}
.pill.bad{border-color:rgba(255,122,144,.45);color:#FFB1BE}
.swatches{display:flex;gap:5px;align-items:center;min-height:18px;margin-top:2px;flex-wrap:wrap}
.swatch{width:18px;height:18px;border-radius:5px;border:1px solid rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(0,0,0,.22)}
.swatch-label{font-size:11px;color:var(--muted)}
.side{display:grid;gap:12px}
.panel{
  border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);padding:13px;
}
.panel h3{font-size:14px;margin:0 0 10px}
.mini-list{display:grid;gap:8px;max-height:260px;overflow:auto}
.mini-item{border-top:1px solid var(--border);padding-top:8px;font-size:12px;color:var(--muted)}
.mini-item strong{display:block;color:var(--ink);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mini-item button{margin-top:6px;min-height:30px;font-size:12px}
.recipe-list{display:grid;gap:8px}
.recipe-item{border-top:1px solid var(--border);padding-top:8px;font-size:12px;color:var(--muted);display:grid;gap:6px}
.recipe-item strong{color:var(--ink);font-size:12px}
.recipe-item button{justify-self:start;min-height:30px;font-size:12px}
.command-shelf{display:grid;gap:8px}
.command-row{border-top:1px solid var(--border);padding-top:8px;display:grid;gap:7px;font-size:12px;color:var(--muted)}
.command-row strong{font-size:12px;color:var(--ink)}
.command-actions{display:flex;gap:6px;flex-wrap:wrap}
.command-actions button{min-height:30px;font-size:12px;padding:0 9px}
.command-note{color:var(--muted);font-size:12px;line-height:1.45}
.drawer{
  position:fixed;right:0;top:0;width:min(660px,100vw);height:100vh;background:#070A11;border-left:1px solid var(--border);
  transform:translateX(100%);transition:transform .18s ease;z-index:20;display:flex;flex-direction:column;
  box-shadow:-12px 0 36px rgba(0,0,0,.65);
}
.drawer.open{transform:translateX(0)}
.drawer-head{
  display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;
  border-bottom:1px solid var(--border);background:#090D16;
}
.drawer-nav{display:flex;align-items:center;gap:6px}
.nav-btn{
  min-height:28px;height:28px;padding:0 8px;font-size:12px;background:var(--surface);
  border:1px solid var(--border);border-radius:5px;color:var(--ink);cursor:pointer;
}
.nav-btn:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
.nav-btn:disabled{opacity:.35;cursor:not-allowed}
.drawer-index{font-size:11px;color:var(--muted);min-width:60px;text-align:center}
.drawer-head h2{
  font-size:15px;margin:0;min-width:0;flex:1;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;font-weight:700;color:var(--ink);
}
.close-btn{
  min-height:28px;height:28px;padding:0 10px;font-size:12px;background:var(--surface);
  border:1px solid var(--border);border-radius:5px;cursor:pointer;
}
.close-btn:hover{border-color:var(--rose);color:var(--rose)}
.drawer-body{padding:16px;overflow-y:auto;display:grid;gap:14px}

/* Review & Taste Curation HUD */
.curation-card{
  background:linear-gradient(180deg,#0D1322 0%,#080C16 100%);
  border:1px solid #23304A;border-radius:10px;padding:14px 16px;display:grid;gap:12px;
}
.curation-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.curation-title{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
.star-rating{display:flex;align-items:center;gap:3px}
.star-btn{
  background:transparent;border:none;min-height:auto;padding:2px 4px;font-size:22px;line-height:1;
  color:#334155;cursor:pointer;transition:transform .1s ease, color .1s ease;
}
.star-btn:hover{transform:scale(1.25);color:var(--gold)}
.star-btn.active{color:var(--gold)}
.star-label{font-size:12px;color:var(--muted);margin-left:6px;font-weight:600}
.verdict-row{display:flex;gap:8px;align-items:center}
.btn-approve{
  background:rgba(69,214,165,.14);border:1px solid var(--mint);color:#8FE8C0;
  font-weight:700;font-size:13px;flex:1;min-height:34px;border-radius:6px;cursor:pointer;
}
.btn-approve:hover{background:rgba(69,214,165,.26)}
.btn-reject{
  background:rgba(255,122,144,.14);border:1px solid var(--rose);color:#FFB1BE;
  font-weight:700;font-size:13px;flex:1;min-height:34px;border-radius:6px;cursor:pointer;
}
.btn-reject:hover{background:rgba(255,122,144,.26)}
.btn-undo{
  background:var(--surface);border:1px solid var(--border);color:var(--soft);
  font-size:12px;padding:0 10px;min-height:34px;border-radius:6px;cursor:pointer;
}
.btn-undo:hover{border-color:var(--accent);color:var(--ink)}
.defect-section{display:grid;gap:6px;border-top:1px solid rgba(255,255,255,.06);padding-top:10px}
.defect-label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:650}
.defect-chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{
  background:#0B101C;border:1px solid #1E293B;color:#94A3B8;border-radius:999px;
  font-size:11px;padding:4px 10px;cursor:pointer;transition:all .12s ease;min-height:26px;
}
.chip:hover{border-color:#384B66;color:#E2E8F0}
.chip.active{background:rgba(255,122,144,.22);border-color:var(--rose);color:#FFD2DA;font-weight:600}
.note-input{
  width:100%;background:#06080F;border:1px solid #1F293D;border-radius:6px;color:var(--ink);
  padding:8px 10px;font-size:12px;font-family:inherit;min-height:48px;resize:vertical;box-sizing:border-box;
}
.note-input:focus{outline:2px solid var(--accent);outline-offset:0}
.curation-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.scope-select{height:32px;font-size:12px;background:#06080F;border:1px solid #1F293D;color:var(--soft);border-radius:6px;padding:0 8px}
.btn-save-feedback{
  background:var(--accent);color:#05060A;font-weight:750;font-size:12px;height:32px;
  border:none;border-radius:6px;padding:0 14px;cursor:pointer;
}
.btn-save-feedback:hover{background:#9DC8FF}
.receipt-hud{
  font-family:Geist Mono,SFMono-Regular,Consolas,monospace;font-size:11px;padding:7px 10px;border-radius:6px;
  background:rgba(69,214,165,.08);border:1px solid rgba(69,214,165,.25);color:var(--mint);display:flex;align-items:center;gap:6px;
}

/* Prompt & Reproducibility Section */
.prompt-box{
  background:#070C18;border:1px solid #1E2D48;border-radius:10px;padding:14px 16px;display:grid;gap:10px;
}
.prompt-header{display:flex;justify-content:space-between;align-items:center}
.prompt-badge{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--accent);display:flex;align-items:center;gap:6px}
.prompt-content{
  background:#04060C;border:1px solid #162034;border-radius:6px;padding:10px 12px;font-size:13px;line-height:1.55;
  color:#E2E8F0;max-height:220px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;font-family:inherit;
}
.prompt-gap{background:rgba(245,196,93,.08);border:1px dashed rgba(245,196,93,.3);border-radius:6px;padding:12px;color:var(--gold);font-size:12px}
.negative-prompt-box{display:grid;gap:5px}
.negative-prompt-label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#F87171;font-weight:650}
.negative-prompt-content{
  background:#0A060C;border:1px solid #331A26;border-radius:6px;padding:8px 10px;font-size:12px;color:#FCA5A5;
}
.prompt-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.copy-prompt-btn{
  background:var(--accent);color:#05060A;font-weight:750;font-size:12px;height:32px;border:none;border-radius:6px;
  padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;
}
.copy-prompt-btn:hover{background:#9DC8FF}

/* Generation & Model Specs */
.gen-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.gen-card{background:#090E19;border:1px solid #1A2438;border-radius:6px;padding:8px 10px}
.gen-card span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.gen-card strong{display:block;font-size:12px;color:var(--ink);font-family:Geist Mono,monospace;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* AST Code Usages */
.usage-box{background:#070A12;border:1px solid var(--border);border-radius:8px;padding:12px 14px;display:grid;gap:8px}
.usage-header{font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.04em;color:var(--soft)}
.usage-item{
  background:#0B0F1B;border:1px solid #192336;border-radius:5px;padding:6px 10px;display:flex;justify-content:space-between;
  align-items:center;font-size:11px;font-family:Geist Mono,monospace;color:#CBD5E1;cursor:pointer;
}
.usage-item:hover{border-color:var(--accent);color:var(--ink)}
.usage-ref{color:var(--muted);font-size:10px;margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}

.preview{background:#05060A;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;display:grid;place-items:center;min-height:260px}
.preview img,.preview video{max-width:100%;max-height:430px;display:block}
.kv{display:grid;grid-template-columns:132px minmax(0,1fr);gap:8px;font-size:13px;border-top:1px solid var(--border);padding-top:10px}
.kv span:first-child{color:var(--muted)}
.mono{font-family:Geist Mono,SFMono-Regular,Consolas,monospace;font-size:12px;word-break:break-all}
.empty{color:var(--muted);font-size:13px;border:1px dashed var(--border);border-radius:var(--radius);padding:16px;text-align:center}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#101827;border:1px solid #26324B;border-radius:8px;padding:10px 14px;color:var(--ink);font-size:13px;opacity:0;pointer-events:none;transition:opacity .16s ease;z-index:30}
.toast.show{opacity:1}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .drawer,.toast{transition:none}
}
@media (max-width:1180px){
  .shell{grid-template-columns:1fr}
  .rail{position:relative;height:auto;border-right:0;border-bottom:1px solid var(--border)}
  .boards{grid-template-columns:1fr}
  .status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:720px){
  .shell{display:flex;flex-direction:column}
  .main{order:1}
  .rail{order:2}
  .workspace{padding:14px}
  .topbar{padding:12px}
  .select{max-width:none;flex:1 1 150px}
  .grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .status-grid{grid-template-columns:1fr}
  .asset,.asset-open{min-height:202px}
  .kv{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div class="shell">
  <aside class="rail">
    <div class="mark">
      <div class="mark-badge">VIS</div>
      <div>
        <h1>Visual Intelligence OS</h1>
        <p id="generatedAt"></p>
      </div>
    </div>
    <section class="rail-section">
      <h2>Estate</h2>
      <div class="metric"><span>Assets</span><strong id="mAssets">0</strong></div>
      <div class="metric"><span>Versions</span><strong id="mVersions">0</strong></div>
      <div class="metric"><span>Locations</span><strong id="mLocations">0</strong></div>
      <div class="metric"><span>Usage edges</span><strong id="mUsage">0</strong></div>
      <div class="metric"><span>Prompts</span><strong id="mPrompts">0</strong></div>
      <div class="metric"><span>Annotations</span><strong id="mAnnotations">0</strong></div>
      <div class="metric"><span>Saved searches</span><strong id="mSavedSearches">0</strong></div>
      <div class="metric"><span>App shell</span><strong id="mPwa">file</strong></div>
    </section>
    <section class="rail-section">
      <h2>Smart Collections</h2>
      <div class="lane-list" id="smartCollections"></div>
    </section>
    <section class="rail-section">
      <h2>Saved Searches</h2>
      <div class="lane-list" id="savedSearches"></div>
    </section>
    <section class="rail-section">
      <h2>Categories</h2>
      <div class="lane-list" id="lanes"></div>
    </section>
    <section class="rail-section">
      <h2>Sources</h2>
      <div class="lane-list" id="sources"></div>
    </section>
    <section class="rail-section">
      <h2>Folders</h2>
      <div class="lane-list" id="folders"></div>
    </section>
  </aside>
  <main class="main">
    <div class="topbar">
      <input id="search" class="search" placeholder="Search assets, prompts, tags, paths..." aria-label="Search assets">
      <select id="mediaFilter" class="select" aria-label="Media filter">
        <option value="">All media</option>
        <option value="image">Images</option>
        <option value="video">Video</option>
        <option value="audio">Audio</option>
      </select>
      <select id="readinessFilter" class="select" aria-label="Readiness filter">
        <option value="">All readiness</option>
        <option value="approved">Approved</option>
        <option value="unknown">Rights unknown</option>
        <option value="used">Used somewhere</option>
        <option value="orphan">No usage</option>
      </select>
      <select id="sourceFilter" class="select" aria-label="Source filter">
        <option value="">All sources</option>
      </select>
      <select id="sortFilter" class="select" aria-label="Sort assets">
        <option value="newest">Newest</option>
        <option value="score">Score</option>
        <option value="usage">Usage</option>
        <option value="size">Size</option>
        <option value="title">Title</option>
      </select>
      <div class="action-row">
        <button id="selectVisible">Select visible</button>
        <button id="clearSelection">Clear</button>
        <button id="copySelection">Copy packets</button>
        <button id="copyCurationCommand">Copy curate cmd</button>
        <button id="copyReviewCommand">Copy rights gate</button>
      </div>
    </div>
    <div class="workspace">
      <section class="band">
        <h2>Asset graph cockpit</h2>
        <p id="brief"></p>
        <div class="focus-line" id="focusLine"></div>
      </section>
      <section class="status-grid">
        <div class="status accent"><small>Indexed assets</small><strong id="sAssets">0</strong></div>
        <div class="status good"><small>Prompts linked</small><strong id="sPrompts">0</strong></div>
        <div class="status warn"><small>Duplicate groups</small><strong id="sDuplicates">0</strong></div>
        <div class="status rose"><small>Rights review</small><strong id="sRights">0</strong></div>
        <div class="status"><small>Selected</small><strong id="sSelected">0</strong></div>
      </section>
      <section class="boards">
        <div class="grid" id="grid"></div>
        <aside class="side">
          <div class="panel">
            <h3>Selected command shelf</h3>
            <div class="command-shelf" id="commandShelf"></div>
          </div>
          <div class="panel">
            <h3>Selected packet tray</h3>
            <div class="mini-list" id="selectionTray"></div>
          </div>
          <div class="panel">
            <h3>Action recipes</h3>
            <div class="recipe-list" id="actionRecipes"></div>
          </div>
          <div class="panel">
            <h3>Music release queue</h3>
            <div class="mini-list" id="musicQueue"></div>
          </div>
          <div class="panel">
            <h3>Website and social readiness</h3>
            <div class="mini-list" id="readyQueue"></div>
          </div>
          <div class="panel">
            <h3>Similarity review</h3>
            <div class="mini-list" id="similarQueue"></div>
          </div>
          <div class="panel">
            <h3>Duplicate groups</h3>
            <div class="mini-list" id="duplicates"></div>
          </div>
          <div class="panel">
            <h3>Orphans to curate</h3>
            <div class="mini-list" id="orphans"></div>
          </div>
        </aside>
      </section>
    </div>
  </main>
</div>
<aside class="drawer" id="drawer" aria-hidden="true">
  <div class="drawer-head">
    <div class="drawer-nav">
      <button class="nav-btn" id="prevAssetBtn" title="Previous asset [ [ ]" aria-label="Previous asset">◀</button>
      <span class="drawer-index mono" id="drawerIndex">0 / 0</span>
      <button class="nav-btn" id="nextAssetBtn" title="Next asset [ ] ]" aria-label="Next asset">▶</button>
    </div>
    <h2 id="drawerTitle">Asset</h2>
    <button class="close-btn" id="closeDrawer" aria-label="Close detail">✕ Esc</button>
  </div>
  <div class="drawer-body" id="drawerBody"></div>
</aside>
<div class="toast" id="toast"></div>
<script>
const DATA = ${json};
const DUPLICATE_IDS = new Set(DATA.duplicateAssetIds || []);
const SIMILAR_IDS = new Set(DATA.similarAssetIds || []);
let activeCategory = "";
const selectedIds = new Set();
const state = { query:"", media:"", readiness:"", source:"", folder:"", smart:"", saved:"", sort:"newest" };
const $ = (id) => document.getElementById(id);

let currentAssetId = null;
let currentAssetIndex = -1;
let currentDefects = new Set();
let currentRating = 0;
let lastFeedbackReceipt = null;
const DEFECT_OPTIONS = [
  "Artifacts / Glitches",
  "Brand Mismatch",
  "Anatomy / Hands",
  "Composition / Crop",
  "AI Slop Text",
  "Low Resolution",
  "Harsh Lighting",
  "Style Drift"
];

function pathBasename(p){
  const parts = String(p || "").replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || p;
}

function prevAsset(){
  const list = filteredAssets();
  if (currentAssetIndex > 0) {
    openAsset(list[currentAssetIndex - 1].asset_id);
  }
}

function nextAsset(){
  const list = filteredAssets();
  if (currentAssetIndex >= 0 && currentAssetIndex < list.length - 1) {
    openAsset(list[currentAssetIndex + 1].asset_id);
  }
}

function setRating(rating, autoSubmit = true){
  currentRating = rating;
  updateStarUi(rating);
  if (autoSubmit) {
    submitFeedback(rating >= 4 ? "approve" : (rating <= 2 ? "reject" : "rate"), rating);
  }
}

function updateStarUi(rating){
  const stars = $("drawerBody")?.querySelectorAll(".star-btn");
  if (!stars) return;
  stars.forEach(btn => {
    const val = Number(btn.dataset.value || 0);
    if (val <= rating) btn.classList.add("active");
    else btn.classList.remove("active");
  });
  const labelEl = $("drawerBody")?.querySelector("#starLabel");
  if (labelEl) {
    const labels = ["", "1/5 - Defective / Reject", "2/5 - Poor / Revision needed", "3/5 - Acceptable / Needs polish", "4/5 - Strong candidate", "5/5 - Exemplary brand canon"];
    labelEl.textContent = labels[rating] || (rating ? rating + "/5" : "Click to rate");
  }
}

function toggleDefectChip(chipName){
  if (currentDefects.has(chipName)) currentDefects.delete(chipName);
  else currentDefects.add(chipName);
  const chips = $("drawerBody")?.querySelectorAll(".chip");
  chips?.forEach(chip => {
    if (currentDefects.has(chip.dataset.defect)) chip.classList.add("active");
    else chip.classList.remove("active");
  });
}

function approveCurrentAsset(){
  currentRating = Math.max(currentRating, 4);
  submitFeedback("approve", currentRating);
}

function rejectCurrentAsset(){
  currentRating = currentRating > 0 && currentRating <= 2 ? currentRating : 1;
  submitFeedback("reject", currentRating);
}

function undoCurrentAsset(){
  if (!currentAssetId) return;
  if (location.protocol.startsWith("http")) {
    fetch("/api/feedback/undo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asset_id: currentAssetId }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        toast("↶ Feedback reverted");
        const asset = DATA.assets.find(a => a.asset_id === currentAssetId);
        if (asset) {
          asset.approval_status = data.approval_status || "candidate";
          asset.curation_status = "uncurated";
          asset.rating = null;
        }
        openAsset(currentAssetId);
        renderGrid();
      } else {
        toast(data.error || "Undo failed");
      }
    })
    .catch(err => toast("Undo error: " + err.message));
  } else {
    toast("Undo requires live dashboard server");
  }
}

function copyCurrentPrompt(){
  const asset = DATA.assets.find(a => a.asset_id === currentAssetId);
  if (asset?.prompt_text) copy(asset.prompt_text);
  else toast("No prompt text available");
}

function submitFeedback(action, ratingOverride){
  if (!currentAssetId) return;
  const asset = DATA.assets.find(a => a.asset_id === currentAssetId);
  if (!asset) return;

  const rating = ratingOverride !== undefined ? ratingOverride : currentRating;
  const defects = [...currentDefects];
  const notes = $("curationNote")?.value?.trim() || "";
  const scope = $("curationScope")?.value || "asset";
  const brand = asset.repo?.includes("frankx") ? "frankx" : (asset.repo?.includes("arcanea") ? "arcanea" : "estate");

  const payload = {
    asset_id: currentAssetId,
    action,
    rating: rating || null,
    defects,
    notes: notes || null,
    scope,
    brand,
    actor: "frank"
  };

  if (location.protocol.startsWith("http")) {
    fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        lastFeedbackReceipt = data.receipt;
        asset.rating = rating;
        asset.approval_status = data.receipt.approval_status;
        asset.curation_status = data.receipt.curation_status;
        if (notes) asset.annotation_notes = notes;
        renderGrid();
        renderMetrics();
        const hud = $("receiptHud");
        if (hud) {
          hud.innerHTML = '<span>✓</span><span>Synced to SQLite & TASTE_FEEDBACK_LEDGER.jsonl (' + esc(data.receipt.outbox_id.slice(0, 16)) + '...)</span>';
          hud.style.display = "flex";
        }
        toast("✓ Decision recorded: " + (action === "approve" ? "Approved" : action === "reject" ? "Rejected" : rating + " stars"));
      } else {
        toast("Feedback failed: " + (data.error || "Unknown error"));
      }
    })
    .catch(err => toast("Network error: " + err.message));
  } else {
    asset.rating = rating;
    asset.approval_status = action === "approve" ? "approved" : (action === "reject" ? "rejected" : asset.approval_status);
    renderGrid();
    toast("Saved in memory (server needed for persistent ledger sync)");
  }
}

function fmt(n){ return Number(n || 0).toLocaleString(); }
function esc(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function sourceLabel(asset){
  if (asset.repo) return asset.repo;
  const root = String(asset.root || "").replace(/\\\\/g, "/").split("/").filter(Boolean);
  return root[root.length - 1] || "local";
}
function folderLabel(asset){
  const rel = String(asset.relative_path || asset.primary_path || "").replace(/\\\\/g, "/");
  const parts = rel.split("/").filter(Boolean);
  if (parts.length > 2) return parts.slice(0,2).join("/");
  if (parts.length > 1) return parts[0];
  return asset.category || "assets";
}
function assetScore(asset){
  return DATA.scores[asset.asset_id] || null;
}
function assetHay(asset){
  const paletteText = [
    asset.dominant_color,
    ...(asset.color_families || []),
    ...((asset.color_palette?.colors || []).map(color => color.hex + " " + color.family)),
  ];
  return [asset.asset_id, asset.title, asset.relative_path, asset.public_path, asset.category, asset.mood, asset.rights_status, asset.approval_status, asset.media_role, asset.workflow, asset.curation_status, asset.annotation_notes, sourceLabel(asset), folderLabel(asset), ...paletteText, ...(asset.tags || [])].join(" ").toLowerCase();
}
function paletteSwatches(asset, limit){
  const colors = (asset.color_palette?.colors || []).slice(0, limit || 5);
  if (!colors.length) return "";
  return '<div class="swatches">' + colors.map(color => (
    '<span class="swatch" title="'+esc((color.hex || "") + " " + (color.family || ""))+'" style="background:'+esc(color.hex || "#111827")+'"></span>'
  )).join("") + '<span class="swatch-label">'+esc((asset.color_families || []).slice(0,3).join(", "))+'</span></div>';
}
function readiness(asset){
  if (asset.publish_gate && asset.publish_gate.allowed === false) return asset.rights_status === "blocked" || asset.approval_status === "rejected" ? "blocked" : "unknown";
  if (asset.approval_status === "approved") return "approved";
  if (asset.rights_status === "unknown" || asset.rights_status === "needs-review") return "unknown";
  if ((asset.usage_count || 0) > 0) return "used";
  return "orphan";
}
function readinessPill(asset){
  const r = readiness(asset);
  if (r === "approved") return '<span class="pill good">approved</span>';
  if (r === "blocked") return '<span class="pill bad">blocked</span>';
  if (r === "unknown") return '<span class="pill warn">rights</span>';
  if (r === "used") return '<span class="pill good">used</span>';
  return '<span class="pill">orphan</span>';
}
function smartMatches(asset, id){
  if (!id) return true;
  if (id === "inbox") return asset.approval_status !== "approved" && asset.approval_status !== "rejected";
  if (id === "rights-review") return ["unknown","needs-review"].includes(asset.rights_status);
  if (id === "prompt-gaps") return Number(asset.prompt_count || 0) === 0;
  if (id === "provenance-gaps") return Number(asset.generation_count || 0) === 0 && Number(asset.agent_run_count || 0) === 0;
  if (id === "website-used") return Number(asset.usage_count || 0) > 0;
  if (id === "orphans") return Number(asset.usage_count || 0) === 0;
  if (id === "duplicates") return DUPLICATE_IDS.has(asset.asset_id);
  if (id === "similar-review") return SIMILAR_IDS.has(asset.asset_id);
  if (id === "curated") return Boolean(asset.annotation);
  if (id === "favorites") return Number(asset.rating || 0) >= 4 || ["favorite","approved"].includes(asset.curation_status);
  if (id === "unannotated") return !asset.annotation;
  if (id === "music") return asset.workflow === "music-release" || asset.media_type === "audio" || (asset.tags || []).includes("music");
  if (id === "video-motion") return asset.media_type === "video";
  if (id === "nft-web3") return asset.category === "nft-web3" || (asset.tags || []).includes("web3");
  if (id === "website-ready") return asset.media_type === "image" && asset.publish_gate?.allowed === true && Number(asset.sizeKB || 0) <= 2000;
  if (id === "social-ready") return ["image","video"].includes(asset.media_type) && asset.publish_gate?.allowed === true;
  return true;
}
function savedSearchMatches(asset, id){
  if (!id) return true;
  const search = (DATA.savedSearches || []).find(item => item.saved_search_id === id || item.name === id);
  if (!search) return true;
  const filters = search.filters || {};
  if (filters.mediaType && asset.media_type !== filters.mediaType) return false;
  if (filters.category && asset.category !== filters.category) return false;
  if (filters.tag && !(asset.tags || []).includes(filters.tag)) return false;
  if (filters.mood && asset.mood !== filters.mood) return false;
  if (filters.curationStatus && asset.curation_status !== filters.curationStatus) return false;
  if (filters.minRating && Number(asset.rating || 0) < Number(filters.minRating)) return false;
  const query = String(search.query || filters.query || "").trim().toLowerCase().split(/\\s+/).filter(Boolean);
  if (query.length && !query.every(word => assetHay(asset).includes(word))) return false;
  return true;
}
function mediaPreview(asset, mode){
  const src = assetMediaSrc(asset);
  if (asset.media_type === "image" && src) return '<img src="'+esc(src)+'" alt="">';
  if (asset.media_type === "video" && src) return '<video src="'+esc(src)+'" muted controls preload="none"></video>';
  if (asset.media_type === "audio" && asset.file_url) {
    const controls = mode === "detail" ? '<audio src="'+esc(src)+'" controls preload="none"></audio>' : "";
    return '<div class="audio-tile"><div class="audio-mark">AUDIO</div>'+controls+'</div>';
  }
  return '<div class="fallback">'+esc(asset.media_type || "asset")+'<br>'+esc(asset.extension || "")+'</div>';
}
function assetMediaSrc(asset){
  if (!asset.file_url) return "";
  if (location.protocol === "http:" || location.protocol === "https:") return "./__vis_media/" + encodeURIComponent(asset.asset_id);
  return asset.file_url;
}
function filteredAssets(){
  const words = state.query.trim().toLowerCase().split(/\\s+/).filter(Boolean);
  const rows = DATA.assets.filter(asset => {
    if (activeCategory && asset.category !== activeCategory) return false;
    if (state.smart && !smartMatches(asset, state.smart)) return false;
    if (state.saved && !savedSearchMatches(asset, state.saved)) return false;
    if (state.folder && folderLabel(asset) !== state.folder) return false;
    if (state.source && sourceLabel(asset) !== state.source) return false;
    if (state.media && asset.media_type !== state.media) return false;
    if (state.readiness && readiness(asset) !== state.readiness) return false;
    const hay = assetHay(asset);
    return words.every(word => hay.includes(word));
  });
  return rows.sort((a,b) => {
    if (state.sort === "score") return ((assetScore(b)?.score || 0) - (assetScore(a)?.score || 0)) || String(a.title).localeCompare(String(b.title));
    if (state.sort === "usage") return Number(b.usage_count || 0) - Number(a.usage_count || 0);
    if (state.sort === "size") return Number(b.byte_size || 0) - Number(a.byte_size || 0);
    if (state.sort === "title") return String(a.title || "").localeCompare(String(b.title || ""));
    return String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || ""));
  });
}
function packetFor(asset){
  return DATA.packetSamples[asset.asset_id] || {
    asset_id: asset.asset_id,
    visual_uri: asset.visual_uri,
    local_path: asset.absolute_path,
    media_type: asset.media_type,
    media_role: asset.media_role,
    workflow: asset.workflow,
    publish_gate: asset.publish_gate,
    codex_prompt: "Use this VIS asset: " + asset.visual_uri + "\\nLocal path: " + (asset.absolute_path || "") + "\\nPublic-use gate: " + (asset.publish_gate?.status || "unknown")
  };
}
function selectedAssets(){
  return [...selectedIds].map(id => DATA.assets.find(asset => asset.asset_id === id)).filter(Boolean);
}
function assetBrief(asset){
  return {
    asset_id: asset.asset_id,
    visual_uri: asset.visual_uri,
    title: asset.title,
    media_type: asset.media_type,
    media_role: asset.media_role,
    workflow: asset.workflow,
    rights_status: asset.rights_status,
    approval_status: asset.approval_status,
    publish_ready: asset.publish_gate?.allowed === true,
    path: asset.absolute_path || asset.relative_path
  };
}
function publicHandoff(kind, asset, packet){
  const gate = packet.publish_gate || asset.publish_gate || {};
  const allowed = gate.allowed === true;
  return {
    intended_use: kind,
    asset: packet,
    publish_gate: gate,
    requires_human_review: !allowed,
    next: allowed
      ? (kind === "website" ? "Generate optimized derivative, place on route, then record VIS usage/publication." : "Create channel variant, schedule/post through approved tooling, then record platform URL and metrics.")
      : (gate.next_action || "Run VIS rights and approval review before public use.")
  };
}
function musicPacketFor(asset){
  const packet = packetFor(asset);
  return {
    type: "music_asset_packet",
    canonical_system: "Music IS",
    vis_packet: packet,
    next_gate: "Create or update the Music IS proof folder with audio, cover, Canvas, lyrics, credits, AI disclosure, rights, and release checklist before distribution."
  };
}
function isMusicAsset(asset){
  return asset.workflow === "music-release" || asset.media_type === "audio" || asset.media_role === "cover-art" || asset.media_role === "music-canvas" || (asset.tags || []).includes("music");
}
function renderMetrics(){
  const s = DATA.summary || {};
  const rightsReview = DATA.assets.filter(asset => ["unknown","needs-review"].includes(asset.rights_status)).length;
  $("generatedAt").textContent = new Date(DATA.generatedAt).toLocaleString();
  $("mAssets").textContent = fmt(s.assets);
  $("mVersions").textContent = fmt(s.versions);
  $("mLocations").textContent = fmt(s.locations);
  $("mUsage").textContent = fmt(s.usageEdges);
  $("mPrompts").textContent = fmt(s.prompts);
  $("mAnnotations").textContent = fmt(s.annotations);
  $("mSavedSearches").textContent = fmt(s.savedSearches);
  $("mPwa").textContent = (location.protocol === "http:" || location.protocol === "https:") ? "pwa" : "file";
  $("sAssets").textContent = fmt(DATA.assets.length);
  $("sPrompts").textContent = fmt(s.prompts);
  $("sDuplicates").textContent = fmt(DATA.duplicates.length);
  $("sRights").textContent = fmt(rightsReview);
  $("sSelected").textContent = fmt(selectedIds.size);
  $("brief").textContent = "Local-first VIS cockpit for " + DATA.root + ". It keeps browsing, provenance, website usage, social readiness, NFT/Web3 review, and Music IS handoff in one agent-readable view.";
  const focus = [];
  if (state.smart) focus.push("Smart: " + labelFor(DATA.smartCollections, state.smart));
  if (state.saved) focus.push("Saved: " + savedSearchLabel(state.saved));
  if (activeCategory) focus.push("Category: " + activeCategory);
  if (state.folder) focus.push("Folder: " + state.folder);
  if (state.source) focus.push("Source: " + state.source);
  focus.push("Visible: " + fmt(filteredAssets().length));
  $("focusLine").innerHTML = focus.map(item => '<span class="pill">'+esc(item)+'</span>').join("");
}
function labelFor(list, id){
  return (list || []).find(item => item.id === id)?.label || id;
}
function savedSearchLabel(id){
  return (DATA.savedSearches || []).find(item => item.saved_search_id === id || item.name === id)?.name || id;
}
function laneButton(item, active, attr){
  return '<button class="lane-btn" aria-pressed="'+(active ? "true" : "false")+'" '+attr+'="'+esc(item.id)+'"><span>'+esc(item.label)+'</span><span class="lane-count">'+fmt(item.count)+'</span></button>';
}
function renderFacetList(id, items, activeValue, attr, allLabel, total){
  const all = '<button class="lane-btn" aria-pressed="'+(!activeValue ? "true" : "false")+'" '+attr+'=""><span>'+esc(allLabel)+'</span><span class="lane-count">'+fmt(total)+'</span></button>';
  $(id).innerHTML = all + (items || []).map(item => laneButton(item, activeValue === item.id, attr)).join("");
  for (const btn of $(id).querySelectorAll(".lane-btn")) {
    btn.addEventListener("click", () => {
      if (attr === "data-smart") state.smart = btn.getAttribute(attr) || "";
      if (attr === "data-saved") state.saved = btn.getAttribute(attr) || "";
      if (attr === "data-category") activeCategory = btn.getAttribute(attr) || "";
      if (attr === "data-source") state.source = btn.getAttribute(attr) || "";
      if (attr === "data-folder") state.folder = btn.getAttribute(attr) || "";
      renderAll();
    });
  }
}
function renderRail(){
  const categories = {};
  for (const asset of DATA.assets) categories[asset.category || "uncategorized"] = (categories[asset.category || "uncategorized"] || 0) + 1;
  const categoryItems = Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([id,count]) => ({ id, label:id, count }));
  const savedItems = (DATA.savedSearches || []).map(search => ({
    id: search.saved_search_id,
    label: search.name,
    count: DATA.assets.filter(asset => savedSearchMatches(asset, search.saved_search_id)).length
  }));
  renderFacetList("smartCollections", DATA.smartCollections || [], state.smart, "data-smart", "All smart views", DATA.assets.length);
  renderFacetList("savedSearches", savedItems, state.saved, "data-saved", "All saved searches", DATA.assets.length);
  renderFacetList("lanes", categoryItems, activeCategory, "data-category", "All categories", DATA.assets.length);
  renderFacetList("sources", DATA.sources || [], state.source, "data-source", "All sources", DATA.assets.length);
  renderFacetList("folders", DATA.folders || [], state.folder, "data-folder", "All folders", DATA.assets.length);
}
function renderGrid(){
  const assets = filteredAssets();
  if (!assets.length) {
    $("grid").innerHTML = '<div class="empty">No assets match the current filters.</div>';
    return;
  }
  $("grid").innerHTML = assets.slice(0, 700).map(asset => {
    const selected = selectedIds.has(asset.asset_id);
    const score = assetScore(asset);
    const isApproved = asset.approval_status === "approved" || asset.curation_status === "approved";
    const isRejected = asset.approval_status === "rejected" || asset.curation_status === "rejected";
    const hasPrompt = Boolean(asset.prompt_text || (asset.prompt_count && asset.prompt_count > 0));
    return '<article class="asset '+(selected ? "selected" : "")+'">' +
      '<button class="asset-select" aria-label="Toggle selection" aria-pressed="'+(selected ? "true" : "false")+'" data-select="'+esc(asset.asset_id)+'">'+(selected ? "✓" : "+")+'</button>' +
      '<button class="asset-open" data-id="'+esc(asset.asset_id)+'">' +
        '<div class="thumb">'+mediaPreview(asset, "thumb")+'</div>' +
        '<div class="asset-body">' +
          '<div class="asset-title">'+esc(asset.title || asset.asset_id)+'</div>' +
          paletteSwatches(asset, 5) +
          '<div class="asset-meta"><span class="pill">'+esc(asset.media_type)+'</span>'+readinessPill(asset)+'<span class="pill">'+fmt(asset.sizeKB)+' KB</span></div>' +
          '<div class="asset-meta">' +
            '<span class="pill">'+esc(asset.media_role || asset.workflow || asset.category || "asset")+'</span>' +
            (isApproved ? '<span class="pill good">★ Approved</span>' : '') +
            (isRejected ? '<span class="pill bad">✕ Rejected</span>' : '') +
            (!isApproved && !isRejected && asset.rating ? '<span class="pill good">★ '+fmt(asset.rating)+'/5</span>' : '') +
            (hasPrompt ? '<span class="pill" style="border-color:rgba(124,183,255,.35);color:#7CB7FF" title="Prompt sidecar available">⚡ Prompt</span>' : '') +
          '</div>' +
          (asset.color_label || asset.curation_status ? '<div class="asset-meta"><span class="pill">'+esc(asset.color_label || asset.curation_status)+'</span></div>' : "") +
        '</div>' +
      '</button>' +
    '</article>';
  }).join("");
  for (const btn of document.querySelectorAll(".asset-open")) btn.addEventListener("click", () => openAsset(btn.dataset.id));
  for (const btn of document.querySelectorAll(".asset-select")) {
    btn.addEventListener("click", event => {
      event.stopPropagation();
      const id = btn.dataset.select;
      if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
      renderAll();
    });
  }
}
function miniAssetItem(asset, actionLabel){
  return '<div class="mini-item"><strong>'+esc(asset.title || asset.asset_id)+'</strong>'+esc(asset.media_role || asset.workflow || asset.relative_path || "")+'<br><button data-open-mini="'+esc(asset.asset_id)+'">'+esc(actionLabel || "Open")+'</button></div>';
}
function renderActionRecipes(){
  const selected = [...selectedIds];
  const recipes = DATA.actionRecipes || [];
  $("actionRecipes").innerHTML = recipes.slice(0,10).map(recipe => {
    return '<div class="recipe-item"><strong>'+esc(recipe.label)+'</strong><span>'+esc(recipe.description || "")+'</span><button data-recipe-copy="'+esc(recipe.id)+'">Copy dry-run</button></div>';
  }).join("") || '<div class="mini-item">No recipes available.</div>';
  for (const btn of $("actionRecipes").querySelectorAll("[data-recipe-copy]")) {
    btn.addEventListener("click", () => {
      const recipe = recipes.find(item => item.id === btn.getAttribute("data-recipe-copy"));
      const ids = [...selectedIds];
      copy(JSON.stringify({
        generatedAt: new Date().toISOString(),
        recipe,
        selected_count: ids.length,
        command: recipeCommand(recipe.id, ids),
        note: ids.length ? "Dry-run against selected assets. Add --execute only after review." : "Dry-run against the recipe's matching queue. Add --execute only after review.",
        mcp_tool: {
          name: "run_asset_action_recipe",
          arguments: {
            recipe: recipe.id,
            asset_ids: ids,
            execute: false
          }
        }
      }, null, 2));
    });
  }
}
function recipeCommand(recipeId, ids){
  const base = "node bin\\\\vis.mjs action-recipe " + shellArg(recipeId);
  return ids.length ? base + " " + ids.map(shellArg).join(" ") : base + " --limit 50";
}
function renderCommandShelf(){
  const assets = selectedAssets();
  const ids = assets.map(asset => asset.asset_id);
  const musicCount = assets.filter(isMusicAsset).length;
  const publishReady = assets.filter(asset => asset.publish_gate?.allowed === true).length;
  const derivativeButtons = (DATA.derivativePresets || []).map(preset => (
    '<button data-derivative-preset="'+esc(preset.id)+'">'+esc(preset.id)+'</button>'
  )).join("");
  $("commandShelf").innerHTML = (
    '<div class="command-row">' +
      '<strong>'+fmt(assets.length)+' selected assets</strong>' +
      '<div class="command-note">'+(assets.length ? esc(publishReady + " publish-ready, " + musicCount + " music/audio candidates. Clipboard actions are dry-run packets only.") : 'Select assets from the grid or a smart collection to activate batch handoffs.')+'</div>' +
      '<div class="command-actions">' +
        '<button data-batch-copy="packets">Codex packet</button>' +
        '<button data-batch-copy="website">Website use</button>' +
        '<button data-batch-copy="social">Social use</button>' +
        '<button data-batch-copy="music">Music IS</button>' +
      '</div>' +
    '</div>' +
    '<div class="command-row">' +
      '<strong>Derivative plans</strong>' +
      '<div class="command-note">Copy a manifest command for selected assets before any Sharp, FFmpeg, Cloudinary, R2, Postiz, IPFS, or thirdweb adapter runs.</div>' +
      '<div class="command-actions">'+derivativeButtons+'</div>' +
    '</div>'
  );
  for (const btn of $("commandShelf").querySelectorAll("[data-batch-copy]")) {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-batch-copy");
      if (kind === "packets") return copySelectedPackets();
      if (kind === "website" || kind === "social") return copyBatchPublicHandoff(kind);
      if (kind === "music") return copyMusicBatchHandoff();
    });
  }
  for (const btn of $("commandShelf").querySelectorAll("[data-derivative-preset]")) {
    btn.addEventListener("click", () => copyDerivativePlan(btn.getAttribute("data-derivative-preset")));
  }
}
function renderSide(){
  renderCommandShelf();
  renderActionRecipes();
  const assets = selectedAssets();
  $("selectionTray").innerHTML = assets.length
    ? assets.slice(0,15).map(asset => miniAssetItem(asset, "Inspect")).join("")
    : '<div class="mini-item">Select assets to create a multi-asset Codex packet.</div>';
  const music = DATA.assets.filter(asset => smartMatches(asset, "music")).slice(0,12);
  $("musicQueue").innerHTML = music.length
    ? music.map(asset => miniAssetItem(asset, "Music packet")).join("")
    : '<div class="mini-item">No music/audio assets in this export yet.</div>';
  const ready = DATA.assets.filter(asset => smartMatches(asset, "website-ready") || smartMatches(asset, "social-ready")).slice(0,12);
  $("readyQueue").innerHTML = ready.length
    ? ready.map(asset => miniAssetItem(asset, "Use")).join("")
    : '<div class="mini-item">No ready website/social sample in this export.</div>';
  const similarGroups = (DATA.similar && DATA.similar.groups ? DATA.similar.groups : []).slice(0,10);
  $("similarQueue").innerHTML = similarGroups.length
    ? similarGroups.map(group => {
        const assets = group.assets || [];
        const first = assets[0] || {};
        const titles = assets.slice(0,3).map(asset => esc(asset.title || asset.asset_id)).join("<br>");
        const reasons = (group.reason || []).slice(0,4).join(", ");
        return '<div class="mini-item"><strong>'+esc(group.score + " score, " + assets.length + " assets")+'</strong>'+esc(reasons)+'<br>'+titles+'<br><button data-open-mini="'+esc(first.asset_id || "")+'">Review set</button></div>';
      }).join("")
    : '<div class="mini-item">No similarity review groups in this export yet.</div>';
  $("duplicates").innerHTML = DATA.duplicates.length ? DATA.duplicates.map(group => (
    '<div class="mini-item"><strong>'+esc(group.sha256.slice(0,12))+'</strong>'+fmt(group.asset_count)+' assets, '+fmt(group.version_count)+' versions</div>'
  )).join("") : '<div class="mini-item">No duplicate groups in this sample.</div>';
  $("orphans").innerHTML = DATA.orphans.length ? DATA.orphans.slice(0,40).map(asset => (
    '<div class="mini-item"><strong>'+esc(asset.title || asset.asset_id)+'</strong>'+esc(asset.relative_path || "")+'</div>'
  )).join("") : '<div class="mini-item">No orphan sample available.</div>';
  for (const btn of document.querySelectorAll("[data-open-mini]")) btn.addEventListener("click", () => openAsset(btn.getAttribute("data-open-mini")));
}
function renderAll(){ renderMetrics(); renderRail(); renderGrid(); renderSide(); }
function openAsset(assetId){
  const asset = DATA.assets.find(a => a.asset_id === assetId);
  if (!asset) return;
  currentAssetId = assetId;

  const currentList = filteredAssets();
  currentAssetIndex = currentList.findIndex(a => a.asset_id === assetId);
  if ($("drawerIndex")) $("drawerIndex").textContent = (currentAssetIndex >= 0 ? currentAssetIndex + 1 : 1) + " / " + fmt(currentList.length);
  if ($("prevAssetBtn")) $("prevAssetBtn").disabled = currentAssetIndex <= 0;
  if ($("nextAssetBtn")) $("nextAssetBtn").disabled = currentAssetIndex < 0 || currentAssetIndex >= currentList.length - 1;

  currentRating = Number(asset.rating || 0);
  currentDefects = new Set();
  const existingTags = asset.tags || [];
  existingTags.forEach(t => {
    if (t.startsWith("defect:")) {
      const d = t.slice("defect:".length).replace(/-/g, " ");
      currentDefects.add(d);
    }
  });

  const packet = packetFor(asset);
  const score = assetScore(asset);
  const isMusic = isMusicAsset(asset);

  $("drawerTitle").textContent = asset.title || asset.asset_id;

  let promptHtml = "";
  if (asset.prompt_text) {
    promptHtml = '<div class="prompt-box">' +
      '<div class="prompt-header">' +
        '<div class="prompt-badge"><span>⚡ Generation Prompt</span></div>' +
        '<span class="mono" style="font-size:11px;color:var(--muted)">' + esc(asset.sidecar_path ? pathBasename(asset.sidecar_path) : "sidecar") + '</span>' +
      '</div>' +
      '<div class="prompt-content">' + esc(asset.prompt_text) + '</div>' +
      (asset.negative_prompt ? (
        '<div class="negative-prompt-box">' +
          '<span class="negative-prompt-label">Negative Prompt</span>' +
          '<div class="negative-prompt-content">' + esc(asset.negative_prompt) + '</div>' +
        '</div>'
      ) : '') +
      '<div class="prompt-actions">' +
        '<button type="button" class="copy-prompt-btn" id="copyPromptBtn">📋 Copy Prompt [C]</button>' +
        (asset.negative_prompt ? '<button type="button" class="nav-btn" id="copyNegPromptBtn">Copy Neg Prompt</button>' : '') +
        (asset.sidecar_path ? '<button type="button" class="nav-btn" id="copySidecarPathBtn">Copy Sidecar Path</button>' : '') +
      '</div>' +
    '</div>';
  } else {
    promptHtml = '<div class="prompt-box">' +
      '<div class="prompt-header">' +
        '<div class="prompt-badge"><span>⚡ Generation Prompt</span></div>' +
      '</div>' +
      '<div class="prompt-gap">⚠️ Zero-Orphan Alert: No prompt sidecar (.vis.provenance.json) found for this asset.</div>' +
    '</div>';
  }

  const genSpecsHtml = '<div class="gen-grid">' +
    '<div class="gen-card"><span>Model</span><strong title="' + esc(asset.gen_model || "unknown") + '">' + esc(asset.gen_model || "unknown") + '</strong></div>' +
    '<div class="gen-card"><span>Provider</span><strong title="' + esc(asset.gen_provider || "local") + '">' + esc(asset.gen_provider || "local") + '</strong></div>' +
    '<div class="gen-card"><span>Seed</span><strong title="' + esc(asset.gen_seed || "none") + '">' + esc(asset.gen_seed || "none") + '</strong></div>' +
    '<div class="gen-card"><span>Dimensions</span><strong>' + esc(asset.width && asset.height ? asset.width + "×" + asset.height : "unknown") + '</strong></div>' +
  '</div>';

  const starsHtml = [1,2,3,4,5].map(star => (
    '<button type="button" class="star-btn ' + (star <= currentRating ? "active" : "") + '" data-value="' + star + '" title="' + star + ' Stars">★</button>'
  )).join("");

  const defectChipsHtml = DEFECT_OPTIONS.map(opt => (
    '<button type="button" class="chip ' + (currentDefects.has(opt.toLowerCase()) ? "active" : "") + '" data-defect="' + esc(opt.toLowerCase()) + '">' + esc(opt) + '</button>'
  )).join("");

  const curationHudHtml = '<div class="curation-card">' +
    '<div class="curation-header">' +
      '<span class="curation-title">⭐ Review & Taste Feedback</span>' +
      '<div class="star-rating">' + starsHtml + '<span class="star-label" id="starLabel">' + (currentRating ? currentRating + "/5" : "Click to rate") + '</span></div>' +
    '</div>' +
    '<div class="verdict-row">' +
      '<button type="button" class="btn-approve" id="btnApprove">✓ Approve [A]</button>' +
      '<button type="button" class="btn-reject" id="btnReject">✕ Reject [X]</button>' +
      '<button type="button" class="btn-undo" id="btnUndo" title="Undo feedback [Z]">↶ Undo</button>' +
    '</div>' +
    '<div class="defect-section">' +
      '<span class="defect-label">Defect quick flags</span>' +
      '<div class="defect-chips">' + defectChipsHtml + '</div>' +
    '</div>' +
    '<textarea class="note-input" id="curationNote" placeholder="Taste directive / reasoning (e.g. lighting too harsh, add cinematic rim light, hands warped)...">' + esc(asset.annotation_notes || "") + '</textarea>' +
    '<div class="curation-footer">' +
      '<select class="scope-select" id="curationScope" aria-label="Feedback scope">' +
        '<option value="asset">Scope: Asset only</option>' +
        '<option value="project">Scope: Project taste</option>' +
        '<option value="brand">Scope: Brand standard</option>' +
        '<option value="global">Scope: Global principle</option>' +
      '</select>' +
      '<button type="button" class="btn-save-feedback" id="btnSaveFeedback">Save Decision</button>' +
    '</div>' +
    '<div class="receipt-hud" id="receiptHud" style="' + (lastFeedbackReceipt ? 'display:flex' : 'display:none') + '">' +
      '<span>✓</span><span>' + esc(lastFeedbackReceipt ? 'Last outbox: ' + lastFeedbackReceipt.outbox_id : '') + '</span>' +
    '</div>' +
  '</div>';

  const usages = asset.usages || [];
  let usagesHtml = "";
  if (usages.length) {
    usagesHtml = '<div class="usage-box">' +
      '<div class="usage-header">🔗 Codebase references (' + usages.length + ')</div>' +
      usages.slice(0, 8).map(u => (
        '<div class="usage-item" data-file="' + esc(u.file || "") + '">' +
          '<span>' + esc(u.file || "") + (u.route ? ' (' + esc(u.route) + ')' : '') + '</span>' +
          (u.ref ? '<span class="usage-ref">' + esc(u.ref) + '</span>' : '') +
        '</div>'
      )).join("") +
    '</div>';
  } else {
    usagesHtml = '<div class="usage-box">' +
      '<div class="usage-header">🔗 Codebase references</div>' +
      '<div style="font-size:12px;color:var(--muted)">No code occurrences detected (candidate or unlinked asset).</div>' +
    '</div>';
  }

  $("drawerBody").innerHTML = (
    '<div class="preview">' + mediaPreview(asset, "detail") + '</div>' +
    curationHudHtml +
    promptHtml +
    genSpecsHtml +
    usagesHtml +
    '<div class="action-row">' +
      '<button data-copy="path">Copy local path</button>' +
      '<button data-copy="uri">Copy visual URI</button>' +
      '<button data-copy="packet">Copy Codex packet</button>' +
      '<button data-copy="website">Use on website</button>' +
      '<button data-copy="social">Prepare social post</button>' +
      (isMusic ? '<button data-copy="music">Music IS packet</button>' : '') +
    '</div>' +
    '<div class="kv"><span>Visual URI</span><div class="mono">' + esc(asset.visual_uri) + '</div></div>' +
    '<div class="kv"><span>Local path</span><div class="mono">' + esc(asset.absolute_path || "") + '</div></div>' +
    '<div class="kv"><span>Source</span><div>' + esc(sourceLabel(asset)) + '</div></div>' +
    '<div class="kv"><span>Folder</span><div>' + esc(folderLabel(asset)) + '</div></div>' +
    '<div class="kv"><span>Category</span><div>' + esc(asset.category || "") + '</div></div>' +
    '<div class="kv"><span>Media role</span><div>' + esc(asset.media_role || "") + '</div></div>' +
    '<div class="kv"><span>Workflow</span><div>' + esc(asset.workflow || "") + '</div></div>' +
    '<div class="kv"><span>Curation</span><div>' + esc(asset.curation_status || "uncurated") + '</div></div>' +
    '<div class="kv"><span>Rating</span><div>' + esc(asset.rating ? asset.rating + " / 5" : "unrated") + '</div></div>' +
    '<div class="kv"><span>Palette</span><div>' + paletteSwatches(asset, 8) + esc(asset.dominant_color ? "Dominant " + asset.dominant_color : "not indexed") + '</div></div>' +
    '<div class="kv"><span>Color families</span><div>' + esc((asset.color_families || []).join(", ")) + '</div></div>' +
    '<div class="kv"><span>Rights</span><div>' + esc(asset.rights_status || "unknown") + '</div></div>' +
    '<div class="kv"><span>Approval</span><div>' + esc(asset.approval_status || "candidate") + '</div></div>' +
    '<div class="kv"><span>Public-use gate</span><div>' + esc((asset.publish_gate?.status || "unknown") + " / " + (asset.publish_gate?.allowed ? "ready" : "review required")) + '</div></div>' +
    '<div class="kv"><span>Usage</span><div>' + fmt(asset.usage_count) + ' edges</div></div>' +
    '<div class="kv"><span>Prompt links</span><div>' + fmt(asset.prompt_count) + '</div></div>' +
    '<div class="kv"><span>Score</span><div>' + esc(score ? score.score + " / " + score.verdict : "not scored") + '</div></div>'
  );

  for (const btn of $("drawerBody").querySelectorAll(".star-btn")) {
    btn.addEventListener("click", () => setRating(Number(btn.dataset.value || 0)));
  }

  for (const chip of $("drawerBody").querySelectorAll(".chip")) {
    chip.addEventListener("click", () => toggleDefectChip(chip.dataset.defect));
  }

  $("drawerBody").querySelector("#btnApprove")?.addEventListener("click", approveCurrentAsset);
  $("drawerBody").querySelector("#btnReject")?.addEventListener("click", rejectCurrentAsset);
  $("drawerBody").querySelector("#btnUndo")?.addEventListener("click", undoCurrentAsset);
  $("drawerBody").querySelector("#btnSaveFeedback")?.addEventListener("click", () => submitFeedback("curate"));

  $("drawerBody").querySelector("#copyPromptBtn")?.addEventListener("click", copyCurrentPrompt);
  $("drawerBody").querySelector("#copyNegPromptBtn")?.addEventListener("click", () => {
    if (asset.negative_prompt) copy(asset.negative_prompt);
  });
  $("drawerBody").querySelector("#copySidecarPathBtn")?.addEventListener("click", () => {
    if (asset.sidecar_path) copy(asset.sidecar_path);
  });

  for (const item of $("drawerBody").querySelectorAll(".usage-item")) {
    item.addEventListener("click", () => copy(item.dataset.file));
  }

  for (const btn of $("drawerBody").querySelectorAll("button[data-copy]")) {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.copy;
      if (kind === "path") copy(asset.absolute_path || "");
      if (kind === "uri") copy(asset.visual_uri || "");
      if (kind === "packet") copy(packet.codex_prompt || JSON.stringify(packet, null, 2));
      if (kind === "website") copy(JSON.stringify(publicHandoff("website", asset, packet), null, 2));
      if (kind === "social") copy(JSON.stringify(publicHandoff("social", asset, packet), null, 2));
      if (kind === "music") copy(JSON.stringify(musicPacketFor(asset), null, 2));
    });
  }

  $("drawer").classList.add("open");
  $("drawer").setAttribute("aria-hidden", "false");
}
function copySelectedPackets(){
  const assets = selectedAssets();
  const packets = assets.map(asset => packetFor(asset));
  copy(JSON.stringify({ generatedAt: new Date().toISOString(), count: packets.length, packets }, null, 2));
}
function copyBatchCurationCommand(){
  const assets = selectedAssets();
  if (!assets.length) return toast("Select assets first");
  const ids = assets.map(asset => asset.asset_id);
  const command = "node bin\\\\vis.mjs batch-annotate " + ids.map(shellArg).join(" ") + " --tag review --curation-status needs-review --collection " + shellArg("VIS Review Queue");
  copy(JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: ids.length,
    command,
    note: "Dry-run by default. Add --execute only after reviewing the planned batch curation.",
    mcp_tool: {
      name: "bulk_annotate_assets",
      arguments: {
        asset_ids: ids,
        tags: ["review"],
        curation_status: "needs-review",
        collection: "VIS Review Queue",
        execute: false
      }
    },
    assets: assets.map(assetBrief)
  }, null, 2));
}
function copyReviewCommand(){
  const assets = selectedAssets();
  if (!assets.length) return toast("Select assets first");
  const ids = assets.map(asset => asset.asset_id);
  const command = "node bin\\\\vis.mjs review-assets " + ids.map(shellArg).join(" ") + " --rights-status needs-review --approval-status needs-review --reason " + shellArg("Dashboard selected assets require human rights and approval review");
  copy(JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: ids.length,
    command,
    note: "Dry-run by default. Choose owned/generated-owned/licensed and approved only after human rights review.",
    mcp_tool: {
      name: "review_assets",
      arguments: {
        asset_ids: ids,
        rights_status: "needs-review",
        approval_status: "needs-review",
        reason: "Dashboard selected assets require human rights and approval review",
        execute: false
      }
    },
    assets: assets.map(assetBrief)
  }, null, 2));
}
function copyDerivativePlan(preset){
  const assets = selectedAssets();
  if (!assets.length) return toast("Select assets first");
  const ids = assets.map(asset => asset.asset_id);
  const presetInfo = (DATA.derivativePresets || []).find(item => item.id === preset) || { id: preset };
  copy(JSON.stringify({
    type: "vis_derivative_plan_handoff",
    generatedAt: new Date().toISOString(),
    preset,
    preset_label: presetInfo.label || preset,
    selected_count: ids.length,
    command: derivativePlanCommand(preset, ids),
    mcp_tool: {
      name: "plan_asset_derivatives",
      arguments: {
        preset,
        asset_ids: ids,
        execute: false
      }
    },
    gates: [
      "Dry-run only. Review rights and approval blockers before public use.",
      "No local transform, upload, social post, mint, wallet action, or cloud write happens from this packet.",
      "Use an explicit human-gated adapter later for Sharp, FFmpeg, Cloudinary, R2, Postiz, IPFS, or thirdweb execution."
    ],
    music_boundary: preset === "music-release" ? "Music IS remains canonical for release state, rights, credits, AI disclosure, and distribution gates. VIS plans media derivatives only." : null,
    assets: assets.map(assetBrief)
  }, null, 2));
}
function derivativePlanCommand(preset, ids){
  return "node bin\\\\vis.mjs derivative-plan --preset " + shellArg(preset) + " " + ids.map(shellArg).join(" ") + " --json";
}
function copyBatchPublicHandoff(kind){
  const assets = selectedAssets();
  if (!assets.length) return toast("Select assets first");
  const ids = assets.map(asset => asset.asset_id);
  copy(JSON.stringify({
    type: "vis_public_use_handoff",
    generatedAt: new Date().toISOString(),
    intended_use: kind,
    selected_count: ids.length,
    derivative_plan: {
      command: derivativePlanCommand(kind === "website" ? "website" : "social", ids),
      mcp_tool: {
        name: "plan_asset_derivatives",
        arguments: {
          preset: kind === "website" ? "website" : "social",
          asset_ids: ids,
          execute: false
        }
      }
    },
    handoffs: assets.map(asset => publicHandoff(kind, asset, packetFor(asset))),
    blocked_assets: assets.filter(asset => asset.publish_gate?.allowed !== true).map(assetBrief),
    next: "Resolve blockers, generate approved derivatives, use Codex/Claude to place or prepare the asset, then record publication/usage in VIS."
  }, null, 2));
}
function copyMusicBatchHandoff(){
  const assets = selectedAssets();
  if (!assets.length) return toast("Select assets first");
  const musicAssets = assets.filter(isMusicAsset);
  if (!musicAssets.length) return toast("No music assets selected");
  const ids = musicAssets.map(asset => asset.asset_id);
  copy(JSON.stringify({
    type: "vis_music_is_batch_handoff",
    generatedAt: new Date().toISOString(),
    canonical_system: "Music IS",
    selected_count: ids.length,
    derivative_plan: {
      command: derivativePlanCommand("music-release", ids),
      mcp_tool: {
        name: "plan_asset_derivatives",
        arguments: {
          preset: "music-release",
          asset_ids: ids,
          execute: false
        }
      }
    },
    release_packets: musicAssets.map(asset => ({
      command: "node bin\\\\vis.mjs music-packet " + shellArg(asset.asset_id) + " --json",
      mcp_tool: {
        name: "create_music_release_packet",
        arguments: {
          asset_id: asset.asset_id,
          intended_use: "Music IS release proof folder review"
        }
      },
      asset: assetBrief(asset)
    })),
    release_gate: "Music IS must hold audio, metadata, lyrics, prompt, rights notes, AI disclosure, credits, cover, Canvas, shorts, distribution checklist, and human gate before release.",
    next: "Use this packet to update the Music IS proof folder or ask an agent to prepare the missing release assets. Do not distribute or upload externally from VIS."
  }, null, 2));
}
function shellArg(value){
  return '"' + String(value || "").replaceAll('"', '\\"') + '"';
}
function copy(text){
  if (!text) return toast("Nothing to copy");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text){
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try { document.execCommand("copy"); toast("Copied"); } catch { toast("Copy failed"); }
  area.remove();
}
function toast(text){
  $("toast").textContent = text;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 1400);
}
function populateFilters(){
  $("sourceFilter").innerHTML = '<option value="">All sources</option>' + (DATA.sources || []).map(item => '<option value="'+esc(item.id)+'">'+esc(item.label)+' ('+fmt(item.count)+')</option>').join("");
}
$("search").addEventListener("input", e => { state.query = e.target.value; renderAll(); });
$("mediaFilter").addEventListener("change", e => { state.media = e.target.value; renderAll(); });
$("readinessFilter").addEventListener("change", e => { state.readiness = e.target.value; renderAll(); });
$("sourceFilter").addEventListener("change", e => { state.source = e.target.value; renderAll(); });
$("sortFilter").addEventListener("change", e => { state.sort = e.target.value; renderAll(); });
$("selectVisible").addEventListener("click", () => { for (const asset of filteredAssets().slice(0,700)) selectedIds.add(asset.asset_id); renderAll(); });
$("clearSelection").addEventListener("click", () => { selectedIds.clear(); renderAll(); });
$("copySelection").addEventListener("click", copySelectedPackets);
$("copyCurationCommand").addEventListener("click", copyBatchCurationCommand);
$("copyReviewCommand").addEventListener("click", copyReviewCommand);
$("closeDrawer").addEventListener("click", () => { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden","true"); });
$("prevAssetBtn")?.addEventListener("click", prevAsset);
$("nextAssetBtn")?.addEventListener("click", nextAsset);

document.addEventListener("keydown", e => {
  const tag = String(e.target?.tagName || "").toLowerCase();
  const isInput = tag === "input" || tag === "textarea" || tag === "select";

  if (e.key === "Escape") {
    $("closeDrawer").click();
    return;
  }
  if (isInput) return;

  if (e.key === "/") {
    e.preventDefault();
    $("search").focus();
    return;
  }

  const drawerOpen = $("drawer").classList.contains("open");
  if (drawerOpen) {
    if (e.key === "[" || e.key === "ArrowLeft") {
      e.preventDefault();
      prevAsset();
    } else if (e.key === "]" || e.key === "ArrowRight") {
      e.preventDefault();
      nextAsset();
    } else if (e.key >= "1" && e.key <= "5") {
      e.preventDefault();
      setRating(Number(e.key));
    } else if (e.key.toLowerCase() === "a") {
      e.preventDefault();
      approveCurrentAsset();
    } else if (e.key.toLowerCase() === "x") {
      e.preventDefault();
      rejectCurrentAsset();
    } else if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      undoCurrentAsset();
    } else if (e.key.toLowerCase() === "c") {
      e.preventDefault();
      copyCurrentPrompt();
    }
  } else {
    if (e.key.toLowerCase() === "c" && selectedIds.size) {
      copySelectedPackets();
    }
  }
});
populateFilters();
renderAll();
if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
  navigator.serviceWorker.register("./${data.pwa.serviceWorker}").catch(() => {});
}
</script>
</body>
</html>`
}
