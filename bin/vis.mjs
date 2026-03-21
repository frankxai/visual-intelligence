#!/usr/bin/env node
/**
 * VIS — Visual Intelligence System CLI
 *
 * Commands:
 *   vis init          Initialize VIS in current project (creates config + registry)
 *   vis scan          Scan images and rebuild registry
 *   vis scan --diff   Only add new/changed images
 *   vis audit         Run visual health audit
 *   vis audit --json  JSON output for CI/CD
 *   vis report        Print visual health summary
 *   vis council       Run 3-perspective quality review on an image
 *   vis optimize      Optimize oversized images (requires sharp)
 *   vis search        Search registry by tags, mood, category, filename, size
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const command = args[0]
const flags = args.slice(1)

// Resolve project root (look for vis.config.json or package.json)
function findProjectRoot(dir = process.cwd()) {
  if (fs.existsSync(path.join(dir, 'vis.config.json'))) return dir
  if (fs.existsSync(path.join(dir, 'package.json'))) return dir
  const parent = path.dirname(dir)
  if (parent === dir) return process.cwd()
  return findProjectRoot(parent)
}

const ROOT = findProjectRoot()

// Load or create config
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
    placeholderImages: ['blog-hero-aurora.svg', 'placeholder.png'],
  }
}

// Tag detection rules
const TAG_RULES = [
  { pattern: /music|suno|audio|song|track/i, tag: 'music' },
  { pattern: /ai|agent|agentic|llm|claude/i, tag: 'ai' },
  { pattern: /hero/i, tag: 'hero' },
  { pattern: /mascot|avatar/i, tag: 'mascot' },
  { pattern: /nature|forest|garden|bloom/i, tag: 'nature' },
  { pattern: /brand|logo/i, tag: 'brand' },
  { pattern: /diagram|architecture|flow/i, tag: 'technical' },
  { pattern: /infographic|poster/i, tag: 'infographic' },
  { pattern: /screenshot/i, tag: 'screenshot' },
  { pattern: /book|chapter|cover/i, tag: 'book' },
  { pattern: /team/i, tag: 'team' },
  { pattern: /portrait|headshot/i, tag: 'portrait' },
]

function detectTags(filepath) {
  const searchStr = filepath.toLowerCase()
  return [...new Set(TAG_RULES.filter(r => r.pattern.test(searchStr)).map(r => r.tag))]
}

function detectMood(filepath, category) {
  const name = path.basename(filepath).toLowerCase()
  if (name.includes('infographic') || name.includes('diagram')) return 'informational'
  if (name.includes('poster') || name.includes('workflow')) return 'branded'
  if (name.includes('hero') || name.includes('v3-pro')) return 'atmospheric'
  if (category === 'design-lab' || category === 'ai-art') return 'artistic'
  if (category === 'mascot' || category === 'team') return 'branded'
  return 'atmospheric'
}

// ============================================================
// COMMANDS
// ============================================================

function cmdInit() {
  console.log('\n🔍 Initializing Visual Intelligence System...\n')
  const config = loadConfig()

  // Create vis.config.json
  const configPath = path.join(ROOT, 'vis.config.json')
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    console.log('  Created vis.config.json')
  } else {
    console.log('  vis.config.json already exists')
  }

  // Create data directory
  const dataDir = path.join(ROOT, 'data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
    console.log('  Created data/ directory')
  }

  // Create brand DNA template
  const dnaPath = path.join(ROOT, config.brandDnaPath)
  if (!fs.existsSync(dnaPath)) {
    const template = {
      version: '1.0.0',
      brand: 'Your Brand',
      palette: {
        primary: { background: '#0a0a0b' },
        accents: { primary: { hex: '#10B981', usage: 'CTA, success' } },
      },
      imageStandards: {
        heroImages: { aspectRatio: '16:9', minWidth: 1600, maxFileSizeKB: 2000 },
      },
      qualityCouncil: {
        perspectives: [
          { role: 'Brand Guardian', question: 'Does this match brand visual DNA?' },
          { role: 'Conversion Optimizer', question: 'Does this drive user action?' },
          { role: 'Accessibility Auditor', question: 'Is this inclusive and accessible?' },
        ],
      },
    }
    fs.writeFileSync(dnaPath, JSON.stringify(template, null, 2))
    console.log('  Created brand-visual-dna.json template')
  }

  // Run initial scan
  console.log('\n  Running initial scan...')
  cmdScan()
  console.log('\n  VIS initialized. Run `vis audit` to check visual health.')
}

function cmdScan() {
  const config = loadConfig()
  const imagesDir = path.resolve(ROOT, config.imagesDir)
  const registryPath = path.resolve(ROOT, config.registryPath)
  const diffMode = flags.includes('--diff')

  if (!fs.existsSync(imagesDir)) {
    console.error(`Images directory not found: ${imagesDir}`)
    process.exit(1)
  }

  let existingPaths = new Set()
  if (diffMode && fs.existsSync(registryPath)) {
    const existing = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
    existingPaths = new Set(existing.map(e => e.path))
  }

  const entries = []
  function walk(dir, category = '') {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name)
      if (item.isDirectory()) { walk(full, category || item.name); continue }
      const ext = path.extname(item.name).toLowerCase()
      if (!config.imageExtensions.includes(ext)) continue
      if (config.skipSuffixes.some(s => item.name.endsWith(s))) continue

      const rel = '/' + path.relative(path.resolve(ROOT, 'public'), full).replace(/\\/g, '/')
      if (diffMode && existingPaths.has(rel)) continue

      const stats = fs.statSync(full)
      const sizeKB = Math.round(stats.size / 1024)
      const directory = path.basename(path.dirname(full))

      entries.push({
        path: rel,
        directory,
        category: category || directory,
        filename: item.name,
        sizeKB,
        tags: detectTags(`${item.name} ${directory} ${category}`),
        mood: detectMood(rel, category || directory),
        theme: 'dark',
        suitableFor: [],
      })
    }
  }

  walk(imagesDir)
  entries.sort((a, b) => a.category.localeCompare(b.category) || a.filename.localeCompare(b.filename))

  if (diffMode) {
    const existing = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
    const merged = [...existing, ...entries]
    merged.sort((a, b) => a.category.localeCompare(b.category) || a.filename.localeCompare(b.filename))
    fs.writeFileSync(registryPath, JSON.stringify(merged, null, 2))
    console.log(`  Found ${entries.length} new images. Registry: ${merged.length} total.`)
  } else {
    // Ensure data dir exists
    const dir = path.dirname(registryPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(registryPath, JSON.stringify(entries, null, 2))
    console.log(`  Registry rebuilt: ${entries.length} images`)
  }
}

function cmdAudit() {
  const config = loadConfig()
  const registryPath = path.resolve(ROOT, config.registryPath)
  const jsonMode = flags.includes('--json')

  if (!fs.existsSync(registryPath)) {
    console.error('No registry found. Run `vis scan` first.')
    process.exit(1)
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
  const issues = []

  // Check oversized
  for (const img of registry) {
    if (img.sizeKB > config.maxFileSizeKB) {
      issues.push({
        type: 'oversized',
        severity: 'low',
        image: img.path,
        sizeKB: img.sizeKB,
        message: `${(img.sizeKB / 1024).toFixed(1)}MB — optimize to <${Math.round(config.maxFileSizeKB / 1024)}MB`,
      })
    }
  }

  // Placeholder detection is handled by the full audit script
  // This lightweight version focuses on registry-based checks

  const high = issues.filter(i => i.severity === 'high').length
  const med = issues.filter(i => i.severity === 'medium').length
  const low = issues.filter(i => i.severity === 'low').length

  const score = Math.max(0, 100 - (high * 15) - (med * 5) - (low * 2))

  if (jsonMode) {
    console.log(JSON.stringify({ score, issues, registry: { total: registry.length } }, null, 2))
  } else {
    console.log(`\n=== VISUAL HEALTH AUDIT ===`)
    console.log(`\nImages: ${registry.length}`)
    console.log(`Issues: ${issues.length} (HIGH: ${high}, MEDIUM: ${med}, LOW: ${low})`)
    issues.slice(0, 10).forEach(i => console.log(`  [${i.severity.toUpperCase()}] ${i.image}: ${i.message}`))
    if (issues.length > 10) console.log(`  ... and ${issues.length - 10} more`)
    console.log(`\n=== SCORE: ${score}/100 ===`)
  }
}

async function cmdReport() {
  // --html flag: delegate to vis-report-html.mjs
  if (flags.includes('--html')) {
    const { execFileSync } = await import('child_process')
    const reportScript = path.join(__dirname, 'vis-report-html.mjs')
    const childArgs = ['--project', ROOT]
    // Forward --output flag if present
    const outputIdx = flags.indexOf('--output')
    const outputIdxShort = flags.indexOf('-o')
    const oi = outputIdx !== -1 ? outputIdx : outputIdxShort
    if (oi !== -1 && flags[oi + 1]) {
      childArgs.push('--output', flags[oi + 1])
    }
    execFileSync('node', [reportScript, ...childArgs], { stdio: 'inherit', cwd: ROOT })
    return
  }

  const config = loadConfig()
  const registryPath = path.resolve(ROOT, config.registryPath)

  if (!fs.existsSync(registryPath)) {
    console.error('No registry found. Run `vis scan` first.')
    process.exit(1)
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
  const totalSizeKB = registry.reduce((s, e) => s + e.sizeKB, 0)
  const categories = {}
  const moods = {}

  for (const e of registry) {
    categories[e.category] = (categories[e.category] || 0) + 1
    moods[e.mood] = (moods[e.mood] || 0) + 1
  }

  console.log('\n=== VISUAL INTELLIGENCE REPORT ===\n')
  console.log(`Total images: ${registry.length}`)
  console.log(`Total size: ${(totalSizeKB / 1024).toFixed(1)} MB`)
  console.log(`Categories: ${Object.keys(categories).length}`)
  console.log('\nBy category:')
  Object.entries(categories).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`  ${c}: ${n}`))
  console.log('\nBy mood:')
  Object.entries(moods).sort((a, b) => b[1] - a[1]).forEach(([m, n]) => console.log(`  ${m}: ${n}`))

  const oversized = registry.filter(e => e.sizeKB > (config.maxFileSizeKB || 2000))
  if (oversized.length) {
    console.log(`\nOversized (>${Math.round((config.maxFileSizeKB || 2000) / 1024)}MB):`)
    oversized.forEach(e => console.log(`  ${e.path} (${(e.sizeKB / 1024).toFixed(1)}MB)`))
  }
}

function cmdSearch() {
  const config = loadConfig()
  const registryPath = path.resolve(ROOT, config.registryPath)

  if (!fs.existsSync(registryPath)) {
    console.error('No registry found. Run `vis scan` first.')
    process.exit(1)
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))

  // Parse flags
  const tagFilters = []
  const moodFilters = []
  const themeFilters = []
  const suitableFilters = []
  const categoryFilters = []
  const positionalWords = []
  let minSize = null
  let maxSize = null

  for (let i = 0; i < flags.length; i++) {
    const f = flags[i]
    if (f === '--tag' && flags[i + 1]) { tagFilters.push(flags[++i].toLowerCase()); continue }
    if (f === '--mood' && flags[i + 1]) { moodFilters.push(flags[++i].toLowerCase()); continue }
    if (f === '--theme' && flags[i + 1]) { themeFilters.push(flags[++i].toLowerCase()); continue }
    if (f === '--suitable' && flags[i + 1]) { suitableFilters.push(flags[++i].toLowerCase()); continue }
    if (f === '--category' && flags[i + 1]) { categoryFilters.push(flags[++i].toLowerCase()); continue }
    if (f === '--min-size' && flags[i + 1]) { minSize = parseInt(flags[++i], 10); continue }
    if (f === '--max-size' && flags[i + 1]) { maxSize = parseInt(flags[++i], 10); continue }
    if (!f.startsWith('--')) { positionalWords.push(f.toLowerCase()) }
  }

  if (!positionalWords.length && !tagFilters.length && !moodFilters.length &&
      !themeFilters.length && !suitableFilters.length && !categoryFilters.length &&
      minSize === null && maxSize === null) {
    console.error('Usage: vis search <words...> [--tag X] [--mood X] [--theme X] [--suitable X] [--category X] [--min-size KB] [--max-size KB]')
    process.exit(1)
  }

  const results = registry.filter(img => {
    // Positional words: each word must match at least one of tags, mood, category, or filename
    for (const word of positionalWords) {
      const inTags = (img.tags || []).some(t => t.toLowerCase().includes(word))
      const inMood = (img.mood || '').toLowerCase().includes(word)
      const inCategory = (img.category || '').toLowerCase().includes(word)
      const inFilename = (img.filename || '').toLowerCase().includes(word)
      if (!inTags && !inMood && !inCategory && !inFilename) return false
    }

    // Named filters: each specified value must match
    for (const t of tagFilters) {
      if (!(img.tags || []).some(tag => tag.toLowerCase().includes(t))) return false
    }
    for (const m of moodFilters) {
      if (!(img.mood || '').toLowerCase().includes(m)) return false
    }
    for (const th of themeFilters) {
      if (!(img.theme || '').toLowerCase().includes(th)) return false
    }
    for (const s of suitableFilters) {
      if (!(img.suitableFor || []).some(sf => sf.toLowerCase().includes(s))) return false
    }
    for (const c of categoryFilters) {
      if (!(img.category || '').toLowerCase().includes(c)) return false
    }

    // Size filters
    if (minSize !== null && img.sizeKB < minSize) return false
    if (maxSize !== null && img.sizeKB > maxSize) return false

    return true
  })

  if (results.length === 0) {
    console.log('\nNo images matched your query.')
  } else {
    console.log(`\n=== SEARCH RESULTS: ${results.length} image${results.length === 1 ? '' : 's'} ===\n`)
    for (const img of results) {
      console.log(`  ${img.path}`)
      console.log(`    category: ${img.category}  |  tags: [${(img.tags || []).join(', ')}]  |  mood: ${img.mood}  |  ${img.sizeKB} KB`)
    }
  }
  console.log()
}

async function cmdOptimize() {
  const config = loadConfig()
  const registryPath = path.resolve(ROOT, config.registryPath)
  const dryRun = !flags.includes('--execute')
  const skipPrompt = flags.includes('--yes')
  const maxSizeKB = config.maxFileSizeKB || 2000

  if (!fs.existsSync(registryPath)) {
    console.error('No registry found. Run `vis scan` first.')
    process.exit(1)
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
  const oversized = registry.filter(img => img.sizeKB > maxSizeKB)

  console.log('\n=== VIS OPTIMIZE ===\n')

  if (oversized.length === 0) {
    console.log(`No oversized images found (threshold: ${maxSizeKB}KB / ${(maxSizeKB / 1024).toFixed(1)}MB).`)
    console.log('All images are within limits.\n')
    return
  }

  // Attempt to load sharp (only needed for --execute)
  let sharp = null
  if (!dryRun) {
    try {
      sharp = (await import('sharp')).default
    } catch {
      console.log('sharp not installed. Run: npm install sharp')
      console.log('Showing dry-run analysis instead...\n')
    }
  }

  const effectiveDryRun = dryRun || (!dryRun && !sharp)

  if (effectiveDryRun) {
    console.log('Mode: DRY RUN (use --execute to apply)\n')
  } else {
    console.log('Mode: EXECUTE\n')
  }

  // WebP at quality 85 typically achieves ~80% reduction on PNGs, ~30-50% on JPEGs
  const estimateSavings = (img) => {
    const ext = path.extname(img.filename).toLowerCase()
    const ratio = ext === '.png' ? 0.20 : ext === '.jpeg' || ext === '.jpg' ? 0.55 : 0.40
    const estimatedKB = Math.round(img.sizeKB * ratio)
    return { estimatedKB, savingsKB: img.sizeKB - estimatedKB }
  }

  let totalCurrentKB = 0
  let totalEstimatedKB = 0
  const totalRegistryKB = registry.reduce((s, e) => s + e.sizeKB, 0)

  console.log(`Oversized images (${oversized.length}):\n`)

  for (const img of oversized) {
    const { estimatedKB, savingsKB } = estimateSavings(img)
    totalCurrentKB += img.sizeKB
    totalEstimatedKB += estimatedKB

    const currentMB = (img.sizeKB / 1024).toFixed(1)
    const estMB = (estimatedKB / 1024).toFixed(1)
    const saveMB = (savingsKB / 1024).toFixed(1)
    console.log(`  ${img.path}  ${currentMB}MB -> ~${estMB}MB (WebP q85) -- save ${saveMB}MB`)
  }

  const totalSavingsMB = ((totalCurrentKB - totalEstimatedKB) / 1024).toFixed(1)
  const totalRegistryMB = (totalRegistryKB / 1024).toFixed(1)
  const pct = Math.round(((totalCurrentKB - totalEstimatedKB) / totalRegistryKB) * 100)

  console.log(`\nEstimated total savings: ${totalSavingsMB}MB (${pct}% of ${totalRegistryMB}MB)\n`)

  if (effectiveDryRun) {
    console.log('To apply: vis optimize --execute\n')
    return
  }

  // --- EXECUTE MODE ---

  // Safety prompt
  if (!skipPrompt) {
    const readline = await import('readline')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise(resolve => {
      rl.question('This will modify images in place. Original files will be backed up to public/images/_originals/. Continue? (use --yes to skip) (y/N) ', resolve)
    })
    rl.close()
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('Aborted.\n')
      return
    }
  }

  // Create backup directory
  const backupDir = path.resolve(ROOT, 'public/images/_originals')
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  let optimized = 0
  let errors = 0
  let savedKB = 0

  for (const img of oversized) {
    const absPath = path.resolve(ROOT, 'public', img.path.replace(/^\//, ''))
    if (!fs.existsSync(absPath)) {
      console.log(`  SKIP (not found): ${img.path}`)
      errors++
      continue
    }

    // Backup original preserving relative path structure
    const relFromImages = path.relative(path.resolve(ROOT, 'public/images'), absPath)
    const backupPath = path.join(backupDir, relFromImages)
    const backupSubdir = path.dirname(backupPath)
    if (!fs.existsSync(backupSubdir)) {
      fs.mkdirSync(backupSubdir, { recursive: true })
    }
    fs.copyFileSync(absPath, backupPath)

    // Convert to WebP
    const webpPath = absPath.replace(/\.(png|jpe?g)$/i, '.webp')
    try {
      await sharp(absPath)
        .webp({ quality: 85 })
        .toFile(webpPath)

      const newStats = fs.statSync(webpPath)
      const newSizeKB = Math.round(newStats.size / 1024)
      const saved = img.sizeKB - newSizeKB

      // Remove original if webp is a different file
      if (webpPath !== absPath) {
        fs.unlinkSync(absPath)
      }

      savedKB += saved
      optimized++
      console.log(`  OK: ${img.path} -> .webp (${(img.sizeKB / 1024).toFixed(1)}MB -> ${(newSizeKB / 1024).toFixed(1)}MB)`)
    } catch (err) {
      console.log(`  ERROR: ${img.path} - ${err.message}`)
      errors++
    }
  }

  console.log(`\nOptimized: ${optimized}  Errors: ${errors}  Saved: ${(savedKB / 1024).toFixed(1)}MB`)
  console.log('Originals backed up to: public/images/_originals/\n')

  // Re-run scan to update registry
  console.log('Re-scanning registry...')
  cmdScan()
  console.log()
}

// ============================================================
// ROUTER
// ============================================================

const commands = {
  init: cmdInit,
  scan: cmdScan,
  audit: cmdAudit,
  report: cmdReport,
  search: cmdSearch,
  optimize: cmdOptimize,
}

if (!command || command === '--help' || command === '-h') {
  console.log(`
  VIS — Visual Intelligence System v0.1.0

  Commands:
    vis init            Initialize VIS in current project
    vis scan            Scan and rebuild image registry
    vis scan --diff     Only add new images
    vis audit           Run visual health audit
    vis audit --json    JSON output for CI/CD
    vis report          Print visual health summary
    vis report --html   Generate self-contained HTML audit report
    vis search <query>  Search registry by tags, mood, category, filename
    vis optimize        Analyze oversized images (dry-run by default)
    vis optimize --execute  Convert oversized images to WebP (backs up originals)

  Search flags:
    --tag <tag>         Filter by tag
    --mood <mood>       Filter by mood
    --theme <theme>     Filter by theme
    --suitable <use>    Filter by suitability
    --category <cat>    Filter by category
    --min-size <KB>     Minimum file size in KB
    --max-size <KB>     Maximum file size in KB

  Options:
    --help, -h          Show this help message

  https://github.com/frankxai/visual-intelligence
  `)
} else if (commands[command]) {
  Promise.resolve(commands[command]()).catch(err => {
    console.error(err.message || err)
    process.exit(1)
  })
} else {
  console.error(`Unknown command: ${command}. Run 'vis --help' for usage.`)
  process.exit(1)
}
