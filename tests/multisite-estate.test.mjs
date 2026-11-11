import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import {
  findPromptSidecars,
  getAsset,
  indexProject,
  linkPublicAssetUsage,
  listScanProfiles,
  loadConfig,
  openVisDatabase,
  resolveScanProfile,
} from '../core/vis-core.mjs'
import { listPlacements, observePlacements, resolvePlacementSites } from '../core/vis-placements.mjs'
import { openLibraryDatabase } from '../core/vis-library.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BIN_VIS = path.join(REPO_ROOT, 'bin', 'vis.mjs')

const EXPECTED_ESTATE_SITES = [
  { label: 'frankx.ai', repo: '../frankx.ai-vercel-website', brand: 'frankx', publicBase: 'https://www.frankx.ai' },
  { label: 'starlightintelligence.ai', repo: '../starlightintelligence.ai', brand: 'sis', publicBase: 'https://starlightintelligence.ai' },
  { label: 'arcanea.ai', repo: '../arcanea-ai-app', brand: 'arcanea', webRoot: 'apps/web/public', publicBase: 'https://arcanea.ai' },
  { label: 'ai-architect-academy', repo: '../ai-architect-academy', brand: 'ai-coe', webRoot: 'site/public', publicBase: 'https://aiarchitectacademy.com' },
  { label: 'gencreator.ai', repo: '../gencreator.ai', brand: 'gencreator', publicBase: 'https://gencreator.ai' },
  { label: 'agenticincome.ai', repo: '../agenticincome', brand: 'agentic-income', publicBase: 'https://agenticincome.ai' },
]

test('vis.config.json defines six website placement sites with the actual application roots and multi-site diagram scan profiles', () => {
  const rawConfig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'vis.config.json'), 'utf8'))
  const config = loadConfig(REPO_ROOT)

  assert.ok(Array.isArray(rawConfig.placements?.sites))
  assert.equal(rawConfig.placements.sites.length, 6)

  const labels = rawConfig.placements.sites.map(site => site.label)
  assert.deepEqual(
    labels,
    EXPECTED_ESTATE_SITES.map(site => site.label),
  )

  for (const expected of EXPECTED_ESTATE_SITES) {
    const site = rawConfig.placements.sites.find(entry => entry.label === expected.label)
    assert.ok(site, `Missing placement site ${expected.label}`)
    assert.equal(site.repo, expected.repo)
    assert.equal(site.brand, expected.brand)
    assert.equal(site.publicBase, expected.publicBase)
    assert.equal(site.ref, 'origin/main')
    const webRoot = expected.webRoot || 'public'
    assert.equal(site.webRoot, webRoot)
    assert.equal(site.optional, true)
    assert.deepEqual(site.publicMediaDirs, [
      `${webRoot}/images`,
      `${webRoot}/images/diagrams`,
      `${webRoot}/diagrams`,
      `${webRoot}/visuals`,
    ])
    assert.equal(site.diagramRegistryPath, `${webRoot}/images/diagrams/registry.json`)
    assert.equal(site.provenanceSidecar?.suffix, '.vis.provenance.json')
    assert.equal(site.provenanceSidecar?.requiredForGenerated, true)
  }

  const resolvedSites = resolvePlacementSites(REPO_ROOT, config)
  assert.equal(resolvedSites.length, 6)
  for (const site of resolvedSites) {
    assert.equal(site.optional, true)
    assert.ok(path.isAbsolute(site.repo))
    assert.equal(site.provenanceSidecar.suffix, '.vis.provenance.json')
    assert.ok(site.publicMediaDirs.includes(`${site.webRoot}/images/diagrams`))
  }

  const profileSummaries = listScanProfiles(config)
  assert.ok(profileSummaries.some(p => p.name === 'frank-estate' && p.optionalSiblingRepos === true))
  assert.ok(profileSummaries.some(p => p.name === 'multisite-estate' && p.optionalSiblingRepos === true))

  for (const profileName of ['frank-estate', 'multisite-estate']) {
    const profile = resolveScanProfile(REPO_ROOT, config, profileName)
    assert.equal(profile.optionalSiblingRepos, true)
    assert.ok(profile.diagramGlobs.includes('public/images/diagrams/**/*.svg'))
    assert.ok(profile.diagramGlobs.includes('public/diagrams/**/*.svg'))
    assert.ok(profile.diagramGlobs.includes('public/visuals/**/*.svg'))
    assert.ok(profile.provenanceSidecarGlobs.includes('**/*.vis.provenance.json'))
    assert.ok(profile.mediaRoots.length >= 8)
    assert.ok(Array.isArray(profile.existingMediaRoots))
    assert.ok(Array.isArray(profile.missingMediaRoots))
  }
})

