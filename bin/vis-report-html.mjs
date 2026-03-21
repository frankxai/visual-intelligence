#!/usr/bin/env node
/**
 * VIS — Visual Intelligence System — HTML Audit Report Generator
 *
 * Generates a self-contained HTML report with:
 *   - Health score overview
 *   - Summary cards (images, categories, size, issues)
 *   - Sortable issue table with severity badges
 *   - Category breakdown bar chart (pure CSS)
 *   - Oversized images table
 *   - Page coverage stats (if sitemap-image-map.json exists)
 *
 * Usage:
 *   node bin/vis-report-html.mjs                      # Output vis-report.html in project root
 *   node bin/vis-report-html.mjs --output report.html  # Custom output path
 *   node bin/vis-report-html.mjs --project /path/to    # Specify project root
 *
 * Inspired by Unlighthouse's site-wide audit report pattern.
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
let outputPath = null
let projectRoot = null

for (let i = 0; i < argv.length; i++) {
  if ((argv[i] === '--output' || argv[i] === '-o') && argv[i + 1]) { outputPath = argv[++i]; continue }
  if ((argv[i] === '--project' || argv[i] === '-p') && argv[i + 1]) { projectRoot = argv[++i]; continue }
}

// ---------------------------------------------------------------------------
// Resolve project root
// ---------------------------------------------------------------------------
function findProjectRoot(dir) {
  if (fs.existsSync(path.join(dir, 'vis.config.json'))) return dir
  if (fs.existsSync(path.join(dir, 'package.json'))) return dir
  const parent = path.dirname(dir)
  if (parent === dir) return process.cwd()
  return findProjectRoot(parent)
}

const ROOT = projectRoot ? path.resolve(projectRoot) : findProjectRoot(process.cwd())

function loadConfig() {
  const configPath = path.join(ROOT, 'vis.config.json')
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  }
  return {
    imagesDir: 'public/images',
    registryPath: 'data/visual-registry.json',
    brandDnaPath: 'data/brand-visual-dna.json',
    sitemapMapPath: 'data/sitemap-image-map.json',
    skipSuffixes: ['_thumb.jpeg', '_thumb.jpg', '_thumb.png'],
    imageExtensions: ['.png', '.jpg', '.jpeg', '.webp'],
    maxFileSizeKB: 2000,
    placeholderImages: ['blog-hero-aurora.svg', 'placeholder.png', 'default-hero.png'],
  }
}

const config = loadConfig()

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------
const registryPath = path.resolve(ROOT, config.registryPath)
if (!fs.existsSync(registryPath)) {
  console.error(`Registry not found at ${registryPath}. Run \`vis scan\` first.`)
  process.exit(1)
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))

let sitemapMap = null
const sitemapPath = path.resolve(ROOT, config.sitemapMapPath || 'data/sitemap-image-map.json')
if (fs.existsSync(sitemapPath)) {
  sitemapMap = JSON.parse(fs.readFileSync(sitemapPath, 'utf-8'))
}

// ---------------------------------------------------------------------------
// Run audit checks (mirrors audit-visual-health.mjs logic)
// ---------------------------------------------------------------------------
const PLACEHOLDER_IMAGES = config.placeholderImages || ['blog-hero-aurora.svg', 'placeholder.png', 'default-hero.png']

function findPlaceholderUsage() {
  const issues = []
  for (const placeholder of PLACEHOLDER_IMAGES) {
    try {
      const result = execFileSync('grep', [
        '-rn', placeholder,
        'content/', 'app/', 'data/',
        '--include=*.mdx', '--include=*.tsx', '--include=*.json',
      ], { encoding: 'utf-8', cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] })

      for (const line of result.split('\n').filter(Boolean)) {
        const [filePath] = line.split(':')
        if (filePath.includes('CONTENT_SCHEMA') || filePath.includes('visual-registry')
          || filePath.includes('content-index.json') || filePath.includes('vault-manifest.json')
          || filePath.includes('sitemap-image-map.json')) continue
        issues.push({
          type: 'placeholder',
          severity: 'high',
          file: filePath,
          image: placeholder,
          message: `Uses generic placeholder "${placeholder}" — needs unique image`,
        })
      }
    } catch { /* grep exits non-zero when no matches */ }
  }
  return issues
}

