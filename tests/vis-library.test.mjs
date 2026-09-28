import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import {
  decideProposal,
  getLibraryAsset,
  ingestLibrary,
  listLibrary,
  listProposals,
  openLibraryDatabase,
  proposalStats,
  proposeForAsset,
  renditionPath,
  resolveLibraryRoots,
  setRights,
  suggestProposals,
} from '../core/vis-library.mjs'
import { loadConfig } from '../core/vis-core.mjs'

async function png(file, { width = 64, height = 48, color = { r: 200, g: 40, b: 90 } } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await sharp({ create: { width, height, channels: 3, background: color } }).png().toFile(file)
}

async function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-library-'))
  const project = path.join(base, 'project')
  const assets = path.join(base, 'brand-assets')
  const inbox = path.join(base, '_inbox')
  const outside = path.join(base, 'outside')
  fs.mkdirSync(project, { recursive: true })
  await png(path.join(assets, 'gencreator', 'hero.png'))
  await png(path.join(assets, 'gencreator', 'hero-copy.png')) // same bytes as hero.png
  await png(path.join(assets, 'arcanea', 'wide.png'), { width: 2400, height: 1000, color: { r: 20, g: 80, b: 200 } })
  await png(path.join(assets, 'receipts', 'thumbs', 'must-not-index.png'), { color: { r: 1, g: 2, b: 3 } })
  await png(path.join(inbox, 'drop.png'), { color: { r: 10, g: 200, b: 10 } })
  await png(path.join(outside, 'secret.png'), { color: { r: 9, g: 9, b: 9 } })
  const config = {
    indexPath: 'data/vis.sqlite',
    registryPath: 'data/visual-registry.json',
    atlasPath: 'data/vis-atlas.json',
    library: {
      roots: [
        { label: 'brand-assets', path: assets, exclude: ['receipts'] },
        { label: 'inbox', path: inbox },
      ],
      renditionsDir: 'data/renditions',
      receiptsDir: 'data/receipts',
      minFreeDiskGB: 0,
    },
  }
  fs.writeFileSync(path.join(project, 'vis.config.json'), JSON.stringify(config, null, 2))
  return { base, project, assets, inbox, outside }
}

test('dry run plans declared roots only and writes nothing', async () => {
  const fx = await fixture()
  const result = await ingestLibrary({ root: fx.project })
  assert.equal(result.dryRun, true)
  assert.equal(result.planned, 4)
  for (const item of result.plan) {
    assert.ok(item.path.startsWith(fx.assets) || item.path.startsWith(fx.inbox), `outside root: ${item.path}`)
    assert.ok(!item.path.includes(`${path.sep}receipts${path.sep}`), 'excluded folder was walked')
    assert.ok(!item.path.startsWith(fx.outside), 'sibling folder was walked')
  }
  const db = openLibraryDatabase(fx.project, loadConfig(fx.project))
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM asset').get().c, 0)
  } finally { db.close() }
})

test('execute files hashes, renditions, thumbhash, rights unknown, and a receipt', async () => {
  const fx = await fixture()
  const result = await ingestLibrary({ root: fx.project, execute: true })
  assert.equal(result.filed, 4)
  assert.equal(result.newAssets, 3, 'hero-copy.png is the same bytes as hero.png')
  assert.equal(result.duplicatesOfKnownHash, 1)
  assert.equal(result.uploaded, false)
  assert.ok(fs.existsSync(result.receiptPath))

  const db = openLibraryDatabase(fx.project, loadConfig(fx.project))
  try {
    const listed = listLibrary(db)
    assert.equal(listed.total, 3)
    for (const asset of listed.assets) {
      assert.equal(asset.rights_status, 'unknown')
      assert.ok(asset.thumbhash && asset.thumbhash.length < 64, 'thumbhash stored in the row')
      const thumb = renditionPath(fx.project, db, asset.asset_id, 'thumb')
      const head = fs.readFileSync(thumb).subarray(0, 12).toString('latin1')
      assert.ok(head.startsWith('RIFF') && head.endsWith('WEBP'), 'thumb is a WebP')
      assert.ok(asset.thumb_width <= 320 && asset.thumb_height <= 320)
    }
    const wide = listed.assets.find(a => a.title === 'wide')
    const preview = db.prepare("SELECT width FROM asset_rendition WHERE asset_id = ? AND kind = 'preview'").get(wide.asset_id)
    assert.equal(preview.width, 1600)
    const hero = listed.assets.find(a => a.title === 'hero' || a.title === 'hero-copy')
    assert.equal(hero.location_count, 2, 'one hash, two location rows')
    assert.equal(renditionPath(fx.project, db, hero.asset_id, 'master'), null, 'master is never a rendition')
  } finally { db.close() }
})

