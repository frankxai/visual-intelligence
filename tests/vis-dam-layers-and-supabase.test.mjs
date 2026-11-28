import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import {
  DEFAULT_UPLOAD_PRESETS,
  buildCharacterCanonBrief,
  cosineSimilarity,
  evaluateUploadAgainstPreset,
  hybridScoreAssets,
  planDerivativePurge,
  validateStructuredMetadata,
  validateUploadPreset,
} from '../core/vis-dam-layers.mjs'
import {
  createR2PresignedUrl,
  planContentAddressedR2Intake,
} from '../core/adapters/cloudflare-r2-adapter.mjs'
import { createSupabaseWorkspaceCatalog } from '../core/adapters/supabase-workspace-catalog.mjs'

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const SHA_MASTER = 'a'.repeat(64)
const SHA_VARIANT = 'b'.repeat(64)

test('structured metadata engine validates field types and conditional brand/character rules', () => {
  const ok = validateStructuredMetadata({
    brand: 'arcanea',
    content_pillar: 'character-canon',
    character_id: 'sable-luminor',
    character_outfit: 'obsidian-cloak',
    arcanea_gate: 'sight',
    usage_channels: ['website', 'website', 'newsletter'],
    qa_score: 28,
  })
  assert.equal(ok.valid, true)
  assert.deepEqual(ok.normalized.usage_channels, ['website', 'newsletter'])
  assert.equal(ok.warnings.length, 0)

  // Conditional error when character_id omits character_outfit
  const missingOutfit = validateStructuredMetadata({
    brand: 'arcanea',
    character_id: 'sable-luminor',
  })
  assert.equal(missingOutfit.valid, false)
  assert.ok(missingOutfit.errors.some(e => e.field === 'character_outfit'))
  assert.ok(missingOutfit.warnings.some(w => w.field === 'arcanea_gate'))

  const badTypes = validateStructuredMetadata({ qa_score: 99, license_expiry: 'not-a-date', unknown_prop: 'x' }, { strict: true })
  assert.equal(badTypes.valid, false)
  assert.equal(badTypes.errors.length, 3)
})

test('upload presets enforce Issue #41 rights_default=unknown lock and reject invalid files', () => {
  for (const preset of Object.values(DEFAULT_UPLOAD_PRESETS)) {
    assert.equal(validateUploadPreset(preset).valid, true, `preset ${preset.id} must satisfy lock`)
  }
  const roguePreset = { ...DEFAULT_UPLOAD_PRESETS.brand_hero_intake, rights_default: 'owned' }
  assert.equal(validateUploadPreset(roguePreset).valid, false)

  const accepted = evaluateUploadAgainstPreset({
    preset: 'character_canon_intake',
    filename: 'sable-turnaround.png',
    mimeType: 'image/png',
    byteSize: 1024 * 512,
    sha256: SHA_MASTER,
    metadata: { brand: 'arcanea', character_id: 'sable', character_outfit: 'starlight-armor' },
  })
  assert.equal(accepted.accepted, true)
  assert.equal(accepted.rights_status, 'unknown')
  assert.equal(accepted.approval_status, 'candidate')
  assert.equal(accepted.key, `masters/${SHA_MASTER.slice(0, 2)}/${SHA_MASTER}`)

  const blocked = planContentAddressedR2Intake({
    preset: 'brand_hero_intake',
    filename: '../bad.exe',
    mimeType: 'application/x-msdownload',
    byteSize: 999999999,
    sha256: 'bad-hash',
    metadata: {},
  })
  assert.equal(blocked.accepted, false)
  assert.ok(blocked.blockers.length >= 3)
})