function findBlogDuplicateHeroes() {
  const issues = []
  const contentDir = path.resolve(ROOT, 'content/blog')
  if (!fs.existsSync(contentDir)) return issues

  const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.mdx'))
  for (const file of files) {
    const content = fs.readFileSync(path.join(contentDir, file), 'utf-8')
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!frontmatterMatch) continue

    const imageMatch = frontmatterMatch[1].match(/image:\s*['"]?([^\s'"]+)/)
    if (!imageMatch) continue

    const heroImage = imageMatch[1]
    const bodyContent = content.slice(frontmatterMatch[0].length)

    if (bodyContent.includes(heroImage)) {
      const lines = content.split('\n')
      const frontmatterEnd = lines.indexOf('---', 1)
      const lineNum = lines.findIndex((l, i) => i > frontmatterEnd && l.includes(heroImage)) + 1
      issues.push({
        type: 'duplicate-hero',
        severity: 'medium',
        file: `content/blog/${file}`,
        image: heroImage,
        line: lineNum,
        message: `Hero image repeated in body content — remove the body reference`,
      })
    }
  }
  return issues
}

function findOversizedImages() {
  return registry
    .filter(img => img.sizeKB > (config.maxFileSizeKB || 2000))
    .map(img => ({
      type: 'oversized',
      severity: 'low',
      file: `public${img.path}`,
      image: img.path,
      sizeKB: img.sizeKB,
      message: `Image is ${(img.sizeKB / 1024).toFixed(1)}MB — consider optimizing to <${Math.round((config.maxFileSizeKB || 2000) / 1024)}MB`,
    }))
}

function findOrphanedImages() {
  const issues = []
  let referencedPaths = new Set()
  try {
    const searchDirs = ['app/', 'components/', 'content/', 'data/', 'lib/'].filter(d =>
      fs.existsSync(path.join(ROOT, d))
    )
    if (searchDirs.length === 0) return issues

    const result = execFileSync('grep', [
      '-roh', '/images/[^"\'\\)\\s]*',
      ...searchDirs,
      '--include=*.tsx', '--include=*.mdx', '--include=*.json', '--include=*.ts',
    ], { encoding: 'utf-8', cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] })

    for (const line of result.split('\n').filter(Boolean)) {
      referencedPaths.add(line.trim())
    }
  } catch { /* grep may exit non-zero */ }

  for (const img of registry) {
    if (!referencedPaths.has(img.path)) {
      const thumbPath = img.path.replace(/\.png$/, '_thumb.jpeg')
      if (!referencedPaths.has(thumbPath)) {
        issues.push({
          type: 'orphaned',
          severity: 'info',
          file: `public${img.path}`,
          image: img.path,
          sizeKB: img.sizeKB,
          message: `Image not referenced in any code/content file`,
        })
      }
    }
  }
  return issues
}

// Collect all issues
const placeholders = findPlaceholderUsage()
const duplicates = findBlogDuplicateHeroes()
const oversized = findOversizedImages()
const orphaned = findOrphanedImages()
const allIssues = [...placeholders, ...duplicates, ...oversized, ...orphaned]

const highCount = allIssues.filter(i => i.severity === 'high').length
const medCount = allIssues.filter(i => i.severity === 'medium').length
const lowCount = allIssues.filter(i => i.severity === 'low').length
const infoCount = allIssues.filter(i => i.severity === 'info').length
const score = Math.max(0, 100 - (highCount * 15) - (medCount * 5) - (lowCount * 2))

// Aggregate stats
const totalSizeKB = registry.reduce((s, e) => s + e.sizeKB, 0)
const categories = {}
const moods = {}
for (const e of registry) {
  categories[e.category] = (categories[e.category] || 0) + 1
  moods[e.mood] = (moods[e.mood] || 0) + 1
}
const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1])
const maxCategoryCount = sortedCategories.length > 0 ? sortedCategories[0][1] : 1

