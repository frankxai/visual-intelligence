import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import sharp from 'sharp'
import { observePlacements, listPlacements } from '../core/vis-placements.mjs'
import { ingestLibrary, openLibraryDatabase, listLibrary, getLibraryAsset } from '../core/vis-library.mjs'
import { loadConfig } from '../core/vis-core.mjs'

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })

async function png(file, color) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await sharp({ create: { width: 40, height: 30, channels: 3, background: color } }).png().toFile(file)
}

async function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-placements-'))
  const project = path.join(base, 'project')
  const site = path.join(base, 'site')
  const assets = path.join(base, 'assets')
  fs.mkdirSync(project, { recursive: true })
  fs.mkdirSync(site, { recursive: true })
  git(site, 'init', '-q', '-b', 'main')
  git(site, 'config', 'user.email', 't@example.com')
  git(site, 'config', 'user.name', 'test')
  await png(path.join(site, 'public', 'images', 'hero one.png'), { r: 200, g: 10, b: 10 })
  await png(path.join(site, 'public', 'images', 'logo.png'), { r: 10, g: 200, b: 10 })
  fs.writeFileSync(path.join(site, 'public', 'robots.txt'), 'x')
  await png(path.join(site, 'src', 'not-served.png'), { r: 1, g: 2, b: 3 })
  git(site, 'add', '-A')
  git(site, 'commit', '-q', '-m', 'init')
  // The library holds the same bytes as the live hero.
  fs.mkdirSync(assets, { recursive: true })
  fs.copyFileSync(path.join(site, 'public', 'images', 'hero one.png'), path.join(assets, 'hero-master.png'))
  fs.writeFileSync(path.join(project, 'vis.config.json'), JSON.stringify({
    library: { roots: [{ label: 'assets', path: assets }], minFreeDiskGB: 0 },
    placements: { sites: [{ label: 'test.site', repo: site, ref: 'main', webRoot: 'public', publicBase: 'https://test.site' }] },
  }))
  return { project, site, assets }
}

test('observe reads the deploy ref only, records URLs, and links library assets', async () => {
  const fx = await fixture()
  await ingestLibrary({ root: fx.project, execute: true })
  // Working-copy and other-branch files must not count as live.
  await png(path.join(fx.site, 'public', 'images', 'uncommitted.png'), { r: 9, g: 9, b: 200 })
  git(fx.site, 'checkout', '-q', '-b', 'feature')
  await png(path.join(fx.site, 'public', 'images', 'branch-only.png'), { r: 50, g: 50, b: 50 })
  git(fx.site, 'add', 'public/images/branch-only.png')
  git(fx.site, 'commit', '-q', '-m', 'branch')

  const plan = await observePlacements({ root: fx.project })
  assert.equal(plan.dryRun, true)
  assert.equal(plan.sites[0].mediaFiles, 2, 'only committed media under public/ on the deploy ref')

  const run = await observePlacements({ root: fx.project, execute: true })
  const s = run.sites[0]
  assert.equal(s.live, 2)
  assert.equal(s.hashed, 2)
  assert.equal(s.libraryAssetsLive, 1)
  assert.ok(fs.existsSync(run.receiptPath))

  const db = openLibraryDatabase(fx.project, loadConfig(fx.project))
  try {
    const urls = listPlacements(db).map(p => p.url).sort()
    assert.deepEqual(urls, ['https://test.site/images/hero%20one.png', 'https://test.site/images/logo.png'])
    const asset = listLibrary(db).assets[0]
    assert.equal(asset.live_placements, 1)
    const detail = getLibraryAsset(db, asset.asset_id)
    assert.equal(detail.placements[0].url, 'https://test.site/images/hero%20one.png')
    assert.equal(detail.rights_status, 'unknown', 'observing a placement never changes rights')
    assert.ok(detail.events.some(e => e.event_type === 'placement-observed'))
  } finally { db.close() }
})

test('re-observe hashes nothing new; a removed file becomes gone, history kept', async () => {
  const fx = await fixture()
  await observePlacements({ root: fx.project, execute: true })
  const again = await observePlacements({ root: fx.project, execute: true })
  assert.equal(again.sites[0].hashed, 0, 'git blob ids are content hashes, so nothing is re-hashed')
  assert.equal(again.sites[0].added, 0)

  git(fx.site, 'rm', '-q', 'public/images/logo.png')
  git(fx.site, 'commit', '-q', '-m', 'remove logo')
  const after = await observePlacements({ root: fx.project, execute: true })
  assert.equal(after.sites[0].gone, 1)
  assert.equal(after.sites[0].live, 1)
  const db = openLibraryDatabase(fx.project, loadConfig(fx.project))
  try {
    assert.equal(listPlacements(db, { status: 'gone' }).length, 1)
    assert.equal(listPlacements(db, { status: 'all' }).length, 2)
  } finally { db.close() }
})

test('a missing ref or repo is reported, not thrown', async () => {
  const fx = await fixture()
  const cfg = JSON.parse(fs.readFileSync(path.join(fx.project, 'vis.config.json'), 'utf8'))
  cfg.placements.sites.push({ label: 'nope', repo: path.join(fx.project, 'missing'), ref: 'main', publicBase: 'https://x' })
  cfg.placements.sites.push({ label: 'badref', repo: fx.site, ref: 'origin/does-not-exist', publicBase: 'https://y' })
  fs.writeFileSync(path.join(fx.project, 'vis.config.json'), JSON.stringify(cfg))
  const run = await observePlacements({ root: fx.project })
  assert.match(run.sites.find(s => s.site === 'nope').error, /not a git repository/)
  assert.match(run.sites.find(s => s.site === 'badref').error, /ref not found/)
})