test('R2 S3v4 presigned URLs sign cleanly and refuse DELETE on immutable prefixes', () => {
  const secret = 'synthetic-secret-access-key-0001'
  const signedGet = createR2PresignedUrl({
    method: 'GET',
    bucket: 'starlight-media-private',
    key: `masters/${SHA_MASTER.slice(0, 2)}/${SHA_MASTER}`,
    accountId: 'acc123456',
    accessKeyId: 'AKIAEXAMPLE123',
    secretAccessKey: secret,
    expiresIn: 600,
    now: new Date('2026-11-28T00:00:00Z'),
  })
  assert.ok(signedGet.url.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'))
  assert.ok(signedGet.url.includes('X-Amz-Signature='))
  assert.equal(signedGet.url.includes(secret), false)

  assert.throws(() => createR2PresignedUrl({
    method: 'DELETE',
    key: `masters/${SHA_MASTER.slice(0, 2)}/${SHA_MASTER}`,
    accountId: 'acc123456',
    accessKeyId: 'AKIAEXAMPLE123',
    secretAccessKey: secret,
  }), /immutable/)

  assert.throws(() => createR2PresignedUrl({
    method: 'PUT',
    key: 'masters/../escape.png',
    accountId: 'acc123456',
    accessKeyId: 'AKIAEXAMPLE123',
    secretAccessKey: secret,
  }), /Unsafe|Invalid/)
})

test('planDerivativePurge only targets derived/ keys and protects masters/ and renditions/', () => {
  const plan = planDerivativePurge({
    sha256: SHA_MASTER,
    derivatives: [
      `derived/${SHA_MASTER.slice(0, 2)}/${SHA_MASTER}.0123456789abcdef.webp`,
      `masters/${SHA_MASTER.slice(0, 2)}/${SHA_MASTER}`,
      `renditions/${SHA_MASTER.slice(0, 2)}/${SHA_MASTER}.preview.webp`,
    ],
  })
  assert.equal(plan.dryRun, true)
  assert.equal(plan.purgeCount, 1)
  assert.equal(plan.refusedCount, 2)
  assert.equal(plan.mastersUntouched, true)
})

test('buildCharacterCanonBrief & hybridScoreAssets combine canon, negative taste, and cosine RRF', () => {
  const brief = buildCharacterCanonBrief({
    characterId: 'sable',
    brand: 'arcanea',
    assets: [
      { asset_id: 'a1', title: 'Sable Master Sheet', sha256: SHA_MASTER, brand: 'arcanea', characters: ['sable'], approval_status: 'approved', rights_status: 'generated-owned', width: 2048, height: 2048 },
      { asset_id: 'a2', title: 'Sable Drift Draft', sha256: SHA_VARIANT, brand: 'arcanea', characters: ['sable'], approval_status: 'rejected', rights_status: 'unknown', notes: 'off-model eyes' },
    ],
    tasteDirectives: [
      { brand: 'arcanea', polarity: 'positive', doctrine: 'Maintain bronze collar insignia and silver iris specular highlights' },
      { brand: 'estate', polarity: 'negative', doctrine: 'Avoid plastic skin smoothing', defects: ['plastic-skin', 'off-model'] },
    ],
  })
  assert.equal(brief.readyForGeneration, true)
  assert.equal(brief.canonicalReferences.length, 1)
  assert.equal(brief.rejectedDriftExamples.length, 1)
  assert.ok(brief.avoidDefects.includes('plastic-skin'))

  assert.equal(Math.round(cosineSimilarity([1, 0, 0], [1, 0, 0]) * 100), 100)
  const ranked = hybridScoreAssets([
    { asset_id: 'x1', title: 'Hero Ocean Banner', brand: 'frankx', embedding: [0.1, 0.9] },
    { asset_id: 'x2', title: 'Sable Starweave Portrait', brand: 'arcanea', characters: ['sable'], embedding: [0.99, 0.05] },
  ], {
    query: 'sable',
    queryEmbedding: [1, 0],
    filters: { brand: 'arcanea' },
  })
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].asset.asset_id, 'x2')
  assert.ok(ranked[0].rrfScore > 0)
})

