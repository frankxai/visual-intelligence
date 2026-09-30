/**
 * VIS library operator screen. Local only (127.0.0.1).
 *
 * Serves renditions (thumb, preview) and the library record. It never serves a
 * master file. Every request must name a loopback Host. Writes also need the
 * X-VIS-Operator header and a same-origin request. Publishing is refused while
 * the publish gate is closed; placements are recorded through the CLI (Phase 5).
 */

import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { pipeline } from 'stream/promises'
import { expandPathTokens, findProjectRoot, loadConfig } from '../core/vis-core.mjs'
import {
  decideProposal,
  getLibraryAsset,
  libraryConfig,
  listLibrary,
  listProposals,
  openLibraryDatabase,
  proposalStats,
  renditionPath,
  setRating,
  setRights,
} from '../core/vis-library.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const THUMBHASH_JS = path.resolve(__dirname, '..', 'node_modules', 'thumbhash', 'thumbhash.js')
const RIGHTS = ['unknown', 'needs-review', 'owned', 'generated-owned', 'licensed', 'blocked']

export function createLibraryServer(root = findProjectRoot(), options = {}) {
  const config = loadConfig(root)
  const db = openLibraryDatabase(root, config)
  const operator = options.operator || 'operator-screen'
  const renditionsDir = expandPathTokens(libraryConfig(config).renditionsDir)

  const server = http.createServer(async (req, res) => {
    try {
      if (!loopbackHost(req)) return json(res, 403, { error: 'host not allowed' })
      const url = new URL(req.url, 'http://local')
      const parts = url.pathname.split('/').filter(Boolean)

      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, renderHtml(), 'text/html; charset=utf-8')
      if (req.method === 'GET' && url.pathname === '/vendor/thumbhash.js') {
        if (!fs.existsSync(THUMBHASH_JS)) return json(res, 404, { error: 'thumbhash not installed' })
        return sendFile(res, THUMBHASH_JS, 'text/javascript; charset=utf-8', 'public, max-age=86400')
      }
      if (req.method === 'GET' && parts[0] === 'r' && parts.length === 3) {
        const file = renditionPath(root, db, parts[1], parts[2], renditionsDir)
        if (!file || !fs.existsSync(file)) return json(res, 404, { error: 'rendition not found' })
        return sendFile(res, file, 'image/webp', 'private, max-age=31536000, immutable')
      }
      if (req.method === 'GET' && url.pathname === '/api/library') {
        return json(res, 200, listLibrary(db, {
          query: url.searchParams.get('q') || undefined,
          rights: url.searchParams.get('rights') || undefined,
          sort: url.searchParams.get('sort') || undefined,
          limit: url.searchParams.get('limit') || 1000,
          offset: url.searchParams.get('offset') || 0,
        }))
      }
      if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'asset' && parts[2]) {
        const asset = getLibraryAsset(db, parts[2])
        return asset ? json(res, 200, redactAsset(asset)) : json(res, 404, { error: 'asset not found' })
      }
      if (req.method === 'GET' && url.pathname === '/api/proposals') {
        return json(res, 200, { proposals: listProposals(db, { status: url.searchParams.get('status') || 'open' }), stats: proposalStats(db) })
      }

      if (req.method === 'POST') {
        if (req.headers['x-vis-operator'] !== '1' || !sameOrigin(req)) return json(res, 403, { error: 'operator header and same origin required' })
        const body = await readJson(req)
        if (parts[0] === 'api' && parts[1] === 'proposals' && parts[3] === 'decide') {
          return json(res, 200, decideProposal(db, { proposalId: parts[2], decision: body.decision, decidedBy: operator, allowRights: true, execute: true }))
        }
        if (parts[0] === 'api' && parts[1] === 'asset' && parts[3] === 'rank') {
          const rating = setRating(db, { assetId: parts[2], rating: Number(body.rating), decidedBy: operator })
          return json(res, 200, { ok: true, rating })
        }
        if (parts[0] === 'api' && parts[1] === 'asset' && parts[3] === 'rights') {
          if (!RIGHTS.includes(body.rights)) return json(res, 400, { error: `rights must be one of ${RIGHTS.join(', ')}` })
          setRights(db, { assetId: parts[2], rights: body.rights, decidedBy: operator })
          return json(res, 200, { ok: true, rights: body.rights })
        }
        if (parts[0] === 'api' && parts[1] === 'asset' && parts[3] === 'publish') {
          const asset = getLibraryAsset(db, parts[2])
          if (!asset) return json(res, 404, { error: 'asset not found' })
          if (!asset.publish_gate.allowed) return json(res, 409, { error: 'publish gate closed', gate: asset.publish_gate })
          return json(res, 501, { error: 'Publishing from the screen is Phase 5. Record the placement with vis record-publication after Frank names the page.', gate: asset.publish_gate })
        }
      }
      return json(res, 404, { error: 'not found' })
    } catch (error) {
      return json(res, 400, { error: error.message })
    }
  })
  server.on('close', () => db.close())
  return server
}

