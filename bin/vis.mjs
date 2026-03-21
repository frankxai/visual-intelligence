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
        message: `${(img.sizeKB / 1024).toFixed(1)}MB — optimize to <${config.maxFileSizeKB / 1024}MB`,
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

function cmdReport() {
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
    console.log(`\nOversized (>${(config.maxFileSizeKB || 2000) / 1024}MB):`)
    oversized.forEach(e => console.log(`  ${e.path} (${(e.sizeKB / 1024).toFixed(1)}MB)`))
  }
}

// ============================================================
// ROUTER
// ============================================================

const commands = {
  init: cmdInit,
  scan: cmdScan,
  audit: cmdAudit,
  report: cmdReport,
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

  Options:
    --help, -h          Show this help message

  https://github.com/frankxai/visual-intelligence
  `)
} else if (commands[command]) {
  commands[command]()
} else {
  console.error(`Unknown command: ${command}. Run 'vis --help' for usage.`)
  process.exit(1)
}