test('resolvePlacementSites supports repoFallbacks and observePlacements indexes SVG diagrams while tolerating absent optional sibling repos', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-estate-sites-'))
  try {
    const visRoot = path.join(workspace, 'visual-intelligence')
    const fallbackFrankx = path.join(workspace, 'frankx-fallback-sync')
    const gencreatorRepo = path.join(workspace, 'gencreator.ai')
    const arcaneaRepo = path.join(workspace, 'arcanea-ai-app')
    fs.mkdirSync(visRoot, { recursive: true })
    fs.mkdirSync(fallbackFrankx, { recursive: true })
    fs.mkdirSync(gencreatorRepo, { recursive: true })
    fs.mkdirSync(arcaneaRepo, { recursive: true })

    const initGitRepo = (repoDir, files) => {
      execFileSync('git', ['-C', repoDir, 'init', '-q', '-b', 'main'], { encoding: 'utf8' })
      execFileSync('git', ['-C', repoDir, 'config', 'user.email', 'vis@example.com'], { encoding: 'utf8' })
      execFileSync('git', ['-C', repoDir, 'config', 'user.name', 'VIS Test'], { encoding: 'utf8' })
      for (const [relPath, content] of Object.entries(files)) {
        const target = path.join(repoDir, relPath)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, content, 'utf8')
      }
      // Commit with --no-verify so temporary test git repos do not invoke workstation hooks
      execFileSync('git', ['-C', repoDir, 'add', '-A'], { encoding: 'utf8' })
      execFileSync('git', ['-C', repoDir, 'commit', '--no-verify', '-q', '-m', 'seed diagrams'], { encoding: 'utf8' })
    }

    const svgSample = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450"><rect width="800" height="450" fill="#0A0A0B"/></svg>'
    initGitRepo(fallbackFrankx, {
      'public/images/diagrams/opencode-stack.dark.svg': svgSample,
      'public/visuals/architecture-card.svg': svgSample,
    })
    initGitRepo(gencreatorRepo, {
      'public/diagrams/creator-roadmap.light.svg': svgSample,
    })

    initGitRepo(arcaneaRepo, {
      'apps/web/public/images/diagrams/gate-map.svg': svgSample,
    })

    const repoConfig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'vis.config.json'), 'utf8'))
    repoConfig.library = { roots: [], minFreeDiskGB: 0, receiptsDir: 'data/receipts' }
    repoConfig.placements.sites = repoConfig.placements.sites.map(site => {
      if (site.label === 'frankx.ai') {
        return { ...site, ref: 'main', repoFallbacks: ['../frankx-fallback-sync'] }
      }
      if (site.label === 'gencreator.ai') {
        return { ...site, ref: 'main' }
      }
      return { ...site, ref: 'main' }
    })
    fs.writeFileSync(path.join(visRoot, 'vis.config.json'), JSON.stringify(repoConfig, null, 2))
    fs.writeFileSync(path.join(visRoot, 'package.json'), JSON.stringify({ name: 'vis-temp', private: true }))

    const loaded = loadConfig(visRoot)
    const resolved = resolvePlacementSites(visRoot, loaded)
    const frankxSite = resolved.find(s => s.label === 'frankx.ai')
    const gencreatorSite = resolved.find(s => s.label === 'gencreator.ai')
    const missingSite = resolved.find(s => s.label === 'starlightintelligence.ai')

    assert.equal(frankxSite.repo, fallbackFrankx, 'falls back to existing git checkout when primary ../frankx.ai-vercel-website is absent')
    assert.equal(frankxSite.exists, true)
    assert.equal(gencreatorSite.repo, gencreatorRepo)
    assert.equal(gencreatorSite.exists, true)
    assert.equal(missingSite.exists, false)
    assert.equal(missingSite.optional, true)

    const observed = await observePlacements({ root: visRoot, execute: true })
    assert.equal(observed.sites.length, 6)

    const frankxObs = observed.sites.find(s => s.site === 'frankx.ai')
    const gencreatorObs = observed.sites.find(s => s.site === 'gencreator.ai')
    const arcaneaObs = observed.sites.find(s => s.site === 'arcanea.ai')

    assert.equal(frankxObs.live, 2)
    assert.equal(gencreatorObs.live, 1)
    assert.equal(arcaneaObs.live, 1)
    const missingObs = observed.sites.find(s => s.site === 'starlightintelligence.ai')
    assert.equal(missingObs.optional, true)
    assert.equal(missingObs.skipped, true)
    assert.match(missingObs.error, /not a git repository/)

    const db = openLibraryDatabase(visRoot, loaded)
    try {
      const frankxUrls = listPlacements(db, { site: 'frankx.ai' }).map(p => p.url).sort()
      assert.deepEqual(frankxUrls, [
        'https://www.frankx.ai/images/diagrams/opencode-stack.dark.svg',
        'https://www.frankx.ai/visuals/architecture-card.svg',
      ])
      const genUrls = listPlacements(db, { site: 'gencreator.ai' }).map(p => p.url)
      assert.deepEqual(genUrls, ['https://gencreator.ai/diagrams/creator-roadmap.light.svg'])
      assert.deepEqual(listPlacements(db, { site: 'arcanea.ai' }).map(p => p.url), ['https://arcanea.ai/images/diagrams/gate-map.svg'])
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})

