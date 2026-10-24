import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'

function createTempJson(data) {
  const file = path.join(os.tmpdir(), `audit-${Date.now()}-${Math.random()}.json`)
  fs.writeFileSync(file, JSON.stringify(data), 'utf8')
  return file
}

const passingAudit = {
  summary: { high: 0, medium: 1, low: 2, info: 0 },
  issues: [
    { type: 'oversized', sizeKB: 2048 },
    { type: 'oversized', sizeKB: 3072 }
  ]
}

const failingAudit = {
  summary: { high: 4, medium: 2, low: 0, info: 0 }, // 100 - (4*15) - (2*5) = 30
  issues: [
    { type: 'placeholder' },
    { type: 'placeholder' }
  ]
}

const emptyAudit = { summary: {}, issues: [] }

test('passing audit prints PASS and correctly displays budget icons', () => {
  const prAudit = createTempJson(passingAudit)
  const mainAudit = createTempJson(emptyAudit)

  try {
    const stdout = execSync(`node scripts/ci-comment.mjs --pr-audit ${prAudit} --main-audit ${mainAudit} --min-score 50 --max-total-size-mb 10`, { encoding: 'utf8' })
    const lines = stdout.trim().split('\n')
    const lastLine = lines[lines.length - 1]
    assert.equal(lastLine, 'PASS')

    // Score is 100 - 5(medium) - 4(low) = 91
    assert.match(stdout, /Score: 91\/100/)
    assert.match(stdout, /Health Score \| 91 \| \u226550 \| ✅/)
    assert.match(stdout, /Total Size \| 5MB \| \u226410MB \| ✅/)
  } finally {
    fs.unlinkSync(prAudit)
    fs.unlinkSync(mainAudit)
  }
})

test('failing audit due to low score prints FAIL and shows warning icon for placeholders', () => {
  const prAudit = createTempJson(failingAudit)
  const mainAudit = createTempJson(emptyAudit)

  try {
    const stdout = execSync(`node scripts/ci-comment.mjs --pr-audit ${prAudit} --main-audit ${mainAudit} --min-score 50 --max-placeholder-count 0`, { encoding: 'utf8' })
    const lines = stdout.trim().split('\n')
    const lastLine = lines[lines.length - 1]
    assert.equal(lastLine, 'FAIL')

    // Score is 100 - (4*15) - (2*5) = 30
    assert.match(stdout, /Score: 30\/100/)
    assert.match(stdout, /Health Score \| 30 \| \u226550 \| ⚠️/)
    assert.match(stdout, /Placeholders \| 2 \| 0 \| ⚠️/)
    assert.match(stdout, /Score 30 is below the minimum threshold of 50/)
  } finally {
    fs.unlinkSync(prAudit)
    fs.unlinkSync(mainAudit)
  }
})

test('handles delta from main correctly', () => {
  const prAudit = createTempJson(passingAudit)
  const mainAudit = createTempJson(failingAudit)

  try {
    const stdout = execSync(`node scripts/ci-comment.mjs --pr-audit ${prAudit} --main-audit ${mainAudit}`, { encoding: 'utf8' })

    // PR score 91, Main score 30 => Delta +61
    assert.match(stdout, /delta from main: \+61/)
    // MEDIUM PR:1 Main:2 => Delta -1
    assert.match(stdout, /\(-1\)/)
  } finally {
    fs.unlinkSync(prAudit)
    fs.unlinkSync(mainAudit)
  }
})
