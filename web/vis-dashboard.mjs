import fs from 'fs'
import http from 'http'
import path from 'path'
import {
  createCurationPacket,
  findDuplicates,
  findOrphans,
  findSimilarAssets,
  getSummary,
  listAssets,
  listSavedSearches,
  loadConfig,
  openVisDatabase,
  parseJson,
  resolveProjectPath,
  scoreAsset,
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
    const packetSamples = Object.fromEntries(
      assets.slice(0, 300).map(asset => [asset.asset_id, createCurationPacket(db, asset.asset_id)]),
    )
    const scores = Object.fromEntries(
      assets.slice(0, 600).map(asset => [asset.asset_id, scoreAsset(db, asset.asset_id)]),
    )
    const normalizedAssets = assets.map(asset => ({
      ...asset,
      tags: parseJson(asset.tags_json, []),
    }))
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
      savedSearches,
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

function handleDashboardRequest({ root, config, directory, dashboardFile, request, response }) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  if (url.pathname.startsWith('/__vis_media/')) {
    serveMediaAsset(root, config, decodeURIComponent(url.pathname.slice('/__vis_media/'.length)), request, response)
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' })
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
  const orphanIds = new Set(orphans.map(asset => asset.asset_id))
  const similarAssetIds = new Set((similar.groups || []).flatMap(group => (group.assets || []).map(asset => asset.asset_id)))
  const smartCollections = [
    ['inbox', 'Inbox / uncurated', asset => asset.approval_status !== 'approved' && asset.approval_status !== 'rejected'],
    ['rights-review', 'Rights review', asset => ['unknown', 'needs-review'].includes(asset.rights_status)],
    ['provenance-gaps', 'Prompt gaps', asset => Number(asset.prompt_count || 0) === 0],
    ['website-used', 'Used on sites', asset => Number(asset.usage_count || 0) > 0],
    ['orphans', 'Orphans', asset => orphanIds.has(asset.asset_id) || Number(asset.usage_count || 0) === 0],
    ['duplicates', 'Duplicate sample', asset => duplicateAssetIds.has(asset.asset_id)],
    ['similar-review', 'Similarity review', asset => similarAssetIds.has(asset.asset_id)],
    ['curated', 'Curated', asset => Boolean(asset.annotation)],
    ['favorites', 'Favorites', asset => Number(asset.rating || 0) >= 4 || ['favorite', 'approved'].includes(asset.curation_status)],
    ['unannotated', 'Needs notes', asset => !asset.annotation],
    ['music', 'Music / audio', asset => asset.workflow === 'music-release' || asset.media_type === 'audio' || (asset.tags || []).includes('music')],
    ['video-motion', 'Video / motion', asset => asset.media_type === 'video'],
    ['nft-web3', 'NFT / Web3', asset => asset.category === 'nft-web3' || (asset.tags || []).includes('web3')],
    ['website-ready', 'Website ready', asset => asset.media_type === 'image' && asset.rights_status !== 'blocked' && Number(asset.sizeKB || 0) <= 2000],
    ['social-ready', 'Social ready', asset => ['image', 'video'].includes(asset.media_type) && asset.rights_status !== 'blocked'],
  ].map(([id, label, matcher]) => ({
    id,
    label,
    count: assets.filter(matcher).length,
  }))

  return {
    duplicateAssetIds: [...duplicateAssetIds],
    similarAssetIds: [...similarAssetIds],
    sources: topCounts(assets.map(sourceLabel), 20),
    folders: topCounts(assets.map(folderLabel), 30),
    tags: topCounts(assets.flatMap(asset => asset.tags || []), 40),
    smartCollections,
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
.side{display:grid;gap:12px}
.panel{
  border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);padding:13px;
}
.panel h3{font-size:14px;margin:0 0 10px}
.mini-list{display:grid;gap:8px;max-height:260px;overflow:auto}
.mini-item{border-top:1px solid var(--border);padding-top:8px;font-size:12px;color:var(--muted)}
.mini-item strong{display:block;color:var(--ink);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mini-item button{margin-top:6px;min-height:30px;font-size:12px}
.drawer{
  position:fixed;right:0;top:0;width:min(590px,100vw);height:100vh;background:#070A11;border-left:1px solid var(--border);
  transform:translateX(100%);transition:transform .18s ease;z-index:20;display:flex;flex-direction:column;
}
.drawer.open{transform:translateX(0)}
.drawer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid var(--border)}
.drawer-head h2{font-size:16px;margin:0;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.drawer-body{padding:16px;overflow:auto;display:grid;gap:14px}
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
            <h3>Selected packet tray</h3>
            <div class="mini-list" id="selectionTray"></div>
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
    <h2 id="drawerTitle">Asset</h2>
    <button id="closeDrawer" aria-label="Close detail">Close</button>
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
  return [asset.asset_id, asset.title, asset.relative_path, asset.public_path, asset.category, asset.mood, asset.rights_status, asset.approval_status, asset.media_role, asset.workflow, asset.curation_status, asset.annotation_notes, sourceLabel(asset), folderLabel(asset), ...(asset.tags || [])].join(" ").toLowerCase();
}
function readiness(asset){
  if (asset.approval_status === "approved") return "approved";
  if (asset.rights_status === "unknown" || asset.rights_status === "needs-review") return "unknown";
  if ((asset.usage_count || 0) > 0) return "used";
  return "orphan";
}
function readinessPill(asset){
  const r = readiness(asset);
  if (r === "approved") return '<span class="pill good">approved</span>';
  if (r === "unknown") return '<span class="pill warn">rights</span>';
  if (r === "used") return '<span class="pill good">used</span>';
  return '<span class="pill">orphan</span>';
}
function smartMatches(asset, id){
  if (!id) return true;
  if (id === "inbox") return asset.approval_status !== "approved" && asset.approval_status !== "rejected";
  if (id === "rights-review") return ["unknown","needs-review"].includes(asset.rights_status);
  if (id === "provenance-gaps") return Number(asset.prompt_count || 0) === 0;
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
  if (id === "website-ready") return asset.media_type === "image" && asset.rights_status !== "blocked" && Number(asset.sizeKB || 0) <= 2000;
  if (id === "social-ready") return ["image","video"].includes(asset.media_type) && asset.rights_status !== "blocked";
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
    codex_prompt: "Use this VIS asset: " + asset.visual_uri + "\\nLocal path: " + (asset.absolute_path || "")
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
    return '<article class="asset '+(selected ? "selected" : "")+'">' +
      '<button class="asset-select" aria-label="Toggle selection" aria-pressed="'+(selected ? "true" : "false")+'" data-select="'+esc(asset.asset_id)+'">'+(selected ? "✓" : "+")+'</button>' +
      '<button class="asset-open" data-id="'+esc(asset.asset_id)+'">' +
        '<div class="thumb">'+mediaPreview(asset, "thumb")+'</div>' +
        '<div class="asset-body">' +
          '<div class="asset-title">'+esc(asset.title || asset.asset_id)+'</div>' +
          '<div class="asset-meta"><span class="pill">'+esc(asset.media_type)+'</span>'+readinessPill(asset)+'<span class="pill">'+fmt(asset.sizeKB)+' KB</span></div>' +
          '<div class="asset-meta"><span class="pill">'+esc(asset.media_role || asset.workflow || asset.category || "asset")+'</span>'+(score ? '<span class="pill">'+fmt(score.score)+'</span>' : "")+(asset.rating ? '<span class="pill good">'+fmt(asset.rating)+'/5</span>' : "")+'</div>' +
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
function renderSide(){
  const selectedAssets = [...selectedIds].map(id => DATA.assets.find(asset => asset.asset_id === id)).filter(Boolean);
  $("selectionTray").innerHTML = selectedAssets.length
    ? selectedAssets.slice(0,15).map(asset => miniAssetItem(asset, "Inspect")).join("")
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
  const packet = packetFor(asset);
  const score = assetScore(asset);
  const isMusic = asset.workflow === "music-release" || asset.media_type === "audio" || asset.media_role === "cover-art" || asset.media_role === "music-canvas";
  $("drawerTitle").textContent = asset.title || asset.asset_id;
  $("drawerBody").innerHTML = (
    '<div class="preview">'+mediaPreview(asset, "detail")+'</div>' +
    '<div class="action-row">' +
      '<button data-copy="path">Copy local path</button>' +
      '<button data-copy="uri">Copy visual URI</button>' +
      '<button data-copy="packet">Copy Codex packet</button>' +
      '<button data-copy="website">Use on website</button>' +
      '<button data-copy="social">Prepare social post</button>' +
      (isMusic ? '<button data-copy="music">Music IS packet</button>' : '') +
    '</div>' +
    '<div class="kv"><span>Visual URI</span><div class="mono">'+esc(asset.visual_uri)+'</div></div>' +
    '<div class="kv"><span>Local path</span><div class="mono">'+esc(asset.absolute_path || "")+'</div></div>' +
    '<div class="kv"><span>Source</span><div>'+esc(sourceLabel(asset))+'</div></div>' +
    '<div class="kv"><span>Folder</span><div>'+esc(folderLabel(asset))+'</div></div>' +
    '<div class="kv"><span>Category</span><div>'+esc(asset.category || "")+'</div></div>' +
    '<div class="kv"><span>Media role</span><div>'+esc(asset.media_role || "")+'</div></div>' +
    '<div class="kv"><span>Workflow</span><div>'+esc(asset.workflow || "")+'</div></div>' +
    '<div class="kv"><span>Curation</span><div>'+esc(asset.curation_status || "uncurated")+'</div></div>' +
    '<div class="kv"><span>Rating</span><div>'+esc(asset.rating ? asset.rating + " / 5" : "unrated")+'</div></div>' +
    '<div class="kv"><span>Color label</span><div>'+esc(asset.color_label || "")+'</div></div>' +
    '<div class="kv"><span>Custom tags</span><div>'+esc((asset.custom_tags || []).join(", "))+'</div></div>' +
    '<div class="kv"><span>Notes</span><div>'+esc(asset.annotation_notes || "")+'</div></div>' +
    '<div class="kv"><span>Rights</span><div>'+esc(asset.rights_status || "unknown")+'</div></div>' +
    '<div class="kv"><span>Approval</span><div>'+esc(asset.approval_status || "candidate")+'</div></div>' +
    '<div class="kv"><span>Dimensions</span><div>'+esc(asset.width && asset.height ? asset.width + "x" + asset.height : "unknown")+'</div></div>' +
    '<div class="kv"><span>Duration</span><div>'+esc(asset.duration_seconds ? asset.duration_seconds + " sec" : "unknown")+'</div></div>' +
    '<div class="kv"><span>Usage</span><div>'+fmt(asset.usage_count)+' edges</div></div>' +
    '<div class="kv"><span>Prompt links</span><div>'+fmt(asset.prompt_count)+'</div></div>' +
    '<div class="kv"><span>Score</span><div>'+esc(score ? score.score + " / " + score.verdict : "not scored")+'</div></div>' +
    '<div class="kv"><span>Next action</span><div>'+esc(score?.nextAction || packet.next_recommended_action || "")+'</div></div>'
  );
  for (const btn of $("drawerBody").querySelectorAll("button[data-copy]")) {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.copy;
      if (kind === "path") copy(asset.absolute_path || "");
      if (kind === "uri") copy(asset.visual_uri || "");
      if (kind === "packet") copy(packet.codex_prompt || JSON.stringify(packet, null, 2));
      if (kind === "website") copy(JSON.stringify({ intended_use:"website", asset: packet, next:"Generate optimized derivative, place on route, then record VIS usage/publication." }, null, 2));
      if (kind === "social") copy(JSON.stringify({ intended_use:"social", asset: packet, next:"Create channel variant, schedule/post through approved tooling, then record platform URL and metrics." }, null, 2));
      if (kind === "music") copy(JSON.stringify(musicPacketFor(asset), null, 2));
    });
  }
  $("drawer").classList.add("open");
  $("drawer").setAttribute("aria-hidden","false");
}
function copySelectedPackets(){
  const assets = [...selectedIds].map(id => DATA.assets.find(asset => asset.asset_id === id)).filter(Boolean);
  const packets = assets.map(asset => packetFor(asset));
  copy(JSON.stringify({ generatedAt: new Date().toISOString(), count: packets.length, packets }, null, 2));
}
function copyBatchCurationCommand(){
  const assets = [...selectedIds].map(id => DATA.assets.find(asset => asset.asset_id === id)).filter(Boolean);
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
    assets: assets.map(asset => ({ asset_id: asset.asset_id, visual_uri: asset.visual_uri, title: asset.title, media_type: asset.media_type, path: asset.absolute_path || asset.relative_path }))
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
$("closeDrawer").addEventListener("click", () => { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden","true"); });
document.addEventListener("keydown", e => {
  const tag = String(e.target?.tagName || "").toLowerCase();
  if (e.key === "Escape") $("closeDrawer").click();
  if (e.key === "/" && tag !== "input" && tag !== "textarea" && tag !== "select") { e.preventDefault(); $("search").focus(); }
  if (e.key.toLowerCase() === "c" && selectedIds.size && tag !== "input" && tag !== "textarea" && tag !== "select") copySelectedPackets();
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
