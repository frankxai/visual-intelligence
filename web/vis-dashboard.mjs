import fs from 'fs'
import path from 'path'
import {
  createCurationPacket,
  findDuplicates,
  findOrphans,
  getSummary,
  listAssets,
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
    const packetSamples = Object.fromEntries(
      assets.slice(0, 200).map(asset => [asset.asset_id, createCurationPacket(db, asset.asset_id)]),
    )
    const scores = Object.fromEntries(
      assets.slice(0, 400).map(asset => [asset.asset_id, scoreAsset(db, asset.asset_id)]),
    )
    const payload = {
      generatedAt: new Date().toISOString(),
      root,
      limit,
      summary,
      assets: assets.map(asset => ({
        ...asset,
        tags: parseJson(asset.tags_json, []),
      })),
      duplicates,
      orphans,
      packetSamples,
      scores,
    }
    const outputPath = resolveProjectPath(root, options.output || config.dashboardPath)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, renderDashboardHtml(payload), 'utf-8')
    return { outputPath, assets: assets.length, summary }
  } finally {
    db.close()
  }
}

function renderDashboardHtml(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual Intelligence OS</title>
<style>
:root{
  --bg:#05060A;
  --surface:#0A0C14;
  --surface-2:#101521;
  --border:#1A1F2E;
  --ink:#F1F3F9;
  --muted:#8A90A8;
  --accent:#6EA8FE;
  --accent-2:#2DD4BF;
  --warn:#F59E0B;
  --bad:#EF4444;
  --good:#34D399;
  --violet:#A78BFA;
  --radius:8px;
}
*{box-sizing:border-box}
html{font-size:16px;scroll-behavior:smooth}
body{
  margin:0;
  background:var(--bg);
  color:var(--ink);
  font-family:Instrument Sans,Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  line-height:1.5;
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
button:hover{border-color:#2B344A;background:#131A29}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.shell{min-height:100vh;display:grid;grid-template-columns:280px minmax(0,1fr)}
.rail{
  border-right:1px solid var(--border);
  background:#070910;
  padding:20px;
  position:sticky;
  top:0;
  height:100vh;
  overflow:auto;
}
.mark{display:flex;align-items:center;gap:10px;margin-bottom:24px}
.mark-badge{
  width:34px;height:34px;border:1px solid #2B344A;border-radius:8px;
  display:grid;place-items:center;color:var(--accent);font-weight:700;background:#0D1320;
}
.mark h1{font-size:18px;line-height:1.2;margin:0;font-weight:650}
.mark p{margin:2px 0 0;color:var(--muted);font-size:12px}
.rail-section{margin:24px 0 0}
.rail-section h2{font-size:12px;text-transform:uppercase;color:#A9B0C6;margin:0 0 10px;font-weight:650}
.metric{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding:10px 0;font-size:14px}
.metric span:first-child{color:var(--muted)}
.metric strong{font-variant-numeric:tabular-nums}
.lane-list{display:grid;gap:6px}
.lane-btn{
  display:flex;align-items:center;justify-content:space-between;width:100%;
  background:transparent;border-color:transparent;text-align:left;padding:8px 10px;color:#CDD3E5;
}
.lane-btn[aria-pressed="true"]{background:#101827;border-color:#26324B;color:var(--ink)}
.lane-count{color:var(--muted);font-size:12px}
.main{min-width:0}
.topbar{
  position:sticky;top:0;z-index:5;
  display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  padding:14px 20px;border-bottom:1px solid var(--border);
  background:rgba(5,6,10,.94);backdrop-filter:blur(16px);
}
.search{
  flex:1 1 280px;min-width:220px;height:40px;border:1px solid var(--border);
  background:var(--surface);border-radius:var(--radius);color:var(--ink);padding:0 12px;
}
.select{height:40px;border:1px solid var(--border);background:var(--surface);color:var(--ink);border-radius:var(--radius);padding:0 10px}
.action-row{display:flex;gap:8px;flex-wrap:wrap}
.workspace{padding:20px;display:grid;gap:20px}
.band{border-bottom:1px solid var(--border);padding-bottom:18px}
.band h2{font-size:18px;margin:0 0 4px}
.band p{color:var(--muted);margin:0;font-size:14px;max-width:780px}
.status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.status{
  min-height:92px;border:1px solid var(--border);border-radius:var(--radius);
  background:var(--surface);padding:14px;
}
.status small{color:var(--muted);display:block;font-size:12px}
.status strong{display:block;font-size:26px;line-height:1.1;margin-top:8px;font-variant-numeric:tabular-nums}
.status.good strong{color:var(--good)}
.status.warn strong{color:var(--warn)}
.status.accent strong{color:var(--accent)}
.boards{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}
.grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(156px,1fr));
  gap:10px;
}
.asset{
  border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);
  overflow:hidden;min-width:0;text-align:left;padding:0;min-height:220px;display:flex;flex-direction:column;
}
.asset:hover{border-color:#33405C;transform:translateY(-1px)}
.thumb{
  aspect-ratio:1/1;background:#080B12;border-bottom:1px solid var(--border);
  display:grid;place-items:center;overflow:hidden;
}
.thumb img,.thumb video{width:100%;height:100%;object-fit:cover;display:block}
.thumb .fallback{color:var(--muted);font-size:12px;text-align:center;padding:12px}
.asset-body{padding:10px;display:grid;gap:6px}
.asset-title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asset-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:var(--muted);font-size:11px}
.pill{border:1px solid var(--border);background:#0D1320;border-radius:999px;padding:2px 7px;color:#B9C1D8;font-size:11px}
.pill.good{border-color:rgba(52,211,153,.35);color:#8FE8C0}
.pill.warn{border-color:rgba(245,158,11,.4);color:#F7C873}
.pill.bad{border-color:rgba(239,68,68,.45);color:#FCA5A5}
.side{display:grid;gap:12px}
.panel{
  border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);padding:14px;
}
.panel h3{font-size:14px;margin:0 0 10px}
.mini-list{display:grid;gap:8px;max-height:260px;overflow:auto}
.mini-item{border-top:1px solid var(--border);padding-top:8px;font-size:12px;color:var(--muted)}
.mini-item strong{display:block;color:var(--ink);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.drawer{
  position:fixed;right:0;top:0;width:min(560px,100vw);height:100vh;background:#070A11;border-left:1px solid var(--border);
  transform:translateX(100%);transition:transform .18s ease;z-index:20;display:flex;flex-direction:column;
}
.drawer.open{transform:translateX(0)}
.drawer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid var(--border)}
.drawer-head h2{font-size:16px;margin:0;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.drawer-body{padding:16px;overflow:auto;display:grid;gap:14px}
.preview{background:#05060A;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;display:grid;place-items:center;min-height:260px}
.preview img,.preview video{max-width:100%;max-height:420px;display:block}
.kv{display:grid;grid-template-columns:120px minmax(0,1fr);gap:8px;font-size:13px;border-top:1px solid var(--border);padding-top:10px}
.kv span:first-child{color:var(--muted)}
.mono{font-family:Geist Mono,SFMono-Regular,Consolas,monospace;font-size:12px;word-break:break-all}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#101827;border:1px solid #26324B;border-radius:8px;padding:10px 14px;color:var(--ink);font-size:13px;opacity:0;pointer-events:none;transition:opacity .16s ease;z-index:30}
.toast.show{opacity:1}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .asset:hover{transform:none}
  .drawer,.toast{transition:none}
}
@media (max-width:1100px){
  .shell{grid-template-columns:1fr}
  .rail{position:relative;height:auto;border-right:0;border-bottom:1px solid var(--border)}
  .boards{grid-template-columns:1fr}
  .status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:620px){
  .workspace{padding:14px}
  .topbar{padding:12px}
  .grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .status-grid{grid-template-columns:1fr}
  .asset{min-height:190px}
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
    </section>
    <section class="rail-section">
      <h2>Lanes</h2>
      <div class="lane-list" id="lanes"></div>
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
      <div class="action-row">
        <button id="exportVisible">Copy visible packet</button>
      </div>
    </div>
    <div class="workspace">
      <section class="band">
        <h2>Asset graph cockpit</h2>
        <p id="brief"></p>
      </section>
      <section class="status-grid">
        <div class="status accent"><small>Indexed assets</small><strong id="sAssets">0</strong></div>
        <div class="status good"><small>Prompts linked</small><strong id="sPrompts">0</strong></div>
        <div class="status warn"><small>Duplicate groups</small><strong id="sDuplicates">0</strong></div>
        <div class="status"><small>Orphans sampled</small><strong id="sOrphans">0</strong></div>
      </section>
      <section class="boards">
        <div class="grid" id="grid"></div>
        <aside class="side">
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
let activeLane = "";
let selected = null;
const $ = (id) => document.getElementById(id);
const state = { query:"", media:"", readiness:"" };

function fmt(n){ return Number(n || 0).toLocaleString(); }
function esc(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function assetHay(asset){
  return [asset.asset_id, asset.title, asset.relative_path, asset.public_path, asset.category, asset.mood, asset.rights_status, asset.approval_status, ...(asset.tags || [])].join(" ").toLowerCase();
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
function mediaPreview(asset, cls=""){
  if (asset.media_type === "image" && asset.file_url) return '<img src="'+esc(asset.file_url)+'" alt="">';
  if (asset.media_type === "video" && asset.file_url) return '<video src="'+esc(asset.file_url)+'" muted controls></video>';
  return '<div class="fallback">'+esc(asset.media_type || "asset")+'<br>'+esc(asset.extension || "")+'</div>';
}
function filteredAssets(){
  const q = state.query.trim().toLowerCase().split(/\\s+/).filter(Boolean);
  return DATA.assets.filter(asset => {
    if (activeLane && asset.category !== activeLane) return false;
    if (state.media && asset.media_type !== state.media) return false;
    if (state.readiness && readiness(asset) !== state.readiness) return false;
    const hay = assetHay(asset);
    return q.every(word => hay.includes(word));
  });
}
function renderMetrics(){
  const s = DATA.summary || {};
  $("generatedAt").textContent = new Date(DATA.generatedAt).toLocaleString();
  $("mAssets").textContent = fmt(s.assets);
  $("mVersions").textContent = fmt(s.versions);
  $("mLocations").textContent = fmt(s.locations);
  $("mUsage").textContent = fmt(s.usageEdges);
  $("mPrompts").textContent = fmt(s.prompts);
  $("sAssets").textContent = fmt(DATA.assets.length);
  $("sPrompts").textContent = fmt(s.prompts);
  $("sDuplicates").textContent = fmt(DATA.duplicates.length);
  $("sOrphans").textContent = fmt(DATA.orphans.length);
  $("brief").textContent = "Local-first VIS index for " + DATA.root + ". Showing " + fmt(DATA.assets.length) + " assets from the current export with provenance, usage, rights, and curation actions wired for agents.";
}
function renderLanes(){
  const counts = {};
  for (const asset of DATA.assets) counts[asset.category || "uncategorized"] = (counts[asset.category || "uncategorized"] || 0) + 1;
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,30);
  $("lanes").innerHTML = ['<button class="lane-btn" aria-pressed="'+(!activeLane)+'" data-lane=""><span>All assets</span><span class="lane-count">'+fmt(DATA.assets.length)+'</span></button>']
    .concat(entries.map(([lane,count]) => '<button class="lane-btn" aria-pressed="'+(activeLane===lane)+'" data-lane="'+esc(lane)+'"><span>'+esc(lane)+'</span><span class="lane-count">'+fmt(count)+'</span></button>'))
    .join("");
  for (const btn of document.querySelectorAll(".lane-btn")) {
    btn.addEventListener("click", () => { activeLane = btn.dataset.lane || ""; renderAll(); });
  }
}
function renderGrid(){
  const assets = filteredAssets();
  $("grid").innerHTML = assets.slice(0, 600).map(asset => (
    '<button class="asset" data-id="'+esc(asset.asset_id)+'">' +
      '<div class="thumb">'+mediaPreview(asset)+'</div>' +
      '<div class="asset-body">' +
        '<div class="asset-title">'+esc(asset.title || asset.asset_id)+'</div>' +
        '<div class="asset-meta"><span class="pill">'+esc(asset.media_type)+'</span>'+readinessPill(asset)+'<span class="pill">'+fmt(asset.sizeKB)+' KB</span></div>' +
        '<div class="asset-meta">'+esc((asset.tags || []).slice(0,3).join(" / ") || asset.category || "uncategorized")+'</div>' +
      '</div>' +
    '</button>'
  )).join("");
  for (const card of document.querySelectorAll(".asset")) {
    card.addEventListener("click", () => openAsset(card.dataset.id));
  }
}
function renderSide(){
  $("duplicates").innerHTML = DATA.duplicates.length ? DATA.duplicates.map(group => (
    '<div class="mini-item"><strong>'+esc(group.sha256.slice(0,12))+'</strong>'+fmt(group.asset_count)+' assets, '+fmt(group.version_count)+' versions</div>'
  )).join("") : '<div class="mini-item">No duplicate groups in this sample.</div>';
  $("orphans").innerHTML = DATA.orphans.length ? DATA.orphans.slice(0,40).map(asset => (
    '<div class="mini-item"><strong>'+esc(asset.title || asset.asset_id)+'</strong>'+esc(asset.relative_path || "")+'</div>'
  )).join("") : '<div class="mini-item">No orphan sample available.</div>';
}
function renderAll(){ renderMetrics(); renderLanes(); renderGrid(); renderSide(); }
function openAsset(assetId){
  const asset = DATA.assets.find(a => a.asset_id === assetId);
  if (!asset) return;
  selected = asset;
  const packet = DATA.packetSamples[assetId] || {
    asset_id: asset.asset_id,
    visual_uri: asset.visual_uri,
    local_path: asset.absolute_path,
    codex_prompt: "Use this VIS asset: " + asset.visual_uri + "\\nLocal path: " + (asset.absolute_path || "")
  };
  const score = DATA.scores[assetId];
  $("drawerTitle").textContent = asset.title || asset.asset_id;
  $("drawerBody").innerHTML = (
    '<div class="preview">'+mediaPreview(asset)+'</div>' +
    '<div class="action-row">' +
      '<button data-copy="path">Copy local path</button>' +
      '<button data-copy="uri">Copy visual URI</button>' +
      '<button data-copy="packet">Copy Codex packet</button>' +
    '</div>' +
    '<div class="kv"><span>Visual URI</span><div class="mono">'+esc(asset.visual_uri)+'</div></div>' +
    '<div class="kv"><span>Local path</span><div class="mono">'+esc(asset.absolute_path || "")+'</div></div>' +
    '<div class="kv"><span>Category</span><div>'+esc(asset.category || "")+'</div></div>' +
    '<div class="kv"><span>Rights</span><div>'+esc(asset.rights_status || "unknown")+'</div></div>' +
    '<div class="kv"><span>Approval</span><div>'+esc(asset.approval_status || "candidate")+'</div></div>' +
    '<div class="kv"><span>Dimensions</span><div>'+esc(asset.width && asset.height ? asset.width + "x" + asset.height : "unknown")+'</div></div>' +
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
    });
  }
  $("drawer").classList.add("open");
  $("drawer").setAttribute("aria-hidden","false");
}
function copy(text){
  navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => toast("Copy failed"));
}
function toast(text){
  $("toast").textContent = text;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 1400);
}
$("search").addEventListener("input", e => { state.query = e.target.value; renderGrid(); });
$("mediaFilter").addEventListener("change", e => { state.media = e.target.value; renderGrid(); });
$("readinessFilter").addEventListener("change", e => { state.readiness = e.target.value; renderGrid(); });
$("closeDrawer").addEventListener("click", () => { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden","true"); });
$("exportVisible").addEventListener("click", () => {
  const assets = filteredAssets().slice(0, 40).map(asset => DATA.packetSamples[asset.asset_id] || { visual_uri: asset.visual_uri, local_path: asset.absolute_path });
  copy(JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 2));
});
document.addEventListener("keydown", e => { if (e.key === "Escape") $("closeDrawer").click(); });
renderAll();
</script>
</body>
</html>`
}