// Coverage stats from sitemap map
let coverageStats = null
if (sitemapMap && sitemapMap._summary) {
  const s = sitemapMap._summary
  coverageStats = {
    totalPages: s.totalPages,
    complete: s.statusBreakdown?.complete || 0,
    needsImages: s.statusBreakdown?.needsImages || 0,
    placeholder: s.statusBreakdown?.placeholder || 0,
    acceptableNoImage: s.statusBreakdown?.acceptableNoImage || 0,
    pagesWithOgImage: s.coverage?.pagesWithOgImage || 0,
    pagesWithHero: s.coverage?.pagesWithHero || 0,
  }
}

// ---------------------------------------------------------------------------
// HTML Generation
// ---------------------------------------------------------------------------
const timestamp = new Date().toISOString()
const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function scoreColor(s) {
  if (s >= 90) return '#10B981'
  if (s >= 70) return '#F59E0B'
  if (s >= 50) return '#F97316'
  return '#EF4444'
}

function scoreLabel(s) {
  if (s >= 90) return 'EXCELLENT'
  if (s >= 70) return 'GOOD'
  if (s >= 50) return 'NEEDS ATTENTION'
  return 'CRITICAL'
}

function severityBadge(sev) {
  const colors = { high: '#EF4444', medium: '#F59E0B', low: '#3B82F6', info: '#6B7280' }
  const bg = colors[sev] || '#6B7280'
  return `<span class="badge" style="background:${bg}">${sev.toUpperCase()}</span>`
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function coveragePieCSS() {
  if (!coverageStats) return ''
  const { complete, needsImages, placeholder, acceptableNoImage, totalPages } = coverageStats
  const pComplete = ((complete / totalPages) * 100).toFixed(1)
  const pNeeds = ((needsImages / totalPages) * 100).toFixed(1)
  const pPlaceholder = ((placeholder / totalPages) * 100).toFixed(1)
  const pAcceptable = ((acceptableNoImage / totalPages) * 100).toFixed(1)

  // Conic gradient segments
  let offset = 0
  const segments = []
  const slices = [
    { pct: parseFloat(pComplete), color: '#10B981', label: 'Complete', count: complete },
    { pct: parseFloat(pAcceptable), color: '#6B7280', label: 'Acceptable (no image)', count: acceptableNoImage },
    { pct: parseFloat(pNeeds), color: '#F59E0B', label: 'Needs Images', count: needsImages },
    { pct: parseFloat(pPlaceholder), color: '#EF4444', label: 'Placeholder', count: placeholder },
  ]
  for (const sl of slices) {
    const end = offset + sl.pct
    segments.push(`${sl.color} ${offset}% ${end}%`)
    offset = end
  }
  // Fill remainder if rounding leaves gap
  if (offset < 100) segments.push(`#1a1a2e ${offset}% 100%`)

  const gradient = segments.join(', ')

  return `
    <section class="section">
      <h2>Page Coverage</h2>
      <p class="subtitle">${totalPages} pages analyzed from sitemap-image-map.json</p>
      <div class="coverage-grid">
        <div class="pie-container">
          <div class="pie" style="background: conic-gradient(${gradient})"></div>
        </div>
        <div class="coverage-legend">
          ${slices.map(sl => `
            <div class="legend-item">
              <span class="legend-dot" style="background:${sl.color}"></span>
              <span class="legend-label">${sl.label}</span>
              <span class="legend-value">${sl.count} (${sl.pct}%)</span>
            </div>
          `).join('')}
          <div class="legend-item" style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">
            <span class="legend-dot" style="background:#06B6D4"></span>
            <span class="legend-label">Pages with OG Image</span>
            <span class="legend-value">${coverageStats.pagesWithOgImage}</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot" style="background:#7C3AED"></span>
            <span class="legend-label">Pages with Hero</span>
            <span class="legend-value">${coverageStats.pagesWithHero}</span>
          </div>
        </div>
      </div>
    </section>`
}

function issueRows() {
  if (allIssues.length === 0) return '<tr><td colspan="4" style="text-align:center;color:rgba(255,255,255,0.3)">No issues found</td></tr>'
  return allIssues.map(i => `
    <tr>
      <td>${severityBadge(i.severity)}</td>
      <td>${esc(i.type)}</td>
      <td class="mono">${esc(i.file || i.image)}</td>
      <td>${esc(i.message)}</td>
    </tr>
  `).join('')
}

function categoryBars() {
  return sortedCategories.map(([cat, count]) => {
    const pct = ((count / maxCategoryCount) * 100).toFixed(1)
    return `
      <div class="bar-row">
        <span class="bar-label">${esc(cat)}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="bar-value">${count}</span>
      </div>`
  }).join('')
}

function oversizedTable() {
  if (oversized.length === 0) return '<p class="empty-note">No oversized images detected.</p>'
  const rows = oversized.sort((a, b) => b.sizeKB - a.sizeKB).map(img => `
    <tr>
      <td class="thumb-cell"><img src="${esc(img.image)}" alt="" class="thumb" loading="lazy" onerror="this.style.display='none'"></td>
      <td class="mono">${esc(img.image)}</td>
      <td class="num">${(img.sizeKB / 1024).toFixed(1)} MB</td>
      <td class="num">&lt; ${Math.round((config.maxFileSizeKB || 2000) / 1024)} MB</td>
    </tr>
  `).join('')

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:60px">Preview</th>
          <th>Image Path</th>
          <th style="width:90px">Current</th>
          <th style="width:90px">Target</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

const scoreClr = scoreColor(score)
const scoreDeg = Math.round((score / 100) * 360)

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VIS Audit Report — ${dateStr}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{font-size:15px;-webkit-font-smoothing:antialiased}
  body{background:#0a0a0b;color:rgba(255,255,255,0.87);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;line-height:1.6;padding:0}
  a{color:#10B981;text-decoration:none}
  a:hover{text-decoration:underline}

  /* Layout */
  .container{max-width:1100px;margin:0 auto;padding:24px 20px 48px}

  /* Header */
  .header{display:flex;align-items:center;gap:32px;padding:40px 0 32px;border-bottom:1px solid rgba(255,255,255,0.06);flex-wrap:wrap}
  .header-title{flex:1;min-width:200px}
  .header-title h1{font-size:1.6rem;font-weight:700;letter-spacing:-0.02em}
  .header-title .subtitle{color:rgba(255,255,255,0.4);font-size:0.85rem;margin-top:4px}
  .vis-tag{display:inline-block;background:rgba(16,185,129,0.12);color:#10B981;font-size:0.7rem;font-weight:600;letter-spacing:0.08em;padding:3px 8px;border-radius:4px;text-transform:uppercase;margin-left:10px}

  /* Score circle */
  .score-ring{width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:conic-gradient(${scoreClr} 0deg ${scoreDeg}deg, rgba(255,255,255,0.06) ${scoreDeg}deg 360deg);position:relative}
  .score-ring::before{content:'';position:absolute;inset:8px;border-radius:50%;background:#0a0a0b}
  .score-inner{position:relative;text-align:center;z-index:1}
  .score-num{font-size:2rem;font-weight:800;color:${scoreClr};line-height:1}
  .score-label{font-size:0.6rem;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.4);margin-top:2px}

  /* Summary cards */
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:28px 0}
  .card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:18px 20px}
  .card-value{font-size:1.6rem;font-weight:700;color:#fff}
  .card-label{font-size:0.75rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.06em;margin-top:4px}
  .card-sub{font-size:0.7rem;color:rgba(255,255,255,0.25);margin-top:6px}

  /* Issue severity mini badges in cards */
  .sev-strip{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
  .sev-chip{font-size:0.65rem;padding:2px 7px;border-radius:4px;font-weight:600}
  .sev-high{background:rgba(239,68,68,0.15);color:#EF4444}
  .sev-medium{background:rgba(245,158,11,0.15);color:#F59E0B}
  .sev-low{background:rgba(59,130,246,0.15);color:#3B82F6}
  .sev-info{background:rgba(107,114,128,0.15);color:#9CA3AF}

  /* Sections */
  .section{margin-top:36px}
  .section h2{font-size:1.15rem;font-weight:700;margin-bottom:4px;letter-spacing:-0.01em}
  .section .subtitle{color:rgba(255,255,255,0.35);font-size:0.8rem;margin-bottom:16px}

  /* Tables */
  .data-table{width:100%;border-collapse:collapse;font-size:0.82rem}
  .data-table thead{position:sticky;top:0;z-index:2}
  .data-table th{background:#111114;color:rgba(255,255,255,0.5);font-weight:600;text-align:left;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;cursor:pointer;user-select:none;white-space:nowrap}
  .data-table th:hover{color:rgba(255,255,255,0.7)}
  .data-table th::after{content:'';display:inline-block;margin-left:4px;opacity:0.3}
  .data-table td{padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:middle}
  .data-table tbody tr:hover{background:rgba(255,255,255,0.02)}
  .mono{font-family:"SF Mono",SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;font-size:0.78rem;word-break:break-all}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;border:1px solid rgba(255,255,255,0.06)}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.65rem;font-weight:700;color:#fff;letter-spacing:0.04em}

  /* Thumbnails */
  .thumb-cell{width:50px}
  .thumb{width:44px;height:44px;object-fit:cover;border-radius:4px;border:1px solid rgba(255,255,255,0.06)}

  /* Bar chart */
  .bar-row{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .bar-label{width:140px;text-align:right;font-size:0.78rem;color:rgba(255,255,255,0.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0}
  .bar-track{flex:1;height:22px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden}
  .bar-fill{height:100%;background:linear-gradient(90deg,#10B981,#059669);border-radius:4px;transition:width 0.3s ease;min-width:2px}
  .bar-value{width:36px;font-size:0.78rem;color:rgba(255,255,255,0.5);text-align:right;font-variant-numeric:tabular-nums}

  /* Pie */
  .coverage-grid{display:flex;gap:32px;align-items:center;flex-wrap:wrap}
  .pie-container{width:180px;height:180px;flex-shrink:0}
  .pie{width:100%;height:100%;border-radius:50%;position:relative}
  .pie::before{content:'';position:absolute;inset:30%;border-radius:50%;background:#0a0a0b}
  .coverage-legend{flex:1;min-width:200px}
  .legend-item{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:0.82rem}
  .legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .legend-label{color:rgba(255,255,255,0.6);flex:1}
  .legend-value{color:rgba(255,255,255,0.87);font-variant-numeric:tabular-nums;font-weight:600}

  .empty-note{color:rgba(255,255,255,0.3);font-style:italic;font-size:0.85rem}

  /* Footer */
  .footer{margin-top:48px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.2);font-size:0.72rem;text-align:center}

  /* Responsive */
  @media(max-width:640px){
    .header{flex-direction:column;align-items:flex-start;gap:16px}
    .bar-label{width:90px;font-size:0.7rem}
    .coverage-grid{flex-direction:column;align-items:flex-start}
    .pie-container{width:140px;height:140px}
  }

  /* Print */
  @media print{
    body{background:#fff;color:#111}
    .card{border:1px solid #ddd}
    .data-table th{background:#f5f5f5;color:#333}
    .data-table td{border-bottom-color:#eee}
    .bar-track{background:#eee}
    .bar-fill{background:#10B981}
    .score-ring::before,.pie::before{background:#fff}
    .footer{color:#999}
    .header-title h1,.card-value{color:#111}
  }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="header">
    <div class="header-title">
      <h1>Visual Intelligence System<span class="vis-tag">Audit Report</span></h1>
      <div class="subtitle">Generated ${esc(dateStr)} &middot; ${registry.length} images indexed</div>
    </div>
    <div class="score-ring">
      <div class="score-inner">
        <div class="score-num">${score}</div>
        <div class="score-label">${scoreLabel(score)}</div>
      </div>
    </div>
  </div>

  <!-- Summary cards -->
  <div class="cards">
    <div class="card">
      <div class="card-value">${registry.length}</div>
      <div class="card-label">Total Images</div>
      <div class="card-sub">${Object.keys(categories).length} categories</div>
    </div>
    <div class="card">
      <div class="card-value">${totalSizeKB >= 1024 ? (totalSizeKB / 1024).toFixed(1) + ' MB' : totalSizeKB + ' KB'}</div>
      <div class="card-label">Total Size</div>
      <div class="card-sub">Avg ${Math.round(totalSizeKB / Math.max(registry.length, 1))} KB per image</div>
    </div>
    <div class="card">
      <div class="card-value">${allIssues.length}</div>
      <div class="card-label">Issues</div>
      <div class="sev-strip">
        ${highCount ? `<span class="sev-chip sev-high">${highCount} HIGH</span>` : ''}
        ${medCount ? `<span class="sev-chip sev-medium">${medCount} MED</span>` : ''}
        ${lowCount ? `<span class="sev-chip sev-low">${lowCount} LOW</span>` : ''}
        ${infoCount ? `<span class="sev-chip sev-info">${infoCount} INFO</span>` : ''}
      </div>
    </div>
    <div class="card">
      <div class="card-value" style="color:${scoreClr}">${score}/100</div>
      <div class="card-label">Health Score</div>
      <div class="card-sub">${scoreLabel(score)}</div>
    </div>
  </div>

  <!-- Issue table -->
  <section class="section">
    <h2>Issues</h2>
    <p class="subtitle">${allIssues.length} issue${allIssues.length === 1 ? '' : 's'} detected across ${registry.length} images</p>
    <div class="table-scroll">
      <table class="data-table" id="issueTable">
        <thead>
          <tr>
            <th style="width:80px" onclick="sortTable('issueTable',0)">Severity</th>
            <th style="width:120px" onclick="sortTable('issueTable',1)">Type</th>
            <th onclick="sortTable('issueTable',2)">File</th>
            <th onclick="sortTable('issueTable',3)">Message</th>
          </tr>
        </thead>
        <tbody>${issueRows()}</tbody>
      </table>
    </div>
  </section>

  <!-- Category breakdown -->
  <section class="section">
    <h2>Category Breakdown</h2>
    <p class="subtitle">${sortedCategories.length} categories detected</p>
    <div style="max-width:700px">
      ${categoryBars()}
    </div>
  </section>

  <!-- Oversized images -->
  <section class="section">
    <h2>Oversized Images</h2>
    <p class="subtitle">${oversized.length} image${oversized.length === 1 ? '' : 's'} exceeding ${Math.round((config.maxFileSizeKB || 2000) / 1024)} MB threshold</p>
    <div class="table-scroll">
      ${oversizedTable()}
    </div>
  </section>

  ${coveragePieCSS()}

  <div class="footer">
    VIS &mdash; Visual Intelligence System &middot; Report generated ${esc(timestamp)} &middot; <a href="https://github.com/frankxai/visual-intelligence">github.com/frankxai/visual-intelligence</a>
  </div>
</div>

<script>
// Minimal client-side table sort
function sortTable(tableId, colIdx) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const dir = table.dataset.sortCol === String(colIdx) && table.dataset.sortDir === 'asc' ? 'desc' : 'asc';
  table.dataset.sortCol = colIdx;
  table.dataset.sortDir = dir;
  rows.sort((a, b) => {
    const aText = (a.cells[colIdx]?.textContent || '').trim().toLowerCase();
    const bText = (b.cells[colIdx]?.textContent || '').trim().toLowerCase();
    const cmp = aText.localeCompare(bText, undefined, { numeric: true });
    return dir === 'asc' ? cmp : -cmp;
  });
  for (const row of rows) tbody.appendChild(row);
}
</script>
</body>
</html>
`

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------
const outFile = outputPath ? path.resolve(outputPath) : path.join(ROOT, 'vis-report.html')
fs.writeFileSync(outFile, html, 'utf-8')
console.log(`Report generated: ${outFile}`)
console.log(`  Score: ${score}/100 (${scoreLabel(score)})`)
console.log(`  Images: ${registry.length} | Issues: ${allIssues.length} | Categories: ${sortedCategories.length}`)
