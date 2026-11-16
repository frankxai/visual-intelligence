import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { exportDomainPlacementPacks } from '../scripts/export-domain-placement-pack.mjs'

test('exportDomainPlacementPacks excludes <26/30 assets and omits staging URLs from public XML sitemap', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-placement-pack-'))
  try {
    const manifest = {
      schemaVersion: 'vis.campaign-manifest.v1',
      jobId: 'test-pack',
      brandMeta: {
        frankx: {
          displayName: 'FrankX',
          primaryDomain: 'frankx.ai',
          routes: ['/', '/books'],
          markFile: 'frankx-command-mark.svg',
          funnelArchetype: 'Archetype 3: Physical Specimen Vault',
        },
        'sacred-visions': {
          displayName: 'Sacred Visions',
          primaryDomain: 'sacred-visions (staging local)',
          targetBase: 'http://127.0.0.1:8123',
          routes: ['/'],
          markFile: 'sacred-visions-archival-seal.svg',
          funnelArchetype: 'Archetype 6: Monograph',
        },
      },
      assets: [
        {
          assetId: 'frankx-pass',
          brand: 'frankx',
          title: 'Engine & <Books>',
          subtitle: 'Approved optical relay',
          role: 'Website Hero',
          stage: 'ready_for_publish',
          targetUrls: ['https://frankx.ai/'],
          qa: { total: 30, decision: 'pass' },
        },
        {
          assetId: 'frankx-rejected',
          brand: 'frankx',
          title: 'Rejected Draft',
          subtitle: 'Should never be placed',
          role: 'Concept',
          stage: 'qa_scored',
          targetUrls: ['https://frankx.ai/books'],
          qa: { total: 24, decision: 'iterate' },
        },
        {
          assetId: 'sv-pass',
          brand: 'sacred-visions',
          title: 'Cloister Study',
          subtitle: 'Local staging frontispiece',
          role: 'Exhibition Hero',
          stage: 'ready_for_publish',
          targetUrls: ['http://127.0.0.1:8123/'],
          qa: { total: 29, decision: 'pass' },
        },
      ],
      flowClips: [
        {
          assetId: 'frankx-motion-ok',
          brand: 'frankx',
          modality: 'video',
          model: 'veo-3.1-lite',
          stage: 'ready_for_publish',
          qaTotal: 29,
          qaDecision: 'pass',
          relPath: 'frankx/flow/frankx-optical-engine-flow-motion.mp4',
          posterRelPath: 'frankx/flow/frankx-optical-engine-flow-motion-poster.webp',
        },
        {
          assetId: 'frankx-motion-bad',
          brand: 'frankx',
          modality: 'video',
          model: 'veo-3.1-lite',
          stage: 'qa_scored',
          qaTotal: 24,
          qaDecision: 'iterate',
          relPath: 'frankx/flow/bad.mp4',
          posterRelPath: 'frankx/flow/bad-poster.webp',
        },
      ],
    }
    const r2Plan = {
      uploadManifest: [
        {
          assetId: 'frankx-pass',
          r2: { masterKey: 'masters/a.bin', previewKey: 'renditions/a/preview.webp' },
        },
        {
          assetId: 'frankx-motion-ok',
          r2: { masterKey: 'masters/v.bin', previewKey: 'renditions/v/preview.webp' },
        },
      ],
    }

    fs.writeFileSync(path.join(tmpDir, 'asset-manifest.json'), JSON.stringify(manifest))
    fs.writeFileSync(path.join(tmpDir, 'r2-dam-plan.json'), JSON.stringify(r2Plan))

    const summary = exportDomainPlacementPacks({ jobRoot: tmpDir })
    assert.equal(summary.brandCount, 2)

    const frankxMap = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'placements/frankx/route-media-map.json'), 'utf8')
    )
    assert.equal(frankxMap.eligibleMastersCount, 1)
    assert.equal(frankxMap.eligibleFlowClipsCount, 1)
    assert.equal(frankxMap.routes.length, 2)
    assert.equal(frankxMap.routes[1].stillAsset.assetId, 'frankx-pass')
    assert.equal(frankxMap.routes[0].motionClip.assetId, 'frankx-motion-ok')
    assert.equal(frankxMap.routes[0].stillAsset.r2MasterKey, 'masters/a.bin')

    const snippet = fs.readFileSync(
      path.join(tmpDir, 'placements/frankx/HeroMediaSlot.snippet.tsx'),
      'utf8'
    )
    assert.match(snippet, /prefers-reduced-motion: reduce/)
    assert.match(snippet, /preload="none"/)

    const frankxXml = fs.readFileSync(
      path.join(tmpDir, 'placements/frankx/image-video-sitemap.xml'),
      'utf8'
    )
    assert.match(frankxXml, /&lt;Books&gt;/)
    assert.match(frankxXml, /<video:duration>8<\/video:duration>/)

    const svXml = fs.readFileSync(
      path.join(tmpDir, 'placements/sacred-visions/image-video-sitemap.xml'),
      'utf8'
    )
    assert.match(svXml, /Staging-only local surface/)
    assert.ok(!svXml.includes('<url>'))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
