import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const LIFECYCLE_STAGES = [
  'planned',
  'created',
  'edited',
  'qa_scored',
  'ready_for_publish',
  'placed',
]

export const QA_PASS_THRESHOLD = 26
export const QA_ITERATE_THRESHOLD = 22

export const SUPPORTED_PROVIDERS = new Set([
  'antigravity-native',
  'google-flow',
  'higgsfield-approved',
  'deterministic-svg',
  'figma-export',
  'human-capture',
])

export function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath))
}

/**
 * Computes a deterministic 30-point visual QA score across the 6 rubric axes
 * from `design-agent-standards/OUTCOMES.md` (5 points each, max 30).
 */
export function evaluateQaScore(dimensions = {}) {
  const keys = [
    'hierarchy',
    'brandFit',
    'craft',
    'accessibility',
    'provenanceAndArtifacts',
    'surfaceUsefulness',
  ]
  const breakdown = {}
  let total = 0
  for (const key of keys) {
    const raw = Number(dimensions[key] ?? 0)
    const clamped = Math.max(0, Math.min(5, Math.round(raw)))
    breakdown[key] = clamped
    total += clamped
  }
  const decision =
    total >= QA_PASS_THRESHOLD
      ? 'pass'
      : total >= QA_ITERATE_THRESHOLD
        ? 'iterate'
        : 'reject'
  return { total, max: 30, decision, breakdown }
}

/**
 * Advances an asset lifecycle record through the 6-stage state machine with guards:
 * planned -> created -> edited -> qa_scored -> ready_for_publish -> placed
 */
export function advanceLifecycleStage(asset, targetStage, evidence = {}) {
  if (!LIFECYCLE_STAGES.includes(targetStage)) {
    throw new Error(`Unknown lifecycle stage: ${targetStage}`)
  }
  if (asset.stage && !LIFECYCLE_STAGES.includes(asset.stage)) {
    throw new Error(`Invalid current lifecycle stage: ${asset.stage}`)
  }
  const currentIndex = asset.stage ? LIFECYCLE_STAGES.indexOf(asset.stage) : -1
  const targetIndex = LIFECYCLE_STAGES.indexOf(targetStage)
  if (targetIndex < currentIndex) {
    throw new Error(`Cannot regress lifecycle stage from ${asset.stage} to ${targetStage}`)
  }
  if (targetIndex > currentIndex + 1) {
    const requiredPrev = LIFECYCLE_STAGES[targetIndex - 1]
    throw new Error(
      `Cannot skip lifecycle stages (${asset.stage || 'uninitialized'} -> ${targetStage}); must pass through '${requiredPrev}' first`
    )
  }

  const next = {
    ...asset,
    stage: targetStage,
    history: [...(asset.history || [])],
    usedIn: [...(asset.usedIn || [])],
  }

  if (targetStage === 'created') {
    if (!evidence.rawPath || !evidence.sha256) {
      throw new Error('created stage requires rawPath and sha256')
    }
    if (evidence.provider && !SUPPORTED_PROVIDERS.has(evidence.provider)) {
      throw new Error(`Unsupported generation provider: ${evidence.provider}`)
    }
    next.rawPath = evidence.rawPath
    next.sha256 = evidence.sha256
    next.provider = evidence.provider || next.provider || 'antigravity-native'
  }

  if (targetStage === 'edited') {
    if (!Array.isArray(evidence.derivatives) || evidence.derivatives.length === 0) {
      throw new Error('edited stage requires at least one derivative rendition')
    }
    next.derivatives = evidence.derivatives
  }

  if (targetStage === 'qa_scored') {
    const qa = evaluateQaScore(evidence.dimensions || asset.qa?.breakdown)
    next.qa = {
      ...qa,
      inspected: Boolean(evidence.inspected),
      inspector: evidence.inspector || 'visual-qa-gate',
      notes: evidence.notes || '',
      scoredAt: evidence.scoredAt || new Date().toISOString(),
    }
    if (!next.qa.inspected) {
      throw new Error('qa_scored stage requires direct visual inspection (inspected: true)')
    }
  }

  if (targetStage === 'ready_for_publish') {
    if (!next.qa || next.qa.decision !== 'pass' || next.qa.total < QA_PASS_THRESHOLD) {
      throw new Error(`ready_for_publish requires QA pass >= ${QA_PASS_THRESHOLD}/30`)
    }
    if (!evidence.rightsStatus || evidence.rightsStatus === 'unknown' || evidence.rightsStatus === 'blocked') {
      throw new Error(`ready_for_publish blocked by rightsStatus=${evidence.rightsStatus}`)
    }
    next.rightsStatus = evidence.rightsStatus
    next.approvalStatus = evidence.approvalStatus || 'staged-for-approval'
    next.r2 = evidence.r2 || next.r2 || null
  }

  if (targetStage === 'placed') {
    if (!evidence.domain || !evidence.route) {
      throw new Error('placed stage requires domain and route placement')
    }
    next.usedIn.push({
      domain: evidence.domain,
      route: evidence.route,
      component: evidence.component || 'hero',
      channel: evidence.channel || 'website',
      commitOrPostId: evidence.commitOrPostId || 'staged',
      placedAt: evidence.placedAt || new Date().toISOString(),
    })
  }

  next.history.push({
    stage: targetStage,
    at: new Date().toISOString(),
    note: evidence.note || `Transitioned to ${targetStage}`,
  })
  next.updatedAt = new Date().toISOString()
  return next
}