test('Postgres 20261128_vis_dam_layers migration enforces RLS, Issue #41 locks, derivative lineage, and cosine SQL', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.tenants(id uuid PRIMARY KEY);')
  await db.exec(await fs.readFile(new URL('../platform/migrations/20261105_vis_catalog.sql', import.meta.url), 'utf8'))
  await db.exec(await fs.readFile(new URL('../platform/migrations/20261118_vis_identity_decisions.sql', import.meta.url), 'utf8'))
  await db.exec(await fs.readFile(new URL('../platform/migrations/20261118_vis_review_receipts.sql', import.meta.url), 'utf8'))
  await db.exec(await fs.readFile(new URL('../platform/migrations/20261128_vis_dam_layers.sql', import.meta.url), 'utf8'))

  await db.query('INSERT INTO tenants VALUES ($1), ($2)', [WS_A, WS_B])
  await db.query("INSERT INTO vis_catalog_sources(workspace_id, source_id, kind, state) VALUES ($1, 'owned', 'vis_sqlite', 'ready')", [WS_A])
  await db.query("INSERT INTO vis_catalog_assets(workspace_id, source_id, asset_id, title, brand, characters, media_type) VALUES ($1, 'owned', 'asset_sable', 'Sable Canon', 'arcanea', ARRAY['sable'], 'image')", [WS_A])
  await db.query("INSERT INTO vis_catalog_versions(workspace_id, source_id, asset_id, version_id, sha256, width, height, rights_status, approval_status, approved_at, approved_by, observed_at) VALUES ($1, 'owned', 'asset_sable', 'v1', $2, 1600, 1600, 'generated-owned', 'approved', now(), 'frank', now())", [WS_A, SHA_MASTER])

  // Structured metadata + character profile + link + derivative + upload preset + embedding
  await db.query("INSERT INTO vis_structured_metadata_fields(workspace_id, field_id, field_type, allowed_values) VALUES ($1, 'arcanea_gate', 'enum', ARRAY['foundation', 'sight'])", [WS_A])
  await db.query("INSERT INTO vis_asset_metadata(workspace_id, source_id, asset_id, version_id, metadata_json) VALUES ($1, 'owned', 'asset_sable', 'v1', '{\"arcanea_gate\":\"sight\"}'::jsonb)", [WS_A])
  await db.query("INSERT INTO vis_character_profiles(workspace_id, character_id, brand, display_name, canonical_master_sha256) VALUES ($1, 'sable', 'arcanea', 'Sable', $2)", [WS_A, SHA_MASTER])
  await db.query("INSERT INTO vis_asset_character_links(workspace_id, source_id, asset_id, version_id, character_id, role, outfit) VALUES ($1, 'owned', 'asset_sable', 'v1', 'sable', 'master_sheet', 'starlight-armor')", [WS_A])

  const dKey = `derived/${SHA_MASTER.slice(0, 2)}/${SHA_MASTER}.0123456789abcdef.webp`
  await db.query(
    "INSERT INTO vis_asset_derivatives(workspace_id, source_id, asset_id, version_id, parent_sha256, spec_hash, transform_spec, format, width, height, byte_size, r2_object_key) VALUES ($1, 'owned', 'asset_sable', 'v1', $2, '0123456789abcdef', 'c_fill,w_900,h_1200,g_auto,q_auto,f_auto', 'webp', 900, 1200, 42000, $3)",
    [WS_A, SHA_MASTER, dKey]
  )
  await db.query("INSERT INTO vis_asset_embeddings(workspace_id, source_id, asset_id, version_id, model_id, dimensions, embedding) VALUES ($1, 'owned', 'asset_sable', 'v1', 'clip-vit-large', 3, ARRAY[1.0, 0.0, 0.0])", [WS_A])

  // Issue #41 check: cannot insert upload preset with rights_default != 'unknown'
  await assert.rejects(
    db.query("INSERT INTO vis_upload_presets(workspace_id, preset_id, folder, allowed_mime_types, max_bytes, rights_default) VALUES ($1, 'bad', 'inbox', ARRAY['image/png'], 4096, 'owned')", [WS_A]),
    /check constraint/
  )
  await db.query("INSERT INTO vis_upload_presets(workspace_id, preset_id, folder, allowed_mime_types, max_bytes) VALUES ($1, 'safe', 'inbox', ARRAY['image/png'], 4096)", [WS_A])

  // Non-derived key in vis_asset_derivatives fails CHECK; updating derivative key fails trigger
  await assert.rejects(
    db.query("INSERT INTO vis_asset_derivatives(workspace_id, source_id, asset_id, version_id, parent_sha256, spec_hash, transform_spec, format, r2_object_key) VALUES ($1, 'owned', 'asset_sable', 'v1', $2, 'fedcba9876543210', 'c_fit,w_320', 'webp', $3)", [WS_A, SHA_MASTER, `masters/${SHA_MASTER.slice(0, 2)}/${SHA_MASTER}`]),
    /check constraint/
  )
  await assert.rejects(
    db.query("UPDATE vis_asset_derivatives SET r2_object_key = 'derived/aa/fake' WHERE workspace_id = $1", [WS_A]),
    /immutable/
  )

  // Cosine SQL function and enriched views work cleanly
  const sim = await db.query('SELECT public.vis_cosine_similarity(ARRAY[1.0, 0.0, 0.0], embedding) AS score FROM vis_asset_embeddings WHERE workspace_id = $1', [WS_A])
  assert.equal(Math.round(sim.rows[0].score * 100), 100)

  const rich = await db.query('SELECT structured_metadata, derivative_count FROM vis_catalog_rich_search WHERE workspace_id = $1', [WS_A])
  assert.equal(rich.rows[0].structured_metadata.arcanea_gate, 'sight')
  assert.equal(rich.rows[0].derivative_count, 1)

  const canon = await db.query('SELECT linked_asset_count, master_sheet_count FROM vis_character_canon_overview WHERE workspace_id = $1', [WS_A])
  assert.equal(canon.rows[0].linked_asset_count, 1)
  assert.equal(canon.rows[0].master_sheet_count, 1)

  // RLS enabled + direct authenticated/anon reads blocked
  const rls = await db.query("SELECT relrowsecurity FROM pg_class WHERE relname IN ('vis_structured_metadata_fields', 'vis_asset_metadata', 'vis_character_profiles', 'vis_asset_character_links', 'vis_asset_derivatives', 'vis_upload_presets', 'vis_asset_embeddings')")
  assert.equal(rls.rows.length, 7)
  assert.ok(rls.rows.every(r => r.relrowsecurity))

  await db.exec('SET ROLE authenticated')
  await assert.rejects(db.query('SELECT * FROM vis_catalog_rich_search'), /permission denied/)
  await db.exec('RESET ROLE')
})

