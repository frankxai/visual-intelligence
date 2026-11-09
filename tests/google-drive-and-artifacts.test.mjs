import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import {
  parseDriveVaultPath,
  normalizeDriveApiFile,
  scanDriveVaultMirror,
} from '../core/adapters/google-drive-adapter.mjs'
import {
  resolveArtifactsTarget,
  buildArtifactsCurationPacket,
  buildArtifactsGitPushPlan,
} from '../core/adapters/cloudflare-artifacts-adapter.mjs'
import worker from '../workers/vis-media/src/index.js'
import { createWorkerStorage, sha256File } from '../core/vis-storage.mjs'
import {
  openVisDatabase,
  planArtifactsCurationPacket,
  scanDriveVaultMirror as coreScanDriveVaultMirror,
} from '../core/vis-core.mjs'

test('Google Drive Vault taxonomy maps tiers and brands while keeping rights unknown', () => {
  const arc = parseDriveVaultPath('02_BRAND_VAULTS/Arcanea/Guardians/aiyami-crown.png')
  assert.equal(arc.tier, 'brand-vault')
  assert.equal(arc.brand, 'arcanea')
  assert.ok(arc.tags.includes('source:gdrive'))
  assert.ok(arc.tags.includes('brand:arcanea'))
  assert.equal(arc.proposed_rights_hint, null)

  const approvedFolder = normalizeDriveApiFile({
    id: 'drv_123',
    name: 'starlight-hero.webp',
    vaultPath: '04_APPROVED_MASTERS/Starlight/starlight-hero.webp',
    size: 4096,
    sha256Checksum: 'a'.repeat(64),
  })
  // Even inside 04_APPROVED_MASTERS, intake must never auto-approve or auto-grant rights.
  assert.equal(approvedFolder.record.rights_status, 'unknown')
  assert.equal(approvedFolder.record.approval_status, 'candidate')
  assert.equal(approvedFolder.record.brand, 'starlight')
  const rightsProposal = approvedFolder.proposals.find(p => p.kind === 'rights')
  assert.ok(rightsProposal, 'emits a reviewable rights proposal rather than mutating rights directly')
  assert.equal(rightsProposal.status, 'open')
})

test('scanDriveVaultMirror walks a local Google Drive mirror and computes sha256', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-gdrive-mirror-'))
  try {
    const inboxDir = path.join(tmpDir, '01_INBOX_RAW', 'FrankX')
    fs.mkdirSync(inboxDir, { recursive: true })
    const imgPath = path.join(inboxDir, 'hero-draft.png')
    const payload = crypto.randomBytes(256)
    fs.writeFileSync(imgPath, payload)
    const expectedSha = crypto.createHash('sha256').update(payload).digest('hex')

    const scan = scanDriveVaultMirror(tmpDir)
    assert.equal(scan.total_discovered, 1)
    assert.equal(scan.items[0].record.sha256, expectedSha)
    assert.equal(scan.items[0].record.brand, 'frankx')
    assert.equal(scan.items[0].record.rights_status, 'unknown')
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Cloudflare Artifacts curation packet enforces publishable gate and strips workstation paths', () => {
  assert.deepEqual(resolveArtifactsTarget('arcanea'), {
    namespace: 'Arcanea',
    repo: 'world-forge-starter',
  })
  assert.deepEqual(resolveArtifactsTarget('gencreator'), {
    namespace: 'GenCreator',
    repo: 'template-factory-starter',
  })
  assert.deepEqual(resolveArtifactsTarget('frankx'), {
    namespace: 'Starlight',
    repo: 'starter-repo',
  })

  const sha = 'b'.repeat(64)
  const syntheticWinRoot = ['C:', 'workstation', 'operator'].join('\\')
  const sampleAssets = [
    {
      asset_id: 'asset_approved',
      title: 'Arcanea Gate Hero',
      primary_path: `${syntheticWinRoot}\\arcanea\\public\\gate-hero.webp`,
      sha256: sha,
      category: 'arcanea-hero',
      rights_status: 'generated-owned',
      approval_status: 'approved',
      byte_size: 8192,
      tags: ['arcanea', 'hero'],
    },
    {
      asset_id: 'asset_unapproved',
      title: 'Raw Sketch',
      primary_path: `${syntheticWinRoot}\\downloads\\sketch.png`,
      rights_status: 'unknown',
      approval_status: 'candidate',
    },
  ]

  const packet = buildArtifactsCurationPacket(sampleAssets, { brand: 'arcanea' })

  assert.equal(packet.namespace, 'Arcanea')
  assert.equal(packet.repository, 'world-forge-starter')
  assert.equal(packet.total_accepted, 1)
  assert.equal(packet.total_refused, 1)
  assert.equal(packet.assets[0].file_name, 'gate-hero.webp')
  assert.equal(JSON.stringify(packet.assets).includes('workstation'), false, 'never leaks local workstation path')
  assert.equal(packet.assets[0].r2_master_key, `masters/bb/${sha}`)

  const previewPacket = buildArtifactsCurationPacket(sampleAssets, {
    brand: 'arcanea',
    dryRunPreview: true,
  })
  assert.equal(previewPacket.dry_run_preview, true)
  assert.equal(previewPacket.total_accepted, 2)
  assert.equal(previewPacket.total_refused, 0)

  const pushPlan = buildArtifactsGitPushPlan({ namespace: 'Arcanea', repo: 'world-forge-starter' })
  assert.equal(pushPlan.credentials_in_remote, false)
  assert.equal(pushPlan.remote_url, 'https://0b5c0d4435bdb220b9ed28efa0a98554.artifacts.cloudflare.net/git/Arcanea/world-forge-starter.git')
})