/**
 * Builds a schema-consistent `.vis.provenance.json` sidecar for native or Google Flow assets.
 */
export function buildProvenanceSidecar({
  assetId,
  brand,
  provider,
  model,
  prompt,
  negativePrompt = '',
  ratio = '16:9',
  filePath,
  sha256,
  flowProjectName = null,
  flowSpaceUrl = null,
  ingredientsUsed = [],
  creditsConsumed = 0,
  driveMasterFileId = null,
  qaScore = null,
  lifecycleStage = 'created',
  targetUrls = [],
}) {
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported provenance provider: ${provider}`)
  }
  const promptHash = crypto.createHash('sha256').update(String(prompt || '')).digest('hex')
  const computedSha = sha256 || (filePath && fs.existsSync(filePath) ? sha256File(filePath) : null)
  return {
    schemaVersion: 'vis.provenance.v3',
    assetId,
    brand,
    provider,
    model,
    ratio,
    prompt,
    promptHash,
    negativePrompt,
    sha256: computedSha,
    fileName: filePath ? path.basename(filePath) : null,
    lifecycleStage,
    qaScore,
    googleFlow: provider === 'google-flow'
      ? {
          projectName: flowProjectName,
          spaceUrl: flowSpaceUrl,
          ingredientsUsed,
          creditsConsumed: Number(creditsConsumed || 0),
        }
      : null,
    driveMasterFileId,
    targetUrls,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Enforces Doctrine 0 credit ceiling tracking across a Google Flow session.
 */
export function appendCreditLedgerEntry(ledger, entry) {
  const maxCap = Number(ledger?.hardCapCredits ?? 2500)
  const spentBefore = Number(ledger?.totalSpentCredits ?? 0)
  const delta = Number(entry?.creditsDelta ?? 0)
  if (delta < 0) throw new Error('creditsDelta cannot be negative')
  if (spentBefore + delta > maxCap) {
    throw new Error(`Credit hard cap exceeded: ${spentBefore + delta} > ${maxCap}`)
  }
  const nextEntries = [
    ...(ledger?.entries || []),
    {
      ...entry,
      creditsDelta: delta,
      recordedAt: entry.recordedAt || new Date().toISOString(),
    },
  ]
  return {
    schemaVersion: 'vis.flow.credit-ledger.v1',
    tier: ledger?.tier || 'Google AI Ultra',
    poolIncludedCredits: Number(ledger?.poolIncludedCredits ?? 10000),
    hardCapCredits: maxCap,
    totalSpentCredits: spentBefore + delta,
    remainingBudgetUnderCap: maxCap - (spentBefore + delta),
    entries: nextEntries,
  }
}
