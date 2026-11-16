import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  LIFECYCLE_STAGES,
  evaluateQaScore,
  advanceLifecycleStage,
  buildProvenanceSidecar,
  appendCreditLedgerEntry,
  sha256Buffer,
} from '../core/vis-lifecycle.mjs'
import { buildR2DamPlan } from '../core/vis-r2-dam-plan.mjs'

test('evaluateQaScore computes exact totals and thresholds', () => {
  const pass = evaluateQaScore({
    hierarchy: 5,
    brandFit: 5,
    craft: 4,
    accessibility: 4,
    provenanceAndArtifacts: 5,
    surfaceUsefulness: 4,
  })
  assert.equal(pass.total, 27)
  assert.equal(pass.decision, 'pass')

  const iterate = evaluateQaScore({
    hierarchy: 4,
    brandFit: 4,
    craft: 4,
    accessibility: 3,
    provenanceAndArtifacts: 4,
    surfaceUsefulness: 4,
  })
  assert.equal(iterate.total, 23)
  assert.equal(iterate.decision, 'iterate')

  const reject = evaluateQaScore({ hierarchy: 2, brandFit: 2 })
  assert.equal(reject.total, 4)
  assert.equal(reject.decision, 'reject')
})

test('advanceLifecycleStage enforces guards across all 6 stages', () => {
  assert.deepEqual(LIFECYCLE_STAGES, [
    'planned',
    'created',
    'edited',
    'qa_scored',
    'ready_for_publish',
    'placed',
  ])
  let asset = advanceLifecycleStage(
    { assetId: 'sis-hero-01', brand: 'sis' },
    'planned',
    { note: 'Brief locked' }
  )
  const hash = sha256Buffer(Buffer.from('starlight-test-bytes'))
  asset = advanceLifecycleStage(asset, 'created', {
    rawPath: 'sis/raw/hero.jpg',
    sha256: hash,
    provider: 'google-flow',
  })
  asset = advanceLifecycleStage(asset, 'edited', {
    derivatives: ['sis/edited/hero-og-1200x630.webp'],
  })
  assert.throws(
    () =>
      advanceLifecycleStage(asset, 'qa_scored', {
        inspected: false,
        dimensions: { hierarchy: 5 },
      }),
    /direct visual inspection/
  )
  asset = advanceLifecycleStage(asset, 'qa_scored', {
    inspected: true,
    dimensions: {
      hierarchy: 5,
      brandFit: 5,
      craft: 5,
      accessibility: 4,
      provenanceAndArtifacts: 5,
      surfaceUsefulness: 4,
    },
  })
  assert.throws(
    () => advanceLifecycleStage(asset, 'ready_for_publish', { rightsStatus: 'unknown' }),
    /blocked by rightsStatus/
  )
  asset = advanceLifecycleStage(asset, 'ready_for_publish', {
    rightsStatus: 'generated-owned',
  })
  asset = advanceLifecycleStage(asset, 'placed', {
    domain: 'starlightintelligence.ai',
    route: '/',
    component: 'HorizonHero',
  })
  assert.equal(asset.stage, 'placed')
  assert.equal(asset.usedIn.length, 1)
  assert.throws(() => advanceLifecycleStage(asset, 'planned'), /Cannot regress/)

  const uninitialized = { assetId: 'skip-test', brand: 'sis' }
  assert.throws(
    () => advanceLifecycleStage(uninitialized, 'qa_scored', { inspected: true, dimensions: { hierarchy: 5 } }),
    /Cannot skip lifecycle stages/
  )
  const planned = advanceLifecycleStage(uninitialized, 'planned', { note: 'Brief' })
  assert.throws(
    () => advanceLifecycleStage(planned, 'placed', { domain: 'starlightintelligence.ai', route: '/' }),
    /Cannot skip lifecycle stages/
  )
})

test('appendCreditLedgerEntry tracks Google AI Ultra spend and blocks over-cap spend', () => {
  let ledger = {
    tier: 'Google AI Ultra',
    poolIncludedCredits: 10000,
    hardCapCredits: 2500,
    totalSpentCredits: 0,
    entries: [],
  }
  ledger = appendCreditLedgerEntry(ledger, { assetId: 'clip-1', creditsDelta: 15 })
  ledger = appendCreditLedgerEntry(ledger, { assetId: 'clip-2', creditsDelta: 200 })
  assert.equal(ledger.totalSpentCredits, 215)
  assert.equal(ledger.remainingBudgetUnderCap, 2285)
  assert.throws(
    () => appendCreditLedgerEntry(ledger, { assetId: 'clip-3', creditsDelta: 2400 }),
    /hard cap exceeded/
  )
})

test('buildProvenanceSidecar and buildR2DamPlan generate valid R2 keys and skip low-QA assets', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-life-'))
  try {
    const filePath = path.join(tmpDir, 'master.png')
    fs.writeFileSync(filePath, 'pixel-fixture')
    const sidecar = buildProvenanceSidecar({
      assetId: 'arcanea-01',
      brand: 'arcanea',
      provider: 'google-flow',
      model: 'omni-1.2-flash',
      prompt: 'Solar lion guardian cresting obsidian spire',
      filePath,
      creditsConsumed: 15,
      flowProjectName: 'Arcanea | Guardians',
      targetUrls: ['https://arcanea.ai/'],
    })
    assert.equal(sidecar.schemaVersion, 'vis.provenance.v3')
    assert.equal(sidecar.googleFlow.creditsConsumed, 15)

    const plan = buildR2DamPlan([
      {
        assetId: 'arcanea-01',
        brand: 'arcanea',
        sha256: sidecar.sha256,
        rawPath: filePath,
        rightsStatus: 'generated-owned',
        qa: { total: 28, decision: 'pass' },
        derivatives: ['arcanea-01-og.webp'],
      },
      {
        assetId: 'arcanea-02',
        brand: 'arcanea',
        sha256: sidecar.sha256,
        rightsStatus: 'generated-owned',
        qa: { total: 21, decision: 'reject' },
      },
    ])
    assert.equal(plan.readyCount, 1)
    assert.equal(plan.skippedCount, 1)
    assert.match(plan.uploadManifest[0].r2.masterKey, /^masters\/[a-f0-9]{2}\/[a-f0-9]{64}$/)
    assert.match(plan.uploadManifest[0].r2.previewKey, /^renditions\/[a-f0-9]{2}\/[a-f0-9]{64}\.preview\.webp$/)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