export function serveLibrary(root, options = {}) {
  const server = createLibraryServer(root, options)
  const host = options.host || '127.0.0.1'
  return new Promise(resolve => server.listen(options.port ?? 4323, host, () => {
    const { port } = server.address()
    resolve({ server, url: `http://${host}:${port}/` })
  }))
}

/** Absolute paths stay on this machine's screen; the master path is shown, never served. */
function redactAsset(asset) {
  return {
    ...asset,
    renditions: asset.renditions.map(({ path: _p, ...rest }) => rest),
  }
}

function loopbackHost(req) {
  const raw = String(req.headers.host || '')
  const name = raw.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase()
  return name === '127.0.0.1' || name === 'localhost' || name === '::1'
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try { return new URL(origin).host === req.headers.host } catch { return false }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => {
      raw += chunk
      if (raw.length > 64 * 1024) reject(new Error('body too large'))
    })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(new Error('invalid JSON')) } })
  })
}

function json(res, status, value) {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8')
}

function send(res, status, body, type) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(body)
}

function sendFile(res, file, type, cache) {
  const stream = fs.createReadStream(file)
  stream.once('open', () => res.writeHead(200, { 'content-type': type, 'cache-control': cache, 'x-content-type-options': 'nosniff' }))
  pipeline(stream, res).catch(() => {
    if (!res.headersSent) json(res, 500, { error: 'could not read file' })
    else res.destroy()
  })
}

function renderHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>VIS Library</title>
<style>
:root{
  --bg:#05060A; --surface:#0B0E14; --surface-2:#111723; --surface-3:#151B27; --border:#202838;
  --ink:#F2F5FA; --muted:#929AB0; --soft:#B9C0D1; --accent:#7CB7FF;
  --ok:#45D6A5; --wait:#F5C45D; --stop:#FF7A90; --radius:8px; --tile:168px; --gap:8px;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 Instrument Sans,Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
button,input,select{font:inherit;color:inherit}
button,select,input{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:6px 10px;min-height:36px}
button{cursor:pointer}
button:disabled{cursor:not-allowed;color:var(--muted)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--border);padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
header h1{font-size:15px;margin:0 12px 0 0;font-weight:600}
header .count{color:var(--muted);margin-left:auto}
nav[role=tablist]{display:flex;gap:4px}
nav button[aria-selected=true]{border-color:var(--accent);color:var(--accent)}
input[type=search]{flex:1 1 180px;min-width:0}
main{padding:12px 16px}
#scroller{height:70vh;overflow:auto;position:relative}
#spacer{position:relative}
.tile{position:absolute;width:var(--tile);height:calc(var(--tile) + 30px);padding:0;border:1px solid var(--border);background:var(--surface);overflow:hidden;text-align:left;display:flex;flex-direction:column}
.tile .img{flex:1 1 auto;min-height:0;display:block;background:var(--surface-3) center/cover no-repeat;position:relative;overflow:hidden}
.tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.tile .meta{flex:none}
.tile .meta{height:30px;display:flex;align-items:center;gap:6px;padding:0 8px;font-size:12px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--wait)}
.dot.ok{background:var(--ok)} .dot.stop{background:var(--stop)}
.badge{margin-left:auto;color:var(--accent)}
.state{padding:48px 16px;text-align:center;color:var(--muted)}
.state code{color:var(--soft)}
aside{position:fixed;inset:0 0 0 auto;width:min(560px,100vw);background:var(--surface);border-left:1px solid var(--border);overflow:auto;padding:16px;z-index:3}
aside[hidden]{display:none}
aside h2{font-size:16px;margin:0 40px 12px 0;word-break:break-all}
aside .close{position:absolute;top:12px;right:12px}
.preview{background:var(--surface-3);border-radius:var(--radius);min-height:160px;display:grid;place-items:center;overflow:hidden}
.preview img{max-width:100%;max-height:60vh;display:block}
.preview .missing{color:var(--stop);padding:32px}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px}
dt{color:var(--muted)} dd{margin:0;word-break:break-all}
section{margin-top:16px} section h3{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.stars button[aria-pressed=true]{border-color:var(--wait);color:var(--wait)}
.gate{font-size:13px;color:var(--wait)}
.prop{display:flex;gap:10px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px}
.prop img{width:56px;height:56px;object-fit:cover;border-radius:4px;background:var(--surface-3)}
.prop .what{flex:1;min-width:0;font-size:13px}
.prop .what small{display:block;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
ul.events{list-style:none;padding:0;margin:0;font-size:12px;color:var(--soft)}
#toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--surface-2);border:1px solid var(--border);padding:8px 14px;border-radius:var(--radius)}
#toast:empty{display:none}
@media (max-width:640px){:root{--tile:calc((100vw - 32px - 8px)/2)} header .count{margin-left:0;width:100%}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
</head>
<body>
<header>
  <h1>VIS Library</h1>
  <nav role="tablist" aria-label="View">
    <button role="tab" id="tab-grid" aria-selected="true" aria-controls="view-grid">Assets</button>
    <button role="tab" id="tab-queue" aria-selected="false" aria-controls="view-queue">Proposals <span id="qcount"></span></button>
  </nav>
  <label class="sr" for="q">Search</label>
  <input type="search" id="q" placeholder="Search path, title, tag">
  <label class="sr" for="rights">Rights</label>
  <select id="rights"><option value="">All rights</option>${RIGHTS.map(r => `<option>${r}</option>`).join('')}</select>
  <label class="sr" for="sort">Sort</label>
  <select id="sort"><option value="">Newest</option><option value="rank">Rank</option></select>
  <span class="count" id="count" aria-live="polite"></span>
</header>
<main>
  <div id="view-grid" role="tabpanel" aria-labelledby="tab-grid">
    <div id="scroller" tabindex="-1"><div id="spacer" role="list" aria-label="Assets"></div></div>
    <div id="grid-state" class="state" hidden></div>
  </div>
  <div id="view-queue" role="tabpanel" aria-labelledby="tab-queue" hidden></div>
</main>
<aside id="panel" hidden aria-modal="true" role="dialog" aria-labelledby="panel-title"></aside>
<div id="toast" role="status" aria-live="polite"></div>
<script type="module">
let thumbHashToDataURL = null
try { ({ thumbHashToDataURL } = await import('/vendor/thumbhash.js')) } catch {}
const $ = s => document.querySelector(s)
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const rightsClass = r => ['owned','generated-owned','licensed'].includes(r) ? 'ok' : r === 'blocked' ? 'stop' : ''
let assets = [], lastFocus = null
const placeholders = new Map()
function placeholder(a){
  if (!a.thumbhash || !thumbHashToDataURL) return ''
  if (!placeholders.has(a.asset_id)) {
    try { placeholders.set(a.asset_id, thumbHashToDataURL(Uint8Array.from(atob(a.thumbhash), c => c.charCodeAt(0)))) } catch { placeholders.set(a.asset_id, '') }
  }
  return placeholders.get(a.asset_id)
}
async function api(url, body){
  const res = await fetch(url, body ? { method:'POST', headers:{'content-type':'application/json','x-vis-operator':'1'}, body: JSON.stringify(body) } : undefined)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(data.error || res.statusText); e.data = data; e.status = res.status; throw e }
  return data
}
function toast(t){ $('#toast').textContent = t; clearTimeout(toast.t); toast.t = setTimeout(() => $('#toast').textContent = '', 3000) }

// Virtualized grid: only rows near the viewport exist in the DOM.
const scroller = $('#scroller'), spacer = $('#spacer')
function metrics(){
  const tile = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile')) || 168
  const gap = 8, w = scroller.clientWidth
  const cols = Math.max(1, Math.floor((w + gap) / (tile + gap)))
  return { tile, gap, cols, rowH: tile + 30 + gap }
}
function renderGrid(){
  const { tile, gap, cols, rowH } = metrics()
  const rows = Math.ceil(assets.length / cols)
  spacer.style.height = rows * rowH + 'px'
  const first = Math.max(0, Math.floor(scroller.scrollTop / rowH) - 2)
  const last = Math.min(rows, Math.ceil((scroller.scrollTop + scroller.clientHeight) / rowH) + 2)
  const html = []
  for (let r = first; r < last; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, a = assets[i]
    if (!a) break
    html.push('<button role="listitem" class="tile" data-id="' + a.asset_id + '" style="top:' + (r*rowH) + 'px;left:' + (c*(tile+gap)) + 'px"'
      + ' aria-label="' + esc(a.title) + ', rights ' + esc(a.rights_status) + (a.rating ? ', rated ' + a.rating : '') + (a.open_proposals ? ', ' + a.open_proposals + ' open proposals' : '') + '">'
      + '<span class="img" style="background-image:url(' + placeholder(a) + ')"><img loading="lazy" alt="" src="/r/' + a.asset_id + '/thumb" onerror="this.remove()"></span>'
      + '<span class="meta"><span class="dot ' + rightsClass(a.rights_status) + '" aria-hidden="true"></span>' + esc(a.title)
      + (a.location_count > 1 ? ' ×' + a.location_count : '') + (a.open_proposals ? '<span class="badge">' + a.open_proposals + ' open</span>' : '') + '</span></button>')
  }
  spacer.innerHTML = html.join('')
}
function fitScroller(){ scroller.style.height = Math.max(240, innerHeight - scroller.getBoundingClientRect().top - 12) + 'px' }
scroller.addEventListener('scroll', () => requestAnimationFrame(renderGrid), { passive:true })
addEventListener('resize', () => requestAnimationFrame(() => { fitScroller(); renderGrid() }))
fitScroller()
spacer.addEventListener('click', e => { const t = e.target.closest('.tile'); if (t) openAsset(t.dataset.id) })

async function load(){
  const state = $('#grid-state')
  const params = new URLSearchParams({ q: $('#q').value, rights: $('#rights').value, sort: $('#sort').value })
  state.hidden = false; state.textContent = 'Loading…'
  try {
    const data = await api('/api/library?' + params)
    assets = data.assets
    $('#count').textContent = data.total + ' assets'
    if (!assets.length) {
      state.innerHTML = $('#q').value || $('#rights').value ? 'Nothing matches these filters.' : 'No assets yet. Run <code>vis library ingest --execute</code>.'
    } else state.hidden = true
    renderGrid()
  } catch (e) {
    state.innerHTML = 'Could not load the library: ' + esc(e.message) + ' <button id="retry">Retry</button>'
    $('#retry').onclick = load
  }
  refreshQueueCount()
}
let debounce
$('#q').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(load, 200) })
$('#rights').addEventListener('change', load)
$('#sort').addEventListener('change', load)

