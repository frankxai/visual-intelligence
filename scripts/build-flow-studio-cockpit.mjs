#!/usr/bin/env node
/**
 * Generates the interactive dark-obsidian / liquid-glass HTML5 Multimodal Studio & DAM Cockpit v2
 * from `asset-manifest.json`, `r2-dam-plan.json`, `credit-ledger.json`, `placements/`, and SVG vector marks.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

const DEFAULT_JOB_ROOT =
  process.env.VIS_JOB_ROOT ||
  path.join(os.homedir(), 'brands/image-system/jobs/2026-11-16-flow-godmode')
const DEFAULT_MARKS_DIR =
  process.env.VIS_MARKS_DIR ||
  path.resolve(os.homedir(), 'starlight/repos/starlight-design-intelligence/brand-image-system/svg-marks')

function readJsonSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function readTextSafe(filePath, fallback = '') {
  if (!fs.existsSync(filePath)) return fallback
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return fallback
  }
}

export function generateStudioCockpitHtml({
  jobRoot = DEFAULT_JOB_ROOT,
  marksDir = DEFAULT_MARKS_DIR,
} = {}) {
  const manifest = readJsonSafe(path.join(jobRoot, 'asset-manifest.json'), {
    summary: {
      brandCount: 0,
      masterPlatesCount: 0,
      derivativeRenditionsCount: 0,
      flowClipsCount: 0,
      totalDeliverables: 0,
      rejectedArchiveCount: 0,
      qaPassCount: 0,
    },
    brandMeta: {},
    assets: [],
    flowClips: [],
    rejectedArchive: [],
  })
  const r2Plan = readJsonSafe(path.join(jobRoot, 'r2-dam-plan.json'), {
    readyCount: 0,
    uploadManifest: [],
  })
  const creditLedger = readJsonSafe(path.join(jobRoot, 'credit-ledger.json'), {
    tier: 'Google AI Ultra',
    poolIncludedCredits: 10050,
    hardCapCredits: 2500,
    totalSpentCredits: 0,
    remainingBudgetUnderCap: 2500,
    entries: [],
  })

  const svgMarks = {}
  if (fs.existsSync(marksDir)) {
    for (const file of fs.readdirSync(marksDir)) {
      if (file.endsWith('.svg')) {
        svgMarks[file] = readTextSafe(path.join(marksDir, file), '')
      }
    }
  }

  const placements = {}
  const placementsDir = path.join(jobRoot, 'placements')
  if (fs.existsSync(placementsDir)) {
    for (const brand of Object.keys(manifest.brandMeta || {})) {
      const bDir = path.join(placementsDir, brand)
      if (fs.existsSync(bDir)) {
        placements[brand] = {
          routeMap: readJsonSafe(path.join(bDir, 'route-media-map.json'), null),
          snippetTsx: readTextSafe(path.join(bDir, 'HeroMediaSlot.snippet.tsx'), ''),
          schemaOrg: readJsonSafe(path.join(bDir, 'schema-org-media.json'), null),
        }
      }
    }
  }

  const r2ByAsset = Object.fromEntries((r2Plan.uploadManifest || []).map((r) => [r.assetId, r]))
  const cardsPayload = (manifest.assets || []).map((a) => {
    const brandInfo = manifest.brandMeta?.[a.brand] || {}
    const r2 = r2ByAsset[a.assetId] || null
    const relEditedOg = `${a.brand}/edited/${a.assetId}-og-1200x630.webp`
    const relEditedHero = `${a.brand}/edited/${a.assetId}-hero-1920w.webp`
    const relEditedSquare = `${a.brand}/edited/${a.assetId}-square-1080.webp`
    const relEditedVertical = `${a.brand}/edited/${a.assetId}-vertical-9x16.webp`
    return {
      assetId: a.assetId,
      brand: a.brand,
      brandDisplayName: a.brandDisplayName || brandInfo.displayName || a.brand,
      accent: brandInfo.accent || '#82D8E6',
      title: a.title,
      subtitle: a.subtitle,
      role: a.role,
      funnelArchetype: a.funnelArchetype || brandInfo.funnelArchetype || '',
      stage: a.stage,
      qaTotal: a.qa?.total ?? 0,
      qaDecision: a.qa?.decision ?? 'pending',
      qaBreakdown: a.qa?.breakdown || {},
      qaNotes: a.qa?.notes || '',
      targetUrls: a.targetUrls || [],
      r2MasterPath: r2?.r2?.masterKey || null,
      r2PreviewPath: r2?.r2?.previewKey || null,
      driveMirrorPath: r2?.driveMirrorPath || null,
      ogSrc: relEditedOg,
      heroSrc: relEditedHero,
      squareSrc: relEditedSquare,
      verticalSrc: relEditedVertical,
      derivativeCount: (a.derivatives || []).length,
    }
  })

  const rejectedList =
    manifest.rejectedArchive && manifest.rejectedArchive.length > 0
      ? manifest.rejectedArchive
      : readJsonSafe(path.join(jobRoot, 'rejected-manifest.json'), { items: [] }).items || []

  const safeData = JSON.stringify({
    summary: manifest.summary,
    r2ReadyCount: r2Plan.readyCount,
    creditLedger,
    brandMeta: manifest.brandMeta,
    cards: cardsPayload,
    flowClips: manifest.flowClips || [],
    rejectedArchive: rejectedList,
    placements,
    svgMarks,
  }).replaceAll('<', '\\u003c')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Starlight & Google Flow Multimodal Studio Cockpit</title>
<style>
  :root {
    --ink: #070A10;
    --surface: #0D111A;
    --panel: rgba(17, 23, 34, 0.82);
    --border: rgba(255, 255, 255, 0.11);
    --ivory: #F6F1E7;
    --muted: #94A3B8;
    --cyan: #82D8E6;
    --gold: #C9A15C;
    --emerald: #10B981;
    --crimson: #EF4444;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: radial-gradient(circle at 20% 0%, #111927 0%, var(--ink) 55%);
    color: var(--ivory);
    font-family: "Segoe UI", Inter, -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.5;
  }
  :focus-visible {
    outline: 2px solid var(--cyan);
    outline-offset: 2px;
  }
  .shell { max-width: 1440px; margin: 0 auto; padding: 28px 24px 80px; }
  header {
    display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 20px;
    border-bottom: 1px solid var(--border); padding-bottom: 20px; margin-bottom: 24px;
  }
  .eyebrow { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--cyan); font-weight: 600; }
  h1 { margin: 4px 0 6px; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
  .sub { color: var(--muted); font-size: 14px; max-width: 760px; margin: 0; }
  .search-wrap { position: relative; min-width: 280px; flex: 1 1 320px; max-width: 420px; }
  .search-input {
    width: 100%; padding: 10px 38px 10px 14px; border-radius: 10px;
    background: var(--surface); border: 1px solid var(--border); color: var(--ivory); font-size: 13px;
  }
  .kbd-hint {
    position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
    font-size: 11px; color: var(--muted); border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px;
  }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .metric {
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px;
    backdrop-filter: blur(12px);
  }
  .metric .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
  .metric .val { font-size: 24px; font-weight: 700; margin-top: 4px; color: var(--ivory); }
  .metric .hint { font-size: 12px; color: var(--cyan); margin-top: 2px; }
  .controls {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px;
    padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  }
  .pill {
    background: transparent; color: var(--muted); border: 1px solid var(--border); border-radius: 999px;
    padding: 7px 14px; font-size: 12px; cursor: pointer; transition: all 140ms ease;
  }
  .pill:hover, .pill.active { color: var(--ivory); border-color: var(--cyan); background: rgba(130, 216, 230, 0.14); }
  .marks-strip {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 10px; margin-bottom: 26px;
  }
  .mark-card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 12px;
    display: flex; align-items: center; gap: 10px;
  }
  .mark-card svg { width: 32px; height: 32px; color: var(--ivory); flex-shrink: 0; }
  .mark-card span { font-size: 12px; color: var(--muted); word-break: break-word; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 18px; margin-bottom: 24px; }
  .card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .card img, .card video { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; background: #05070c; }
  .card-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; flex-wrap: wrap; }
  .badge { padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; border: 1px solid var(--border); }
  .pass { color: var(--emerald); border-color: rgba(16,185,129,0.4); background: rgba(16,185,129,0.1); }
  .warn { color: var(--gold); border-color: rgba(245,158,11,0.45); background: rgba(245,158,11,0.12); }
  .rej { color: var(--crimson); border-color: rgba(239,68,68,0.45); background: rgba(239,68,68,0.12); }
  .card h3 { margin: 0; font-size: 16px; color: var(--ivory); }
  .card p { margin: 0; font-size: 13px; color: var(--muted); }
  .meta-line { font-family: ui-monospace, Consolas, monospace; font-size: 11px; color: #94a3b8; word-break: break-all; }
  .preview-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; padding-top: 8px; }
  .mini-btn, .inspect-btn {
    background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--ivory);
    border-radius: 6px; padding: 6px 10px; font-size: 11px; cursor: pointer;
  }
  .mini-btn.active { border-color: var(--gold); color: var(--gold); }
  .inspect-btn { margin-left: auto; border-color: rgba(130, 216, 230, 0.45); color: var(--cyan); }
  .section-title { font-size: 15px; font-weight: 600; margin: 24px 0 12px; color: var(--ivory); }
  .snippet-pre {
    background: #05070c; border: 1px solid var(--border); border-radius: 10px; padding: 12px;
    font-family: ui-monospace, Consolas, monospace; font-size: 11px; color: #E2E8F0;
    overflow-x: auto; max-height: 280px; white-space: pre;
  }
  .drawer-backdrop {
    position: fixed; inset: 0; background: rgba(4, 6, 12, 0.72); backdrop-filter: blur(4px);
    display: none; justify-content: flex-end; z-index: 60;
  }
  .drawer-backdrop.open { display: flex; }
  .drawer {
    width: min(560px, 100vw); height: 100%; background: #0B0F17; border-left: 1px solid var(--border);
    padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px;
  }
  .bar-row { display: grid; grid-template-columns: 150px 1fr 40px; align-items: center; gap: 8px; font-size: 12px; }
  .bar-track { height: 7px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; }
  .bar-fill { height: 100%; background: var(--emerald); }
  @media (max-width: 768px) {
    .shell { padding: 18px 14px 64px; }
    .pill, .mini-btn, .inspect-btn { min-height: 44px; min-width: 44px; display: inline-flex; align-items: center; justify-content: center; }
    .grid { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>
</head>
<body>
<div class="shell">
  <header>
    <div>
      <div class="eyebrow">Visual Intelligence OS v3 · Google Flow Ultra Studio</div>
      <h1>Multimodal Brand Asset &amp; Lifecycle Cockpit</h1>
      <p class="sub">Six-stage governed asset pipeline (planned, created, edited, qa_scored, ready_for_publish, placed) connecting native masters, Google Flow, domain TSX placement snippets, Cloudflare R2, and preserved rejected archives.</p>
    </div>
    <div class="search-wrap">
      <input id="searchBox" class="search-input" type="search" aria-label="Filter assets by brand, title, route, or model" placeholder="Filter by brand, title, route, or model..."/>
      <span class="kbd-hint" aria-hidden="true">/</span>
    </div>
  </header>

  <section class="metrics" id="metrics"></section>

  <h2 class="section-title">Candidate Vector SVG Marks (16px to 48px Monochrome-First)</h2>
  <section class="marks-strip" id="marksStrip"></section>

  <nav class="controls" id="viewTabs" aria-label="Cockpit view mode"></nav>
  <nav class="controls" id="brandFilters" aria-label="Brand filter"></nav>

  <section id="flowSection" style="display:none;margin-bottom:28px">
    <h2 class="section-title">Google Flow Live Studio Outputs (ULTRA Tier · Nano Banana 2.1 + Veo 3.1-Lite)</h2>
    <div id="flowCreditBar" class="controls" style="justify-content:space-between"></div>
    <div class="grid" id="flowGrid"></div>
  </section>

  <section id="mastersSection">
    <h2 class="section-title">Master Plates &amp; Responsive WebP Renditions</h2>
    <section class="grid" id="assetGrid"></section>
  </section>

  <section id="placementsSection" style="display:none">
    <h2 class="section-title">Domain Placement Kits (HeroMediaSlot.tsx + R2 Keys + Reduced-Motion Fallback)</h2>
    <section class="grid" id="placementsGrid"></section>
  </section>

  <section id="rejectedSection" style="display:none">
    <h2 class="section-title">Preserved Rejected v1 Archive (Audited &amp; Quarantined, Never Promoted)</h2>
    <section class="grid" id="rejectedGrid"></section>
  </section>
</div>

<div id="drawerBackdrop" class="drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
  <aside class="drawer">
    <div class="row">
      <span id="drawerBrand" class="badge"></span>
      <button id="drawerClose" class="mini-btn" type="button" aria-label="Close inspector drawer">Close (Esc)</button>
    </div>
    <h2 id="drawerTitle" style="margin:0;font-size:20px"></h2>
    <p id="drawerSub" class="sub"></p>
    <div id="drawerQaBars" style="display:flex;flex-direction:column;gap:8px"></div>
    <div id="drawerMeta" class="meta-line"></div>
    <div class="row">
      <strong style="font-size:13px">Ready-to-paste Next.js / HTML Placement Snippet</strong>
      <button id="copySnippetBtn" class="mini-btn" type="button">Copy snippet</button>
    </div>
    <pre id="drawerSnippet" class="snippet-pre"></pre>
  </aside>
</div>

<script>
const DATA = ${safeData};
function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const s = DATA.summary || {};
const c = DATA.creditLedger || {};
const rejList = DATA.rejectedArchive || [];
const placementBrands = Object.keys(DATA.placements || {});

const passedMasters = (DATA.cards || []).filter(x => x.qaDecision === 'pass').length;
const heldMasters = (DATA.cards || []).filter(x => x.qaDecision !== 'pass').length;
const cards = [
  { label: 'Active Brands', val: s.brandCount || 0, hint: 'Portfolio domains mapped' },
  { label: 'Master Plates', val: s.masterPlatesCount || 0, hint: passedMasters + ' promoted · ' + heldMasters + ' held' },
  { label: 'WebP Renditions', val: s.derivativeRenditionsCount || 0, hint: '7 ratios per master' },
  { label: 'Total Deliverables', val: s.totalDeliverables || 0, hint: 'Masters + Renditions + Flow' },
  { label: 'R2 DAM Ready', val: DATA.r2ReadyCount || 0, hint: 'vis-media content-addressed' },
  { label: 'Rejected Preserved', val: rejList.length, hint: 'Quarantined with SHA-256' },
  { label: 'Flow Ultra Spend', val: (c.totalSpentCredits || 0) + ' / ' + (c.hardCapCredits || 2500), hint: (c.endingCredits ?? c.poolIncludedCredits ?? 10050) + ' remaining pool' },
];
document.getElementById('metrics').innerHTML = cards.map(m =>
  '<div class="metric"><div class="label">' + esc(m.label) + '</div><div class="val">' + esc(m.val) + '</div><div class="hint">' + esc(m.hint) + '</div></div>'
).join('');

document.getElementById('marksStrip').innerHTML = Object.entries(DATA.svgMarks || {}).map(([name, svg]) =>
  '<div class="mark-card">' + svg + '<span>' + esc(name.replace('.svg','')) + '</span></div>'
).join('');

let activeView = 'all';
let activeBrand = 'all';
let searchQuery = '';
let lastFocusedEl = null;

const searchBox = document.getElementById('searchBox');
searchBox.addEventListener('input', () => {
  searchQuery = searchBox.value.trim().toLowerCase();
  renderAll();
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchBox) {
    e.preventDefault();
    searchBox.focus();
  } else if (e.key === 'Escape') {
    if (document.getElementById('drawerBackdrop').classList.contains('open')) {
      closeDrawer();
    } else if (document.activeElement === searchBox) {
      searchBox.blur();
    }
  }
});

function matchesQuery(obj) {
  if (!searchQuery) return true;
  return JSON.stringify(obj).toLowerCase().includes(searchQuery);
}

function renderViewTabs() {
  const flowLen = (DATA.flowClips || []).length;
  const views = [
    { id: 'all', label: 'All Layers' },
    { id: 'masters', label: 'Master Kits (' + (DATA.cards || []).length + ')' },
    { id: 'flow', label: 'Google Flow Live (' + flowLen + ')' },
    { id: 'placements', label: 'Placement Snippets (' + placementBrands.length + ')' },
    { id: 'rejected', label: 'Rejected Archive (' + rejList.length + ')' },
  ];
  const el = document.getElementById('viewTabs');
  el.innerHTML = views.map(v =>
    '<button type="button" class="pill ' + (activeView === v.id ? 'active' : '') + '" data-v="' + esc(v.id) + '">' + esc(v.label) + '</button>'
  ).join('');
  el.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => { activeView = btn.dataset.v; renderAll(); };
  });
}

function renderBrandFilters() {
  const el = document.getElementById('brandFilters');
  const brands = ['all', ...Object.keys(DATA.brandMeta || {})];
  el.innerHTML = brands.map(b => {
    const label = b === 'all' ? 'All brands (' + (DATA.cards || []).length + ')' : (DATA.brandMeta[b]?.displayName || b);
    return '<button type="button" class="pill ' + (activeBrand === b ? 'active' : '') + '" data-b="' + esc(b) + '">' + esc(label) + '</button>';
  }).join('');
  el.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => { activeBrand = btn.dataset.b; renderAll(); };
  });
}

function renderFlowSection() {
  const show = activeView === 'all' || activeView === 'flow';
  const sec = document.getElementById('flowSection');
  const flowClips = (DATA.flowClips || []).filter(f => (activeBrand === 'all' || f.brand === activeBrand) && matchesQuery(f));
  if (!show || flowClips.length === 0) {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';
  const cStart = c.startingCredits || c.poolIncludedCredits || 10050;
  const cEnd = typeof c.endingCredits === 'number' ? c.endingCredits : (cStart - (c.totalSpentCredits || 0));
  document.getElementById('flowCreditBar').innerHTML =
    '<div><strong>Live Flow Captures:</strong> ' + esc(flowClips.length) + ' active asset(s)</div>' +
    '<div class="meta-line">ULTRA Pool: ' + esc(cStart) + ' start · ' + esc(c.totalSpentCredits || 0) + ' spent · ' + esc(cEnd) + ' remaining (Cap: ' + esc(c.hardCapCredits || 2500) + ')</div>';
  document.getElementById('flowGrid').innerHTML = flowClips.map(f => {
    const mediaEl = f.modality === 'video'
      ? '<video controls loop muted playsinline preload="none" src="' + esc(f.relPath) + '"' + (f.posterRelPath ? ' poster="' + esc(f.posterRelPath) + '"' : '') + '></video>'
      : '<img loading="lazy" src="' + esc(f.relPath) + '" alt="' + esc(f.file) + '"/>';
    const brandAccent = DATA.brandMeta?.[f.brand]?.accent || '#82D8E6';
    const modelLabel = f.model || 'google-flow';
    const flowBadgeClass = f.qaDecision === 'iterate' ? 'warn' : 'pass';
    const flowScoreText = f.qaTotal ? (f.qaTotal + '/30 · ' + (f.stage || 'qa_scored')) : (f.modality || '');
    return '<article class="card">' + mediaEl +
      '<div class="card-body">' +
        '<div class="row"><span class="badge" style="color:' + esc(brandAccent) + '">' + esc(f.brandDisplayName || f.brand) + '</span><span class="badge ' + flowBadgeClass + '">' + esc(modelLabel) + ' · ' + esc(flowScoreText) + '</span></div>' +
        '<h3>' + esc(f.file) + '</h3>' +
        '<div class="meta-line">Bytes: ' + esc((f.bytes || 0).toLocaleString()) + ' · SHA256: ' + esc((f.sha256 || '').slice(0,16)) + '...</div>' +
      '</div></article>';
  }).join('');
}

function renderMastersSection() {
  const show = activeView === 'all' || activeView === 'masters';
  const sec = document.getElementById('mastersSection');
  if (!show) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  const list = (DATA.cards || []).filter(x => (activeBrand === 'all' || x.brand === activeBrand) && matchesQuery(x));
  const grid = document.getElementById('assetGrid');
  grid.innerHTML = list.map((a) => {
    const route = (a.targetUrls && a.targetUrls[0]) || '';
    const cardBadgeClass = Number(a.qaTotal) >= 26 ? 'pass' : 'warn';
    return '<article class="card">' +
      '<img id="img-' + esc(a.assetId) + '" src="' + esc(a.ogSrc) + '" alt="' + esc(a.title) + '"/>' +
      '<div class="card-body">' +
        '<div class="row"><span class="badge" style="color:' + esc(a.accent) + '">' + esc(a.brandDisplayName) + '</span><span class="badge ' + cardBadgeClass + '">' + esc(a.qaTotal) + '/30 · ' + esc(a.stage) + '</span></div>' +
        '<h3>' + esc(a.title) + '</h3>' +
        '<p>' + esc(a.subtitle) + ' · ' + esc(a.role) + '</p>' +
        '<div class="meta-line">Target: ' + esc(route) + '</div>' +
        '<div class="meta-line">R2: ' + esc(a.r2MasterPath || 'pending') + '</div>' +
        '<div class="preview-tabs">' +
          '<button type="button" class="mini-btn active" data-id="' + esc(a.assetId) + '" data-src="' + esc(a.ogSrc) + '">OG 1200x630</button>' +
          '<button type="button" class="mini-btn" data-id="' + esc(a.assetId) + '" data-src="' + esc(a.heroSrc) + '">Hero 16:9</button>' +
          '<button type="button" class="mini-btn" data-id="' + esc(a.assetId) + '" data-src="' + esc(a.squareSrc) + '">1:1</button>' +
          '<button type="button" class="mini-btn" data-id="' + esc(a.assetId) + '" data-src="' + esc(a.verticalSrc) + '">9:16</button>' +
          '<button type="button" class="inspect-btn" data-inspect="' + esc(a.assetId) + '">Inspect QA &amp; Placement</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }).join('');
  grid.querySelectorAll('.mini-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const img = document.getElementById('img-' + btn.dataset.id);
      if (img) img.src = btn.dataset.src;
      btn.parentElement.querySelectorAll('.mini-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  grid.querySelectorAll('.inspect-btn').forEach(btn => {
    btn.addEventListener('click', () => openDrawerForAsset(btn.dataset.inspect, btn));
  });
}

function renderPlacementsSection() {
  const show = activeView === 'all' || activeView === 'placements';
  const sec = document.getElementById('placementsSection');
  const keys = placementBrands.filter(b => activeBrand === 'all' || b === activeBrand);
  if (!show || keys.length === 0) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  const grid = document.getElementById('placementsGrid');
  grid.innerHTML = keys.map(b => {
    const p = DATA.placements[b];
    const rm = p.routeMap || {};
    if (!matchesQuery(rm)) return '';
    const brandAccent = DATA.brandMeta?.[b]?.accent || '#82D8E6';
    return '<article class="card"><div class="card-body">' +
      '<div class="row"><span class="badge" style="color:' + esc(brandAccent) + '">' + esc(rm.displayName || b) + '</span><span class="badge ' + (rm.isStaging ? 'warn' : 'pass') + '">' + esc(rm.routes?.length || 0) + ' routes · ' + (rm.isStaging ? 'staging' : 'public') + '</span></div>' +
      '<h3>placements/' + esc(b) + '/</h3>' +
      '<div class="meta-line">Eligible Masters: ' + esc(rm.eligibleMastersCount || 0) + ' · Flow Clips: ' + esc(rm.eligibleFlowClipsCount || 0) + '</div>' +
      '<div class="meta-line">SVG Mark: ' + esc(rm.markFile || 'existing brand lockup') + '</div>' +
      '<div class="preview-tabs"><button type="button" class="inspect-btn" data-place-brand="' + esc(b) + '">Open TSX Snippet &amp; Routes</button></div>' +
    '</div></article>';
  }).join('');
  grid.querySelectorAll('[data-place-brand]').forEach(btn => {
    btn.addEventListener('click', () => openDrawerForBrand(btn.dataset.placeBrand, btn));
  });
}

function renderRejectedSection() {
  const show = activeView === 'all' || activeView === 'rejected';
  const sec = document.getElementById('rejectedSection');
  const items = rejList.filter(r => (activeBrand === 'all' || r.brand === activeBrand) && matchesQuery(r));
  if (!show || items.length === 0) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  document.getElementById('rejectedGrid').innerHTML = items.map(r => {
    const preserved = String(r.preservedPath || '');
    const isVid = preserved.toLowerCase().endsWith('.mp4');
    const posterPath = isVid ? preserved.slice(0, -4) + '-poster.webp' : preserved;
    const preview = isVid
      ? '<video controls muted playsinline preload="none" src="' + esc(r.preservedPath) + '" poster="' + esc(posterPath) + '"></video>'
      : '<img loading="lazy" src="' + esc(r.preservedPath) + '" alt="' + esc(r.originalFile) + '"/>';
    return '<article class="card">' + preview +
      '<div class="card-body">' +
        '<div class="row"><span class="badge">' + esc(r.brand) + '</span><span class="badge rej">' + esc(r.v1QaScore) + '/30 · REJECTED v1</span></div>' +
        '<h3>' + esc(r.originalFile) + '</h3>' +
        '<p>' + esc(r.reason) + '</p>' +
        '<div class="meta-line">SHA256: ' + esc((r.sha256 || '').slice(0, 16)) + '... · Preserved: ' + esc(r.preservedPath) + '</div>' +
      '</div></article>';
  }).join('');
}

function openDrawerForAsset(assetId, triggerEl) {
  const card = (DATA.cards || []).find(x => x.assetId === assetId);
  if (!card) return;
  lastFocusedEl = triggerEl;
  document.getElementById('drawerBrand').textContent = card.brandDisplayName;
  document.getElementById('drawerTitle').textContent = card.title;
  document.getElementById('drawerSub').textContent = card.subtitle + ' · ' + card.role;

  const axes = Object.entries(card.qaBreakdown || {});
  document.getElementById('drawerQaBars').innerHTML = axes.map(([k, val]) =>
    '<div class="bar-row"><span>' + esc(k) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.min(100, Number(val) * 20) + '%"></div></div><strong>' + esc(val) + '/5</strong></div>'
  ).join('');

  document.getElementById('drawerMeta').innerHTML =
    '<div><strong>Stage:</strong> ' + esc(card.stage) + ' (' + esc(card.qaTotal) + '/30)</div>' +
    '<div><strong>R2 Master:</strong> ' + esc(card.r2MasterPath || 'pending') + '</div>' +
    '<div><strong>Drive Mirror:</strong> ' + esc(card.driveMirrorPath || 'pending') + '</div>';

  const brandSnippet = DATA.placements?.[card.brand]?.snippetTsx || '<picture><source type="image/webp" srcSet="' + card.heroSrc + ' 1920w"/><img src="' + card.ogSrc + '" alt="' + card.title + '"/></picture>';
  document.getElementById('drawerSnippet').textContent = brandSnippet;
  document.getElementById('drawerBackdrop').classList.add('open');
  document.getElementById('drawerClose').focus();
}

function openDrawerForBrand(brand, triggerEl) {
  const p = DATA.placements?.[brand];
  if (!p) return;
  lastFocusedEl = triggerEl;
  const rm = p.routeMap || {};
  document.getElementById('drawerBrand').textContent = rm.displayName || brand;
  document.getElementById('drawerTitle').textContent = 'Domain Placement Kit: ' + brand;
  document.getElementById('drawerSub').textContent = 'Routes: ' + (rm.routes || []).map(r => r.route).join(', ');
  document.getElementById('drawerQaBars').innerHTML = '';
  document.getElementById('drawerMeta').textContent = 'Files: route-media-map.json, HeroMediaSlot.snippet.tsx, schema-org-media.json, image-video-sitemap.xml';
  document.getElementById('drawerSnippet').textContent = p.snippetTsx || JSON.stringify(rm, null, 2);
  document.getElementById('drawerBackdrop').classList.add('open');
  document.getElementById('drawerClose').focus();
}

function closeDrawer() {
  document.getElementById('drawerBackdrop').classList.remove('open');
  if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') lastFocusedEl.focus();
}

document.getElementById('drawerClose').addEventListener('click', closeDrawer);
document.getElementById('drawerBackdrop').addEventListener('click', (e) => {
  if (e.target === document.getElementById('drawerBackdrop')) closeDrawer();
});
document.getElementById('copySnippetBtn').addEventListener('click', async () => {
  const btn = document.getElementById('copySnippetBtn');
  try {
    await navigator.clipboard.writeText(document.getElementById('drawerSnippet').textContent);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy snippet'; }, 1500);
  } catch {
    btn.textContent = 'Copy manually';
  }
});

function renderAll() {
  renderViewTabs();
  renderBrandFilters();
  renderFlowSection();
  renderMastersSection();
  renderPlacementsSection();
  renderRejectedSection();
}

renderAll();
</script>
</body>
</html>`

  const outPath = path.join(jobRoot, 'FLOW_MULTIMODAL_STUDIO_COCKPIT.html')
  fs.writeFileSync(outPath, html, 'utf8')
  return outPath
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const out = generateStudioCockpitHtml()
  console.log(`Generated cockpit: ${out}`)
}