test('vis-media Worker supports legacy VIS_BUCKET binding fallback alongside MEDIA', async () => {
  const store = new Map()
  const bucket = {
    async get(key) { const v = store.get(key); return v ? { body: new Response(v.bytes).body, httpEtag: '"1"', httpMetadata: {}, customMetadata: { sha256: v.sha } } : null },
    async head(key) { const v = store.get(key); return v ? { size: v.bytes.length, customMetadata: { sha256: v.sha } } : null },
    async put(key, body, opts = {}) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer())
      store.set(key, { bytes, sha: opts.sha256 })
      return { size: bytes.length, etag: '1' }
    },
  }
  const env = { VIS_BUCKET: bucket, PREVIEW_SIGNING_KEY: 'k', ADMIN_TOKEN: 't' }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-bucket-fallback-'))
  try {
    const file = path.join(dir, 'sample.bin')
    fs.writeFileSync(file, crypto.randomBytes(128))
    const sha = sha256File(file)
    const storage = createWorkerStorage({
      baseUrl: 'https://vis-media.test',
      adminToken: 't',
      signingKey: 'k',
      fetchImpl: (url, init) => worker.fetch(new Request(url, init), env),
    })
    await storage.putMaster(sha, file)
    const restored = await storage.getMaster(sha, path.join(dir, 'restored.bin'))
    assert.equal(sha256File(restored), sha)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('vis-core re-exports Drive & Artifacts adapters and plans DB-backed curation packets', () => {
  assert.equal(typeof coreScanDriveVaultMirror, 'function')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-artifacts-db-'))
  try {
    const db = openVisDatabase(tmpDir)
    try {
      const ts = new Date().toISOString()
      const sha = 'c'.repeat(64)
      db.prepare(`
        INSERT INTO asset (asset_id, media_type, title, primary_path, source_hash, category, mood, tags_json, rights_status, approval_status, first_seen_at, last_seen_at)
        VALUES (?, 'image', 'Starlight Hero', 'public/images/starlight-hero.webp', ?, 'hero', 'luminous', '["starlight","hero"]', 'generated-owned', 'approved', ?, ?)
      `).run('asset_starlight_1', sha, ts, ts)
      db.prepare(`
        INSERT INTO asset_version (version_id, asset_id, sha256, media_type, mime_type, extension, byte_size, width, height, duration_seconds, created_at, metadata_json)
        VALUES ('ver_starlight_1', 'asset_starlight_1', ?, 'image', 'image/webp', '.webp', 16384, 1920, 1080, null, ?, '{}')
      `).run(sha, ts)

      const planned = planArtifactsCurationPacket(db, {
        brand: 'starlight',
        branch: 'main',
      })
      assert.equal(planned.packet.namespace, 'Starlight')
      assert.equal(planned.packet.repository, 'starter-repo')
      assert.equal(planned.packet.total_accepted, 1)
      assert.equal(planned.packet.assets[0].asset_id, 'asset_starlight_1')
      assert.equal(planned.push_plan.credentials_in_remote, false)
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