test('createSupabaseWorkspaceCatalog extended DAM methods enforce strict tenant boundaries', async () => {
  const base = { url: 'https://fixture.supabase.co', serviceKey: 'synthetic-server-key-for-fixture-only' }
  const seenTables = []
  const adapter = createSupabaseWorkspaceCatalog({
    ...base,
    workspaceId: WS_A,
    sourceId: 'owned',
    fetchImpl: async url => {
      seenTables.push(url.pathname)
      assert.equal(url.searchParams.get('workspace_id'), `eq.${WS_A}`)
      if (url.pathname.endsWith('vis_catalog_sources')) return Response.json([{ state: 'ready', asset_count: 1, indexed_at: '2026-11-28T00:00:00Z' }])
      return Response.json([{ character_id: 'sable', field_id: 'brand', preset_id: 'safe', spec_hash: '0123456789abcdef' }])
    },
  })

  await adapter.listDerivatives('asset_sable', 'v1', { workspaceId: WS_A })
  await adapter.listMetadataFields({ workspaceId: WS_A })
  await adapter.getCharacterProfile('sable', { workspaceId: WS_A })
  await adapter.listUploadPresets({ workspaceId: WS_A })
  assert.ok(seenTables.some(p => p.endsWith('vis_asset_derivatives')))
  assert.ok(seenTables.some(p => p.endsWith('vis_character_profiles')))

  await assert.rejects(adapter.listMetadataFields({ workspaceId: WS_B }), /workspace_forbidden/)
  await assert.rejects(adapter.getCharacterProfile('sable', { workspaceId: WS_B }), /workspace_forbidden/)
  await assert.rejects(adapter.listUploadPresets({ workspaceId: WS_B }), /workspace_forbidden/)
  assert.equal(await adapter.preview('asset_sable', 'v1', { workspaceId: WS_A }), null)
})