test('diagram SVGs, shared .vis.provenance.json sidecars, /diagrams + /visuals usage links, and vis doctor/audit work when sibling checkouts are optional', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-diagram-sidecar-'))
  try {
    const visRoot = path.join(workspace, 'visual-intelligence')
    const siblingSite = path.join(workspace, 'starlightintelligence.ai')
    fs.mkdirSync(visRoot, { recursive: true })
    fs.mkdirSync(path.join(siblingSite, 'public', 'diagrams'), { recursive: true })
    fs.mkdirSync(path.join(siblingSite, 'public', 'visuals'), { recursive: true })
    fs.mkdirSync(path.join(siblingSite, 'app', 'architecture'), { recursive: true })

    const darkSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1520 820" width="1520" height="820"><rect width="1520" height="820" fill="#070A10"/><text x="40" y="80" fill="#F5F2EB">SIS Architecture</text></svg>'
    const hudSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 920" width="1600" height="920"><rect width="1600" height="920" fill="#0D172B"/></svg>'

    const darkSvgPath = path.join(siblingSite, 'public', 'diagrams', 'sis-architecture.dark.svg')
    const hudSvgPath = path.join(siblingSite, 'public', 'visuals', 'character-hud.svg')
    fs.writeFileSync(darkSvgPath, darkSvg, 'utf8')
    fs.writeFileSync(hudSvgPath, hudSvg, 'utf8')

    // Shared stem provenance sidecar for .dark.svg / .light.svg variants
    fs.writeFileSync(
      path.join(siblingSite, 'public', 'diagrams', 'sis-architecture.vis.provenance.json'),
      JSON.stringify(
        {
          schema_version: '1.0.0',
          prompt: 'Deterministic layered-architecture SVG compiled from sis-agentic-architecture.diagram.json',
          model: 'compile-brand-diagrams.mjs',
          provider: 'starlight-design-intelligence',
          agent: {
            coding_agent: 'antigravity',
            repo: 'Starlight-Intelligence/starlight-design-intelligence',
          },
          settings: {
            identity_id: 'sis-recovered-star',
            prompt_fidelity: 'EXACT',
            edition: 'editorial',
            rights_state: 'internal-verified',
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    fs.writeFileSync(
      path.join(siblingSite, 'app', 'architecture', 'page.tsx'),
      `export default function Page() {
        return (
          <section>
            <img src="/diagrams/sis-architecture.dark.svg" alt="SIS Architecture" />
            <img src="/visuals/character-hud.svg" alt="Character HUD" />
          </section>
        )
      }`,
      'utf8',
    )

    const sidecars = findPromptSidecars(darkSvgPath)
    assert.equal(sidecars.length, 1, 'links stem .vis.provenance.json for .dark.svg diagram variant')
    assert.equal(sidecars[0].model, 'compile-brand-diagrams.mjs')

    const repoConfig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'vis.config.json'), 'utf8'))
    fs.writeFileSync(path.join(visRoot, 'vis.config.json'), JSON.stringify(repoConfig, null, 2))
    fs.writeFileSync(path.join(visRoot, 'package.json'), JSON.stringify({ name: 'vis-temp', private: true }))

    const profile = resolveScanProfile(visRoot, loadConfig(visRoot), 'multisite-estate')
    assert.deepEqual(profile.existingMediaRoots, [siblingSite])
    assert.equal(profile.missingMediaRoots.length, 7)

    const summary = indexProject({
      root: visRoot,
      mediaRoots: profile.existingMediaRoots,
      config: { usageRoots: profile.existingUsageRoots },
    })
    assert.equal(summary.logicalAssets, 2)

    const db = openVisDatabase(visRoot)
    try {
      const linked = linkPublicAssetUsage(db, siblingSite)
      assert.ok(linked >= 0)
      const diagramAsset = getAsset(db, darkSvgPath)
      assert.ok(diagramAsset)
      assert.equal(diagramAsset.versions[0]?.width, 1520)
      assert.equal(diagramAsset.versions[0]?.height, 820)
      assert.ok(diagramAsset.prompts.length >= 1)
      assert.ok(diagramAsset.usage.length >= 1)
    } finally {
      db.close()
    }

    // Verify CLI doctor and audit succeed cleanly even with optional sibling checkouts absent
    const doctorOut = JSON.parse(
      execFileSync(process.execPath, [BIN_VIS, 'doctor', '--root', visRoot, '--json'], { encoding: 'utf8' }),
    )
    assert.equal(doctorOut.root, visRoot)
    assert.equal(doctorOut.checks.find(c => c.name === 'config')?.ok, true)
    assert.equal(doctorOut.checks.find(c => c.name === 'sqliteIndex')?.ok, true)

    const auditOut = JSON.parse(
      execFileSync(process.execPath, [BIN_VIS, 'audit', '--root', visRoot, '--json'], { encoding: 'utf8' }),
    )
    assert.equal(auditOut.assets, 2)
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})


test('configured monorepo asset roots match Arcanea and Academy application layouts', () => {
  const config = loadConfig(REPO_ROOT)
  const arcanea = config.placements.sites.find(site => site.label === 'arcanea.ai')
  const academy = config.placements.sites.find(site => site.label === 'ai-architect-academy')
  assert.equal(arcanea.webRoot, 'apps/web/public')
  assert.equal(academy.webRoot, 'site/public')
  assert.equal(arcanea.diagramRegistryPath, 'apps/web/public/images/diagrams/registry.json')
  assert.equal(academy.diagramRegistryPath, 'site/public/images/diagrams/registry.json')
  const inferred = resolvePlacementSites(REPO_ROOT, {
    placements: { sites: [{ label: 'nested', repo: '.', webRoot: 'apps/web/public' }] },
  })[0]
  assert.ok(inferred.publicMediaDirs.includes('apps/web/public/images/diagrams'))
})

test('website placement never substitutes the SIS platform or invents a publishing host', () => {
  const config = loadConfig(REPO_ROOT)
  const starlight = config.placements.sites.find(site => site.label === 'starlightintelligence.ai')
  assert.ok(!(starlight.repoFallbacks || []).includes('../Starlight-Intelligence-System'))
  assert.ok(!config.placements.sites.some(site => site.label === 'publishing-house'))
  assert.ok(config.scanProfiles['multisite-estate'].mediaRoots.includes('../publishing-house'))
})
