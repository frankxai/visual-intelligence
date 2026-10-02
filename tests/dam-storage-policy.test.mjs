import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'
import { createSchema } from '../core/vis-core.mjs'
import {
  buildR2OriginalKey,
  buildR2RenditionKey,
  buildVercelBlobKey,
  classifyDamSource,
  inferDamBrand,
  inferDamRole,
  loadDamStoragePolicy,
  planDamRollout,
  validateDamStoragePolicy,
} from '../core/dam-storage-policy.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const policy = loadDamStoragePolicy(path.join(repoRoot, 'config', 'dam-storage-policy.json'))

test('policy requires private EU R2 buckets and disables r2.dev delivery', () => {
  assert.equal(validateDamStoragePolicy(policy), policy)
  assert.equal(policy.region, 'EU')
  assert.equal(policy.storageClass, 'Standard')
  assert.equal(policy.providers.r2Originals.publicAccess, false)
  assert.equal(policy.providers.r2Workflow.publicAccess, false)
  assert.equal(policy.providers.r2Renditions.r2DevAllowed, false)
})

test('content-addressed keys are deterministic and include immutable version identity', () => {
  const asset = sampleAsset()
  const original = buildR2OriginalKey(asset, 'arcanea', 'logo')
  const rendition = buildR2RenditionKey(asset, 'arcanea', 'logo')
  const blob = buildVercelBlobKey(asset, 'arcanea', 'logo', { key: 'arcanea-ai-app' })

  assert.match(original, /^v1\/arcanea\/logo\/aa\/a{64}\/source\.png$/)
  assert.match(rendition, new RegExp(`/ver_${'b'.repeat(32)}/logo/${'a'.repeat(64)}\\.png$`))
  assert.match(blob, /v1\/arcanea\/arcanea-ai-app\//)
  assert.match(blob, new RegExp(`/ver_${'b'.repeat(32)}/`))
  assert.equal(buildR2OriginalKey(asset, 'arcanea', 'logo'), original)
  assert.equal(buildR2OriginalKey({ ...asset, relative_path: 'renamed/Anything Else.png' }, 'arcanea', 'logo'), original)
})

test('brand inference never silently defaults an unknown asset to FrankX', () => {
  assert.equal(inferDamBrand({ title: 'unrelated-photo', tags_json: '[]' }, policy), 'unclassified')
  assert.equal(inferDamBrand({ title: 'analysis-final.png', tags_json: '[]' }, policy), 'unclassified')
  assert.equal(inferDamBrand({ title: 'basis-logo.png', tags_json: '[]' }, policy), 'unclassified')
  assert.equal(inferDamBrand({ title: 'Arcanea guardian logo', tags_json: '[]' }, policy), 'arcanea')
  assert.equal(inferDamRole({ title: 'best ai logo maker hero', media_type: 'image' }), 'hero')
  assert.equal(classifyDamSource({ relative_path: 'private/chrome-profile/extension/logo.png' }, policy), 'private-local')
})

test('planner routes reviewed Arcanea app logo to Blob and keeps its master private in R2', () => {
  const db = createTestDatabase()
  try {
    insertAsset(db, {
      assetId: `asset_${'1'.repeat(24)}`,
      versionId: `ver_${'2'.repeat(32)}`,
      sha256: '3'.repeat(64),
      title: 'Arcanea logo',
      relativePath: 'public/images/brand/arcanea-logo.png',
      repo: 'arcanea-ai-app',
      byteSize: 120000,
      rights: 'generated-owned',
      approval: 'approved',
      tags: ['arcanea', 'logo'],
    })
    addProvenance(db, `asset_${'1'.repeat(24)}`, `ver_${'2'.repeat(32)}`)
    addUsage(db, `asset_${'1'.repeat(24)}`, 'C:/Users/frank/starlight/repos/arcanea-ai-app/apps/web/app/page.tsx')
    addPublication(db, `asset_${'1'.repeat(24)}`)
    addLegacyResolver(db, `asset_${'1'.repeat(24)}`, `ver_${'2'.repeat(32)}`)
    addPremiumEval(db, `asset_${'1'.repeat(24)}`, `ver_${'2'.repeat(32)}`, '3'.repeat(64), 28)

    const plan = planDamRollout(db, policy, { now: '2026-08-27T12:00:00.000Z' })
    assert.equal(plan.items.length, 1)
    assert.equal(plan.items[0].master.action, 'copy-private-master')
    assert.equal(plan.items[0].master.bucket, 'starlight-dam-originals-eu')
    assert.equal(plan.items[0].delivery.action, 'deliver-app-local')
    assert.equal(plan.items[0].delivery.provider, 'vercel-blob')
    assert.equal(plan.items[0].delivery.application, 'arcanea-ai-app')
    assert.equal(plan.summary.public_delivery_ready, 1)

    db.prepare(`
      INSERT INTO eval_record (
        eval_id, asset_id, evaluator, score, rubric, verdict, notes, metadata_json, created_at
      ) VALUES ('eval_rejected_newer', ?, 'maker-agent', 29, 'Premium asset 30 point gate', 'iterate', 'Newer review rejected shipment', ?, '2026-08-27T10:03:30.000Z')
    `).run(
      `asset_${'1'.repeat(24)}`,
      JSON.stringify({
        maker_id: 'maker-agent',
        reviewer_id: 'maker-agent',
        reviewed_at: '2026-08-27T10:03:30.000Z',
        review_artifact_sha256: 'e'.repeat(64),
        version_id: `ver_${'2'.repeat(32)}`,
        sha256: '3'.repeat(64),
        inspected_variants: ['desktop'],
      }),
    )
    const rejectedPlan = planDamRollout(db, policy)
    assert.equal(rejectedPlan.items[0].delivery.status, 'blocked')
    assert.ok(rejectedPlan.items[0].delivery.blockers.includes('maker and quality reviewer must differ'))
    assert.ok(rejectedPlan.items[0].delivery.blockers.includes('premium asset score must be at least 26/30'))

    db.prepare(`
      INSERT INTO storage_object (
        storage_object_id, asset_id, version_id, provider, bucket, key, url,
        checksum, status, metadata_json, created_at
      ) VALUES (?, ?, ?, 'cloudflare-r2', 'starlight-dam-originals-eu', 'existing-key', NULL, ?, 'synced', '{}', ?)
    `).run(
      'storage_existing_master',
      `asset_${'1'.repeat(24)}`,
      `ver_${'2'.repeat(32)}`,
      '3'.repeat(64),
      '2026-08-27T10:04:00.000Z',
    )
    const duplicatePlan = planDamRollout(db, policy)
    assert.equal(duplicatePlan.items[0].master.action, 'already-synced')
    assert.equal(duplicatePlan.items[0].master.status, 'no-op')
  } finally {
    db.close()
  }
})

test('planner routes large reviewed media to shared R2 renditions', () => {
  const db = createTestDatabase()
  try {
    insertAsset(db, {
      assetId: `asset_${'4'.repeat(24)}`,
      versionId: `ver_${'5'.repeat(32)}`,
      sha256: '6'.repeat(64),
      title: 'Arcanea social launch video',
      relativePath: 'public/media/arcanea-launch.mp4',
      repo: 'arcanea-ai-app',
      byteSize: 7000000,
      mediaType: 'video',
      extension: '.mp4',
      mimeType: 'video/mp4',
      rights: 'owned',
      approval: 'approved',
      tags: ['arcanea', 'social'],
    })
    addProvenance(db, `asset_${'4'.repeat(24)}`, `ver_${'5'.repeat(32)}`)
    addUsage(db, `asset_${'4'.repeat(24)}`, 'C:/Users/frank/starlight/repos/arcanea-ai-app/apps/web/app/studio/page.tsx')
    addPublication(db, `asset_${'4'.repeat(24)}`)
    addPremiumEval(db, `asset_${'4'.repeat(24)}`, `ver_${'5'.repeat(32)}`, '6'.repeat(64), 29)

    const policyWithDomain = structuredClone(policy)
    policyWithDomain.deliveryDomains.find(item => item.brand === 'arcanea').status = 'verified'
    policyWithDomain.deliveryDomains.find(item => item.brand === 'arcanea').domain = 'verified.example.test'
    const [item] = planDamRollout(db, policyWithDomain).items
    assert.equal(item.delivery.action, 'deliver-shared-rendition')
    assert.equal(item.delivery.bucket, 'starlight-dam-renditions-eu')
  } finally {
    db.close()
  }
})

test('planner requires rights and explicit non-sensitive approval before private workflow staging', () => {
  const db = createTestDatabase()
  try {
    insertAsset(db, {
      assetId: `asset_${'7'.repeat(24)}`,
      versionId: `ver_${'8'.repeat(32)}`,
      sha256: '9'.repeat(64),
      title: 'Arcanea mobile candidate',
      relativePath: '00_INBOX_MOBILE/Arcanea/candidate.png',
      storageKind: 'drive',
      rights: 'unknown',
      approval: 'candidate',
      tags: ['arcanea'],
    })

    const [item] = planDamRollout(db, policy).items
    assert.equal(item.master.action, 'retain-source-pending-human-review')
    assert.equal(item.master.bucket, null)
    assert.equal(item.delivery.status, 'blocked')
    assert.ok(item.delivery.blockers.some(blocker => blocker.includes('rights status blocks delivery')))

    db.prepare('UPDATE asset SET rights_status = ? WHERE asset_id = ?').run('owned', `asset_${'7'.repeat(24)}`)
    db.prepare(`
      INSERT INTO asset_annotation (
        asset_id, rating, color_label, curation_status, notes, custom_tags_json, updated_by, updated_at
      ) VALUES (?, NULL, NULL, 'workflow-approved', 'Human-approved private processing', ?, 'human-reviewer', '2026-08-27T10:05:00.000Z')
    `).run(`asset_${'7'.repeat(24)}`, JSON.stringify(['data-classification:business-nonsensitive']))

    const [approvedItem] = planDamRollout(db, policy).items
    assert.equal(approvedItem.master.action, 'stage-private-workflow')
    assert.equal(approvedItem.master.bucket, 'starlight-dam-workflow-eu')
    assert.match(approvedItem.master.key, /workflow-inbox-mobile/)
  } finally {
    db.close()
  }
})

test('unknown-rights assets stay in their source system and never receive delivery keys', () => {
  const db = createTestDatabase()
  try {
    insertAsset(db, {
      assetId: `asset_${'a'.repeat(24)}`,
      versionId: `ver_${'b'.repeat(32)}`,
      sha256: 'c'.repeat(64),
      title: 'unclassified personal photo',
      relativePath: 'photos/unclassified.png',
      storageKind: 'drive',
      rights: 'unknown',
      approval: 'candidate',
    })
    const [item] = planDamRollout(db, policy).items
    assert.equal(item.brand, 'unclassified')
    assert.equal(item.master.action, 'retain-source-pending-review')
    assert.equal(item.master.provider, 'google-drive')
    assert.equal(item.delivery.key, null)
    assert.equal(item.delivery.status, 'blocked')
  } finally {
    db.close()
  }
})

test('assets missing immutable versions remain visible as blocked inventory', () => {
  const db = createTestDatabase()
  try {
    db.prepare(`
      INSERT INTO asset (
        asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json,
        rights_status, approval_status, first_seen_at, last_seen_at
      ) VALUES (?, 'image', 'Arcanea missing version logo', NULL, 'pending', NULL, NULL, '["arcanea"]',
        'owned', 'approved', '2026-08-27T10:00:00.000Z', '2026-08-27T10:00:00.000Z')
    `).run(`asset_${'d'.repeat(24)}`)

    const [item] = planDamRollout(db, policy).items
    assert.equal(item.version_id, null)
    assert.equal(item.sha256, null)
    assert.ok(item.master.blockers.includes('immutable asset version and SHA-256 are required'))
    assert.ok(item.delivery.blockers.includes('immutable asset version and SHA-256 are required'))
  } finally {
    db.close()
  }
})

function createTestDatabase() {
  const db = new DatabaseSync(':memory:')
  createSchema(db)
  return db
}

function insertAsset(db, values) {
  const now = '2026-08-27T10:00:00.000Z'
  const mediaType = values.mediaType || 'image'
  db.prepare(`
    INSERT INTO asset (
      asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json,
      rights_status, approval_status, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)
  `).run(
    values.assetId,
    mediaType,
    values.title,
    values.relativePath,
    values.sha256,
    JSON.stringify(values.tags || []),
    values.rights || 'unknown',
    values.approval || 'candidate',
    now,
    now,
  )
  db.prepare(`
    INSERT INTO asset_version (
      version_id, asset_id, sha256, media_type, mime_type, extension, byte_size,
      width, height, duration_seconds, created_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, '{}')
  `).run(
    values.versionId,
    values.assetId,
    values.sha256,
    mediaType,
    values.mimeType || 'image/png',
    values.extension || '.png',
    values.byteSize || 1000,
    now,
  )
  db.prepare(`
    INSERT INTO asset_location (
      location_id, asset_id, version_id, root, absolute_path, relative_path, public_path,
      repo, storage_kind, provider, provider_id, is_primary, seen_at, exists_now
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, 1, ?, 1)
  `).run(
    `loc_${values.assetId.slice(-8)}`,
    values.assetId,
    values.versionId,
    values.storageKind === 'drive' ? 'Starlight Creative Vault' : 'C:/estate',
    values.storageKind === 'drive' ? `G:/Starlight Creative Vault/${values.relativePath}` : `C:/estate/${values.relativePath}`,
    values.relativePath,
    values.repo || null,
    values.storageKind || 'local',
    now,
  )
}

function addProvenance(db, assetId, versionId) {
  db.prepare(`
    INSERT INTO provenance_event (
      provenance_event_id, asset_id, version_id, event_type, actor, source, payload_json, created_at
    ) VALUES (?, ?, ?, 'generated', 'maker-agent', 'test', '{}', '2026-08-27T10:01:00.000Z')
  `).run(`prov_${assetId.slice(-8)}`, assetId, versionId)
}

function addUsage(db, assetId, sourceFile) {
  db.prepare(`
    INSERT INTO asset_usage (
      usage_id, asset_id, version_id, source_file, route, usage_context, reference_text, detected_at
    ) VALUES (?, ?, NULL, ?, '/', 'website', 'asset reference', '2026-08-27T10:02:00.000Z')
  `).run(`usage_${assetId.slice(-8)}`, assetId, sourceFile)
}

function addPremiumEval(db, assetId, versionId, sha256, score, overrides = {}) {
  db.prepare(`
    INSERT INTO eval_record (
      eval_id, asset_id, evaluator, score, rubric, verdict, notes, metadata_json, created_at
    ) VALUES (?, ?, 'qa-reviewer', ?, 'Premium asset 30 point gate', 'ship', 'Inspected export', ?, '2026-08-27T10:03:00.000Z')
  `).run(
    `eval_${assetId.slice(-8)}`,
    assetId,
    score,
    JSON.stringify({
      maker_id: 'maker-agent',
      reviewer_id: 'qa-reviewer',
      reviewed_at: '2026-08-27T10:03:00.000Z',
      review_artifact_sha256: 'd'.repeat(64),
      version_id: versionId,
      sha256,
      inspected_variants: ['desktop', 'mobile'],
      ...overrides,
    }),
  )
}

function addPublication(db, assetId) {
  db.prepare(`
    INSERT INTO publication (
      publication_id, asset_id, version_id, platform, url, route, caption, campaign,
      status, metrics_json, published_at, created_at
    ) VALUES (?, ?, NULL, 'website', NULL, '/', NULL, NULL, 'approved', '{}', NULL, '2026-08-27T10:02:30.000Z')
  `).run(`publication_${assetId.slice(-8)}`, assetId)
}

function addLegacyResolver(db, assetId, versionId) {
  db.prepare(`
    INSERT INTO provenance_event (
      provenance_event_id, asset_id, version_id, event_type, actor, source, payload_json, created_at
    ) VALUES (?, ?, ?, 'legacy-key-resolver-approved', 'human-reviewer', 'migration-manifest', '{}', '2026-08-27T10:02:45.000Z')
  `).run(`resolver_${assetId.slice(-8)}`, assetId, versionId)
}

function sampleAsset() {
  return {
    asset_id: `asset_${'1'.repeat(24)}`,
    version_id: `ver_${'b'.repeat(32)}`,
    sha256: 'a'.repeat(64),
    media_type: 'image',
    extension: '.png',
    relative_path: 'brand/Arcanea Logo Final.png',
    title: 'Arcanea Logo',
    tags_json: '["arcanea","logo"]',
  }
}
