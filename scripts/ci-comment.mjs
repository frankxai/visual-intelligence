#!/usr/bin/env node
/**
 * VIS CI Comment Generator
 *
 * Takes JSON audit output from audit-visual-health.mjs and formats
 * a GitHub PR comment with health score, budget checks, and delta from main.
 *
 * Usage:
 *   node scripts/ci-comment.mjs \
 *     --pr-audit /tmp/audit-pr.json \
 *     --main-audit /tmp/audit-main.json \
 *     --min-score 50 \
 *     --max-total-size-mb 500 \
 *     --max-placeholder-count 0 \
 *     --max-oversized-count 20 \
 *     --min-coverage-percent 30
 *
 * Outputs markdown to stdout. Last line is PASS or FAIL (stripped by workflow).
 */

import fs from 'fs'

// --- Parse CLI args ---
const args = process.argv.slice(2)
function getArg(name, fallback) {
  const idx = args.indexOf(name)
  if (idx === -1 || idx + 1 >= args.length) return fallback
  return args[idx + 1]
}

const prAuditPath = getArg('--pr-audit', '/tmp/audit-pr.json')
const mainAuditPath = getArg('--main-audit', '/tmp/audit-main.json')
const minScore = Number(getArg('--min-score', '50'))
const maxTotalSizeMB = Number(getArg('--max-total-size-mb', '500'))
const maxPlaceholderCount = Number(getArg('--max-placeholder-count', '0'))
const maxOversizedCount = Number(getArg('--max-oversized-count', '20'))
const minCoveragePercent = Number(getArg('--min-coverage-percent', '30'))

// --- Load audit data ---
const prAudit = JSON.parse(fs.readFileSync(prAuditPath, 'utf-8'))
const mainAudit = JSON.parse(fs.readFileSync(mainAuditPath, 'utf-8'))

// --- Compute score (mirrors audit-visual-health.mjs logic) ---
function computeScore(audit) {
  const { high = 0, medium = 0, low = 0 } = audit.summary || {}
  return Math.max(0, 100 - (high * 15) - (medium * 5) - (low * 2))
}

function scoreLabel(score) {
  if (score >= 90) return 'EXCELLENT'
  if (score >= 70) return 'GOOD'
  if (score >= 50) return 'NEEDS ATTENTION'
  return 'CRITICAL'
}

const prScore = computeScore(prAudit)
const mainScore = computeScore(mainAudit)
const scoreDelta = prScore - mainScore

// --- Compute total image size from issues ---
function totalSizeFromIssues(audit) {
  let totalKB = 0
  for (const issue of (audit.issues || [])) {
    if (issue.sizeKB) totalKB += issue.sizeKB
  }
  return totalKB
}

// For total size, we sum oversized + orphaned sizeKB as a proxy.
// A full registry-based total would require the registry itself;
// this gives a directional signal in CI.
const prTotalSizeKB = totalSizeFromIssues(prAudit)
const prTotalSizeMB = Math.round(prTotalSizeKB / 1024)

// --- Extract counts ---
const prHigh = prAudit.summary?.high || 0
const prMedium = prAudit.summary?.medium || 0
const prLow = prAudit.summary?.low || 0
const prInfo = prAudit.summary?.info || 0

const placeholderCount = (prAudit.issues || []).filter(i => i.type === 'placeholder').length
const oversizedCount = (prAudit.issues || []).filter(i => i.type === 'oversized').length
const duplicateCount = (prAudit.issues || []).filter(i => i.type === 'duplicate-hero').length
const orphanedCount = (prAudit.issues || []).filter(i => i.type === 'orphaned').length

// --- Budget checks ---
function check(value, limit, mode = 'max') {
  if (mode === 'min') return value >= limit ? 'pass' : 'warn'
  return value <= limit ? 'pass' : 'warn'
}

const scoreCheck = check(prScore, minScore, 'min')
const placeholderCheck = check(placeholderCount, maxPlaceholderCount)
const oversizedCheck = check(oversizedCount, maxOversizedCount)
const sizeCheck = check(prTotalSizeMB, maxTotalSizeMB)

const icon = (status) => status === 'pass' ? '\u2705' : '\u26a0\ufe0f'

// --- Delta formatting ---
function delta(current, previous) {
  const diff = current - previous
  if (diff === 0) return ''
  return diff > 0 ? ` (+${diff})` : ` (${diff})`
}

// --- Determine pass/fail ---
// Fail if score is below threshold
const passed = prScore >= minScore

// --- Build markdown ---
const lines = []

lines.push('## \ud83d\udd0d Visual Health Report')
lines.push('')
lines.push(`**Score: ${prScore}/100** (${scoreLabel(prScore)})${delta(prScore, mainScore) ? ` \u2014 delta from main: ${scoreDelta > 0 ? '+' : ''}${scoreDelta}` : ''}`)
lines.push('')
lines.push('| Metric | Value | Budget | Status |')
lines.push('|--------|-------|--------|--------|')
lines.push(`| Health Score | ${prScore} | \u2265${minScore} | ${icon(scoreCheck)} |`)
lines.push(`| Placeholders | ${placeholderCount} | ${maxPlaceholderCount} | ${icon(placeholderCheck)} |`)
lines.push(`| Oversized | ${oversizedCount} | \u2264${maxOversizedCount} | ${icon(oversizedCheck)} |`)
lines.push(`| Total Size | ${prTotalSizeMB}MB | \u2264${maxTotalSizeMB}MB | ${icon(sizeCheck)} |`)
lines.push('')

// Issues breakdown
lines.push('### Issues Found')
if (prHigh > 0) {
  const placeholderDesc = placeholderCount > 0 ? `: placeholder images in production` : ''
  lines.push(`- \ud83d\udd34 ${prHigh} HIGH${placeholderDesc}${delta(prHigh, mainAudit.summary?.high || 0)}`)
} else {
  lines.push(`- \ud83d\udd34 0 HIGH`)
}

if (prMedium > 0) {
  const dupDesc = duplicateCount > 0 ? `: duplicate hero references` : ''
  lines.push(`- \ud83d\udfe1 ${prMedium} MEDIUM${dupDesc}${delta(prMedium, mainAudit.summary?.medium || 0)}`)
} else {
  lines.push(`- \ud83d\udfe1 0 MEDIUM`)
}

if (prLow > 0) {
  lines.push(`- \ud83d\udd35 ${prLow} LOW: oversized images${delta(prLow, mainAudit.summary?.low || 0)}`)
} else {
  lines.push(`- \ud83d\udd35 0 LOW`)
}

if (prInfo > 0) {
  lines.push(`- \u2139\ufe0f ${prInfo} INFO: orphaned images${delta(prInfo, mainAudit.summary?.info || 0)}`)
}

lines.push('')

// Failure notice
if (!passed) {
  lines.push(`> **\u274c Score ${prScore} is below the minimum threshold of ${minScore}.** Fix HIGH/MEDIUM issues to pass this check.`)
  lines.push('')
}

lines.push(`*Generated by [VIS](https://github.com/frankxai/visual-intelligence)*`)

// Last line: PASS/FAIL marker (stripped by workflow before posting)
lines.push(passed ? 'PASS' : 'FAIL')

process.stdout.write(lines.join('\n') + '\n')
