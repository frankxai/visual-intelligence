import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderVisualTruths, visualTruthGroups } from '../web/visual-truths.mjs'
const curation = JSON.parse(readFileSync(new URL('../docs/character-canon/character-curation.v1.json', import.meta.url), 'utf8'))

test('projection preserves every source exactly once without changing states', () => {
  const before = JSON.stringify(curation)
  const all = visualTruthGroups(curation).flatMap(g => g.assets)
  assert.equal(all.length, 121)
  assert.equal(new Set(all.map(a => a.asset_id)).size, 121)
  assert.deepEqual(all.map(a => a.asset_id).sort(), curation.asset_decisions.map(a => a.asset_id).sort())
  const html = renderVisualTruths(curation)
  assert.equal(JSON.stringify(curation), before)
  assert.match(html, /Artwork previews are not loaded/)
  assert.match(html, /remain proposed assignments/)
  assert.equal(curation.primary_specialists.every(s => s.role_status === 'proposed_not_approved'), true)
  assert.deepEqual(curation.reference_selection_contract.default_editorial_pool, ['established_identity_anchor'])
  assert.doesNotMatch(html, /<img|<script|<form/)
})

test('all recorded artwork links are exact Figma node links', () => {
  const html = renderVisualTruths(curation)
  for (const a of curation.asset_decisions) {
    assert.ok(html.includes(`node-id=${a.figma_image_node_id.replace(':', '-')}`))
  }
  assert.match(html, /SL-C020-chord/)
  assert.match(html, /anime-mira-native/)
  assert.match(html, /hold_do_not_default/)
})

test('untrusted metadata is escaped and malformed destinations are not linked', () => {
  const attack = structuredClone(curation)
  attack.asset_decisions[0].reason = '<script>alert(1)</script>'
  attack.asset_decisions[0].figma_image_node_id = '1:2" onclick="evil()'
  const html = renderVisualTruths(attack, { figma_file_key: 'x" onmouseover="evil()' })
  assert.ok(html.includes('&lt;script&gt;'))
  assert.doesNotMatch(html, /<script>|onclick=|onmouseover=/)
  assert.match(html, /Source link unavailable/)
})

test('future unclassified sources remain discoverable', () => {
  const c = structuredClone(curation)
  c.asset_decisions.push({ asset_id: 'new-source', editorial_bucket: 'unclassified', source_state: 'unknown' })
  const groups = visualTruthGroups(c)
  assert.equal(groups.at(-1).assets[0].asset_id, 'new-source')
  assert.equal(groups.flatMap(g => g.assets).length, 122)
})