test('second run skips unchanged files and never duplicates a hash', async () => {
  const fx = await fixture()
  await ingestLibrary({ root: fx.project, execute: true })
  const again = await ingestLibrary({ root: fx.project, execute: true })
  assert.equal(again.filed, 0)
  assert.equal(again.unchanged, 4)
  await png(path.join(fx.inbox, 'later.png'), { color: { r: 250, g: 250, b: 0 } })
  const third = await ingestLibrary({ root: fx.project, execute: true })
  assert.equal(third.filed, 1)
  const db = openLibraryDatabase(fx.project, loadConfig(fx.project))
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM asset').get().c, 4)
    assert.equal(db.prepare('SELECT COUNT(DISTINCT sha256) AS c FROM asset_rendition').get().c, 4)
  } finally { db.close() }
})

test('limit caps a run and reports truncation', async () => {
  const fx = await fixture()
  const first = await ingestLibrary({ root: fx.project, execute: true, limit: 2 })
  assert.equal(first.filed, 2)
  assert.equal(first.truncated, true)
  const rest = await ingestLibrary({ root: fx.project, execute: true, limit: 2 })
  assert.equal(rest.filed, 2)
  assert.equal(rest.truncated, false)
})

test('proposals: accept applies, dismiss records, rights need a person, nothing publishes', async () => {
  const fx = await fixture()
  await ingestLibrary({ root: fx.project, execute: true })
  const db = openLibraryDatabase(fx.project, loadConfig(fx.project))
  try {
    const [asset] = listLibrary(db).assets
    const dry = proposeForAsset(db, { assetId: asset.asset_id, kind: 'rank', payload: { rating: 4 } })
    assert.equal(dry.dryRun, true)
    assert.equal(listProposals(db).length, 0)

    const rank = proposeForAsset(db, { assetId: asset.asset_id, kind: 'rank', rule: 'test-rank', payload: { rating: 4 }, execute: true })
    const tags = proposeForAsset(db, { assetId: asset.asset_id, kind: 'tags', rule: 'test-tags', payload: { tags: ['Hero', 'hero', 'wide'] }, execute: true })
    const rights = proposeForAsset(db, { assetId: asset.asset_id, kind: 'rights', rule: 'test-rights', payload: { rights: 'owned' }, execute: true })
    assert.equal(proposeForAsset(db, { assetId: asset.asset_id, kind: 'rank', rule: 'test-rank', payload: { rating: 4 }, execute: true }).duplicate, true)
    assert.throws(() => proposeForAsset(db, { assetId: asset.asset_id, kind: 'publish', payload: {} }), /Unknown proposal kind/)

    decideProposal(db, { proposalId: rank.proposal.proposalId, decision: 'accepted', execute: true })
    decideProposal(db, { proposalId: tags.proposal.proposalId, decision: 'dismissed', execute: true })
    const refused = decideProposal(db, { proposalId: rights.proposal.proposalId, decision: 'accepted', execute: true })
    assert.equal(refused.refused, true)

    const detail = getLibraryAsset(db, asset.asset_id)
    assert.equal(detail.annotation.rating, 4)
    assert.equal(detail.rights_status, 'unknown')
    assert.equal(detail.publications.length, 0, 'accept never publishes')
    assert.equal(detail.publish_gate.allowed, false, 'unknown rights cannot publish')
    assert.ok(detail.events.some(e => e.event_type === 'proposal-accepted'))
    assert.ok(detail.events.some(e => e.event_type === 'proposal-dismissed'))

    decideProposal(db, { proposalId: rights.proposal.proposalId, decision: 'accepted', execute: true, allowRights: true, decidedBy: 'frank' })
    assert.equal(getLibraryAsset(db, asset.asset_id).rights_status, 'owned')
  } finally { db.close() }
})

test('proposer learns: a rule dismissed 5 of 5 times is muted', async () => {
  const fx = await fixture()
  for (let i = 0; i < 5; i++) await png(path.join(fx.assets, `set-${i}`, 'x.png'), { color: { r: 30 + i, g: 30, b: 30 } })
  await ingestLibrary({ root: fx.project, execute: true })
  const config = loadConfig(fx.project)
  const roots = resolveLibraryRoots(fx.project, config)
  const db = openLibraryDatabase(fx.project, config)
  try {
    const first = suggestProposals(db, { roots, execute: true })
    assert.ok(first.proposed.length >= 5)
    assert.ok(first.proposed.every(p => /^(brand-assets|inbox)\/[^/]+(\/[^/]+)?$/.test(p.proposal.payload.name)))
    for (const p of listProposals(db)) decideProposal(db, { proposalId: p.proposal_id, decision: 'dismissed', execute: true })
    const stat = proposalStats(db).find(s => s.rule === 'folder-set')
    assert.equal(stat.muted, true)
    await png(path.join(fx.inbox, 'new-folder', 'n.png'), { color: { r: 1, g: 250, b: 250 } })
    await ingestLibrary({ root: fx.project, execute: true })
    assert.equal(suggestProposals(db, { roots, execute: true }).muted, true)
  } finally { db.close() }
})

test('setRights rejects unknown values', async () => {
  const fx = await fixture()
  await ingestLibrary({ root: fx.project, execute: true })
  const db = openLibraryDatabase(fx.project, loadConfig(fx.project))
  try {
    const [asset] = listLibrary(db).assets
    assert.throws(() => setRights(db, { assetId: asset.asset_id, rights: 'public-domain-probably' }), /Unknown rights value/)
  } finally { db.close() }
})