async function openAsset(id){
  lastFocus = document.activeElement
  const panel = $('#panel')
  panel.hidden = false
  panel.innerHTML = '<p class="state">Loading…</p>'
  try {
    const a = await api('/api/asset/' + id)
    const rating = a.annotation?.rating || 0
    const open = a.proposals.filter(p => p.status === 'open')
    panel.innerHTML = '<button class="close" id="close" aria-label="Close">✕</button>'
      + '<h2 id="panel-title">' + esc(a.title) + '</h2>'
      + '<div class="preview"><img alt="' + esc(a.title) + '" src="/r/' + a.asset_id + '/preview" onerror="this.outerHTML=\\'<p class=missing>Preview missing. The master was not loaded.</p>\\'"></div>'
      + '<section><h3>Rights</h3><div class="row"><span class="dot ' + rightsClass(a.rights_status) + '" aria-hidden="true"></span>'
      + '<label class="sr" for="rights-set">Rights</label><select id="rights-set">' + ${JSON.stringify(RIGHTS)}.map(r => '<option' + (r === a.rights_status ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>'
      + '<button id="rights-save">Set rights</button></div></section>'
      + '<section><h3>Rank</h3><div class="row stars" role="group" aria-label="Rank">' + [0,1,2,3,4,5].map(n => '<button data-rate="' + n + '" aria-pressed="' + (n === rating) + '">' + (n ? n + '★' : 'none') + '</button>').join('') + '</div></section>'
      + '<section><h3>Publish</h3><div class="row"><button id="publish" ' + (a.publish_gate.allowed ? '' : 'disabled aria-describedby="gate"') + '>Publish</button>'
      + '<span class="gate" id="gate">' + esc(a.publish_gate.allowed ? 'Gate open. Placement is recorded in Phase 5.' : a.publish_gate.blockers.join('; ')) + '</span></div></section>'
      + '<section><h3>Proposals</h3>' + (open.length ? open.map(proposalRow).join('') : '<p class="state" style="padding:8px 0;text-align:left">No open proposals.</p>') + '</section>'
      + '<section><h3>Record</h3><dl><dt>Hash</dt><dd>' + esc(a.source_hash) + '</dd><dt>Type</dt><dd>' + esc(a.media_type) + '</dd>'
      + a.files.map(f => '<dt>' + esc(f.root_label) + '</dt><dd>' + esc(f.absolute_path) + '</dd>').join('')
      + '</dl></section>'
      + '<section><h3>Events</h3><ul class="events">' + a.events.slice(0, 12).map(e => '<li>' + esc(e.created_at.slice(0,19).replace('T',' ')) + ' · ' + esc(e.event_type) + ' · ' + esc(e.actor || '') + '</li>').join('') + '</ul></section>'
    $('#close').onclick = closePanel
    $('#close').focus()
    $('#rights-save').onclick = async () => {
      try { await api('/api/asset/' + id + '/rights', { rights: $('#rights-set').value }); toast('Rights set to ' + $('#rights-set').value); await load(); openAsset(id) } catch (e) { toast(e.message) }
    }
    panel.querySelectorAll('[data-rate]').forEach(b => b.onclick = async () => {
      try { await api('/api/asset/' + id + '/rank', { rating: Number(b.dataset.rate) }); toast('Ranked'); await load(); openAsset(id) } catch (e) { toast(e.message) }
    })
    bindDecisions(panel, () => openAsset(id))
    $('#publish').onclick = async () => { try { await api('/api/asset/' + id + '/publish', {}) } catch (e) { toast(e.message) } }
  } catch (e) {
    panel.innerHTML = '<button class="close" id="close" aria-label="Close">✕</button><p class="state">Could not open this asset: ' + esc(e.message) + '</p>'
    $('#close').onclick = closePanel
  }
}
function proposalRow(p){
  const what = p.kind === 'rank' ? 'Rank ' + p.payload.rating : p.kind === 'set' ? 'Add to set ' + p.payload.name : p.kind === 'tags' ? 'Tags ' + p.payload.tags.join(', ') : 'Rights → ' + p.payload.rights
  return '<div class="prop"><img alt="" src="/r/' + p.asset_id + '/thumb" onerror="this.style.visibility=\\'hidden\\'"><div class="what">' + esc(what)
    + '<small>' + esc(p.rule) + ' · ' + esc(p.proposed_by) + (p.rationale ? ' · ' + esc(p.rationale) : '') + '</small></div>'
    + '<button data-decide="accepted" data-id="' + p.proposal_id + '">Accept</button><button data-decide="dismissed" data-id="' + p.proposal_id + '">Dismiss</button></div>'
}
function bindDecisions(scope, after){
  scope.querySelectorAll('[data-decide]').forEach(b => b.onclick = async () => {
    try { await api('/api/proposals/' + b.dataset.id + '/decide', { decision: b.dataset.decide }); toast(b.dataset.decide === 'accepted' ? 'Accepted. Nothing was published.' : 'Dismissed'); await load(); after() } catch (e) { toast(e.message) }
  })
}
function closePanel(){ $('#panel').hidden = true; lastFocus?.focus?.() }
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#panel').hidden) closePanel() })

async function refreshQueueCount(){
  try { const d = await api('/api/proposals'); $('#qcount').textContent = d.proposals.length ? '(' + d.proposals.length + ')' : '' } catch {}
}
async function renderQueue(){
  const view = $('#view-queue')
  view.innerHTML = '<p class="state">Loading…</p>'
  try {
    const d = await api('/api/proposals')
    const muted = d.stats.filter(s => s.muted).map(s => s.rule)
    view.innerHTML = (d.proposals.length ? d.proposals.map(proposalRow).join('') : '<p class="state">The queue is empty.</p>')
      + (muted.length ? '<p class="state">Muted after repeated dismissals: ' + muted.map(esc).join(', ') + '</p>' : '')
    bindDecisions(view, renderQueue)
  } catch (e) { view.innerHTML = '<p class="state">Could not load proposals: ' + esc(e.message) + '</p>' }
}
function selectTab(which){
  const grid = which === 'grid'
  $('#tab-grid').setAttribute('aria-selected', grid); $('#tab-queue').setAttribute('aria-selected', !grid)
  $('#view-grid').hidden = !grid; $('#view-queue').hidden = grid
  if (grid) renderGrid(); else renderQueue()
}
$('#tab-grid').onclick = () => selectTab('grid')
$('#tab-queue').onclick = () => selectTab('queue')
load()
</script>
</body>
</html>`
}
