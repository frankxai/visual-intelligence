#!/usr/bin/env node
/**
 * Generates the interactive dark-obsidian / liquid-glass HTML5 Multimodal Studio & DAM Cockpit
 * from `asset-manifest.json`, `r2-dam-plan.json`, `credit-ledger.json` (if present), and SVG vector marks.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

const DEFAULT_JOB_ROOT = process.env.VIS_JOB_ROOT || path.join(os.homedir(), 'brands/image-system/jobs/2026-11-16-flow-godmode')
const DEFAULT_MARKS_DIR = process.env.VIS_MARKS_DIR || path.resolve(os.homedir(), 'starlight/repos/starlight-design-intelligence/brand-image-system/svg-marks')

function readJsonSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

export function generateStudioCockpitHtml({
  jobRoot = DEFAULT_JOB_ROOT,
  marksDir = DEFAULT_MARKS_DIR,
} = {}) {
  const manifest = readJsonSafe(path.join(jobRoot, 'asset-manifest.json'), {
    summary: { brandCount: 0, masterPlatesCount: 0, derivativeRenditionsCount: 0, flowClipsCount: 0, totalDeliverables: 0, qaPassCount: 0 },
    brandMeta: {},
    assets: [],
    flowClips: [],
  })
  const r2Plan = readJsonSafe(path.join(jobRoot, 'r2-dam-plan.json'), { readyCount: 0, uploadManifest: [] })
  const creditLedger = readJsonSafe(path.join(jobRoot, 'credit-ledger.json'), {
    tier: 'Google AI Ultra',
    poolIncludedCredits: 10000,
    hardCapCredits: 2500,
    totalSpentCredits: 0,
    remainingBudgetUnderCap: 2500,
    entries: [],
  })

  const svgMarks = {}
  if (fs.existsSync(marksDir)) {
    for (const file of fs.readdirSync(marksDir)) {
      if (file.endsWith('.svg')) {
        svgMarks[file] = fs.readFileSync(path.join(marksDir, file), 'utf8')
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
      targetUrls: a.targetUrls || [],
      r2MasterKey: r2?.r2?.masterKey || null,
      r2PreviewKey: r2?.r2?.previewKey || null,
      driveMirrorPath: r2?.driveMirrorPath || null,
      ogSrc: relEditedOg,
      heroSrc: relEditedHero,
      squareSrc: relEditedSquare,
      verticalSrc: relEditedVertical,
      derivativeCount: (a.derivatives || []).length,
    }
  })

  const safeData = JSON.stringify({
    summary: manifest.summary,
    r2ReadyCount: r2Plan.readyCount,
    creditLedger,
    brandMeta: manifest.brandMeta,
    cards: cardsPayload,
    flowClips: manifest.flowClips || [],
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
    --panel: rgba(17, 23, 34, 0.78);
    --border: rgba(255, 255, 255, 0.10);
    --ivory: #F6F1E7;
    --muted: #94A3B8;
    --cyan: #82D8E6;
    --gold: #C9A15C;
    --emerald: #10B981;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: radial-gradient(circle at 20% 0%, #111927 0%, var(--ink) 55%);
    color: var(--ivory);
    font-family: "Segoe UI", Inter, -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.5;
  }
  .shell { max-width: 1440px; margin: 0 auto; padding: 28px 24px 72px; }
  header {
    display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 20px;
    border-bottom: 1px solid var(--border); padding-bottom: 20px; margin-bottom: 24px;
  }
  .eyebrow { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--cyan); font-weight: 600; }
  h1 { margin: 4px 0 6px; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
  .sub { color: var(--muted); font-size: 14px; max-width: 720px; margin: 0; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .metric {
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px;
    backdrop-filter: blur(12px);
  }
  .metric .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
  .metric .val { font-size: 24px; font-weight: 700; margin-top: 4px; color: var(--ivory); }
  .metric .hint { font-size: 12px; color: var(--cyan); margin-top: 2px; }
  .controls {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 20px;
    padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  }
  .pill {
    background: transparent; color: var(--muted); border: 1px solid var(--border); border-radius: 999px;
    padding: 6px 13px; font-size: 12px; cursor: pointer; transition: all 140ms ease;
  }
  .pill:hover, .pill.active { color: var(--ivory); border-color: var(--cyan); background: rgba(130, 216, 230, 0.12); }
  .marks-strip {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 10px; margin-bottom: 28px;
  }
  .mark-card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 12px;
    display: flex; align-items: center; gap: 10px;
  }
  .mark-card svg { width: 32px; height: 32px; color: var(--ivory); flex-shrink: 0; }
  .mark-card span { font-size: 12px; color: var(--muted); word-break: break-word; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px; }
  .card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; background: #05070c; }
  .card-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; }
  .badge { padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; border: 1px solid var(--border); }
  .pass { color: var(--emerald); border-color: rgba(16,185,129,0.4); background: rgba(16,185,129,0.1); }
  .warn { color: var(--gold); border-color: rgba(245,158,11,0.45); background: rgba(245,158,11,0.12); }
  .card h3 { margin: 0; font-size: 16px; color: var(--ivory); }
  .card p { margin: 0; font-size: 13px; color: var(--muted); }
  .meta-line { font-family: ui-monospace, Consolas, monospace; font-size: 11px; color: #94a3b8; word-break: break-all; }
  .preview-tabs { display: flex; gap: 6px; margin-top: auto; padding-top: 6px; }
  .mini-btn {
    background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--ivory);
    border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer;
  }
  .mini-btn.active { border-color: var(--gold); color: var(--gold); }
  .section-title { font-size: 15px; font-weight: 600; margin: 26px 0 12px; color: var(--ivory); }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>
</head>
<body>
<div class="shell">
  <header>
    <div>
      <div class="eyebrow">Visual Intelligence OS v3 · Google Flow Ultra Studio</div>
      <h1>Multimodal Brand Asset &amp; Lifecycle Cockpit</h1>
      <p class="sub">Six-stage governed asset pipeline (planned, created, edited, qa_scored, ready_for_publish, placed) connecting native generation, Google Flow, SVG marks, Cloudflare R2, and domain funnel slots.</p>
    </div>
  </header>

  <section class="metrics" id="metrics"></section>

  <h2 class="section-title">Vector SVG Marks &amp; Identity Lockups (16px–48px Ready)</h2>
  <section class="marks-strip" id="marksStrip"></section>

  <section id="flowSection" style="display:none;margin-bottom:28px">
    <h2 class="section-title">Google Flow Live Studio Outputs (ULTRA Tier · Gemini Omni 1.2 + Nano Banana 2.1 + Veo 3.1)</h2>
    <div id="flowCreditBar" class="controls" style="justify-content:space-between"></div>
    <div class="grid" id="flowGrid"></div>
  </section>

  <div class="controls" id="brandFilters"></div>
  <section class="grid" id="assetGrid"></section>
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
const metricsEl = document.getElementById('metrics');
const s = DATA.summary || {};
const c = DATA.creditLedger || {};
const cards = [
  { label: 'Active Brands', val: s.brandCount || 0, hint: 'Portfolio domains mapped' },
  { label: 'Master Plates', val: s.masterPlatesCount || 0, hint: 'Inspected >=26/30' },
  { label: 'Compiled Renditions', val: s.derivativeRenditionsCount || 0, hint: '16:9, OG, 1:1, 4:5, 9:16 WebP' },
  { label: 'Total Deliverables', val: s.totalDeliverables || 0, hint: 'Masters + Renditions + Flow' },
  { label: 'R2 DAM Ready', val: DATA.r2ReadyCount || 0, hint: 'vis-media content-addressed' },
  { label: 'Flow Ultra Spend', val: (c.totalSpentCredits || 0) + ' / ' + (c.hardCapCredits || 2500), hint: (c.poolIncludedCredits || 10000) + ' monthly pool' },
];
metricsEl.innerHTML = cards.map(m => '<div class="metric"><div class="label">' + esc(m.label) + '</div><div class="val">' + esc(m.val) + '</div><div class="hint">' + esc(m.hint) + '</div></div>').join('');

const marksStrip = document.getElementById('marksStrip');
marksStrip.innerHTML = Object.entries(DATA.svgMarks || {}).map(([name, svg]) =>
  '<div class="mark-card">' + svg + '<span>' + esc(name.replace('.svg','')) + '</span></div>'
).join('');

const flowClips = DATA.flowClips || [];
if (flowClips.length > 0) {
  document.getElementById('flowSection').style.display = 'block';
  const cStart = c.startingCredits || c.poolIncludedCredits || 10050;
  const cEnd = typeof c.endingCredits === 'number' ? c.endingCredits : (cStart - (c.totalSpentCredits || 0));
  document.getElementById('flowCreditBar').innerHTML =
    '<div><strong>Live Flow Captures:</strong> ' + esc(flowClips.length) + ' verified asset(s)</div>' +
    '<div class="meta-line">ULTRA Pool: ' + esc(cStart) + ' start · ' + esc(c.totalSpentCredits || 0) + ' spent · ' + esc(cEnd) + ' remaining (Cap: ' + esc(c.hardCapCredits || 2500) + ')</div>';
  document.getElementById('flowGrid').innerHTML = flowClips.map(f => {
    const mediaEl = f.modality === 'video'
      ? '<video controls loop muted playsinline style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#05070c" src="' + esc(f.relPath) + '"' + (f.posterRelPath ? ' poster="' + esc(f.posterRelPath) + '"' : '') + '></video>'
      : '<img src="' + esc(f.relPath) + '" alt="' + esc(f.file) + '"/>';
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

let activeBrand = 'all';
const filterEl = document.getElementById('brandFilters');
const brands = ['all', ...Object.keys(DATA.brandMeta || {})];
function renderFilters() {
  filterEl.innerHTML = brands.map(b => {
    const label = b === 'all' ? 'All brands (' + DATA.cards.length + ')' : (DATA.brandMeta[b]?.displayName || b);
    return '<button class="pill ' + (activeBrand === b ? 'active' : '') + '" data-b="' + esc(b) + '">' + esc(label) + '</button>';
  }).join('');
  filterEl.querySelectorAll('button').forEach(btn => btn.onclick = () => { activeBrand = btn.dataset.b; renderFilters(); renderCards(); });
}

function renderCards() {
  const grid = document.getElementById('assetGrid');
  const list = activeBrand === 'all' ? DATA.cards : DATA.cards.filter(x => x.brand === activeBrand);
  grid.innerHTML = list.map((a, idx) => {
    const route = (a.targetUrls && a.targetUrls[0]) || '';
    const cardBadgeClass = Number(a.qaTotal) >= 26 ? 'pass' : 'warn';
    return '<article class="card" data-idx="' + idx + '">' +
      '<img id="img-' + esc(a.assetId) + '" src="' + esc(a.ogSrc) + '" alt="' + esc(a.title) + '"/>' +
      '<div class="card-body">' +
        '<div class="row"><span class="badge" style="color:' + esc(a.accent) + '">' + esc(a.brandDisplayName) + '</span><span class="badge ' + cardBadgeClass + '">' + esc(a.qaTotal) + '/30 · ' + esc(a.stage) + '</span></div>' +
        '<h3>' + esc(a.title) + '</h3>' +
        '<p>' + esc(a.subtitle) + ' · ' + esc(a.role) + '</p>' +
        '<div class="meta-line">Target: ' + esc(route) + '</div>' +
        '<div class="meta-line">R2: ' + esc(a.r2MasterKey || 'pending') + '</div>' +
        '<div class="preview-tabs">' +
          '<button class="mini-btn active" data-id="' + esc(a.assetId) + '" data-src="' + esc(a.ogSrc) + '">OG 1200x630</button>' +
          '<button class="mini-btn" data-id="' + esc(a.assetId) + '" data-src="' + esc(a.heroSrc) + '">Hero 16:9</button>' +
          '<button class="mini-btn" data-id="' + esc(a.assetId) + '" data-src="' + esc(a.squareSrc) + '">1:1</button>' +
          '<button class="mini-btn" data-id="' + esc(a.assetId) + '" data-src="' + esc(a.verticalSrc) + '">9:16</button>' +
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
}

renderFilters();
renderCards();
</script>
</body>
</html>`

  const outPath = path.join(jobRoot, 'FLOW_MULTIMODAL_STUDIO_COCKPIT.html')
  fs.writeFileSync(outPath, html, 'utf8')
  return outPath
}

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/')}`) {
  const out = generateStudioCockpitHtml()
  console.log(`Generated cockpit: ${out}`)
}
