import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = new URL('../docs/character-canon/sprite-origin-catalog.v1.json', import.meta.url)
const catalog = JSON.parse(readFileSync(source, 'utf8'))
const vendor = catalog.provider_sprite_sheets
const local = catalog.local_pet_skins
const names = [...vendor, ...local].map(item => item.identity_id)

test('sprite origin catalog has exactly thirteen unique source identities', () => {
  assert.equal(catalog.schema_version, 'vis-sprite-origin-catalog/v1')
  assert.equal(catalog.scope, 'source-intelligence-not-binary-ingestion')
  assert.equal(vendor.length, 8)
  assert.equal(local.length, 5)
  assert.equal(new Set(names).size, 13)
})

test('Codex sprite declarations are external with no fabricated binary or approval receipts', () => {
  const expected = ['codex', 'dewey', 'fireball', 'rocky', 'seedy', 'stacky', 'bsod', 'null-signal']
  assert.deepEqual(vendor.map(item => item.upstream_id), expected)
  for (const item of vendor) {
    assert.equal(item.owner_class, 'vendor_openai')
    assert.equal(item.declared_filename, item.upstream_id + '-spritesheet-v4.webp')
    assert.equal(item.source_status, 'upstream_catalog_verified')
    assert.equal(item.asset_status, 'not_ingested')
    assert.equal(item.binary_sha256, null)
    assert.equal(item.measured_geometry, null)
    assert.equal(item.version_approval, null)
    assert.notEqual(item.rights_status, 'approved')
    const f = item.declared_frame_geometry, s = item.declared_sheet_geometry
    assert.equal(f.frame_width, 192)
    assert.equal(f.frame_height, 208)
    assert.equal(f.columns, 8)
    assert.equal(f.rows, 9)
    assert.equal(s.width, f.frame_width * f.columns)
    assert.equal(s.height, f.frame_height * f.rows)
  }
})

test('local skins are procedural Canvas definitions, not counterfeit sprite sheets', () => {
  const expected = ['stellaris', 'arcanea_luminor', 'cyber_bot', 'kuro_neko', 'starlight_queen']
  assert.deepEqual(local.map(item => item.skin_selector), expected)
  for (const item of local) {
    assert.equal(item.owner_class, 'product_defined')
    assert.equal(item.renderer_type, 'procedural_canvas_2d')
    assert.equal(item.renderer_function_declared, true)
    assert.equal(item.sprite_sheet_file, null)
    assert.equal(item.binary_sha256, null)
    assert.equal(item.version_approval, null)
    assert.notEqual(item.rights_status, 'approved')
  }
})

test('extra codex_bot renderer is not misrepresented as an official OpenAI sprite or exposed selector', () => {
  const extra = catalog.additional_renderer_paths.find(x => x.id === 'codex_bot')
  assert.ok(extra)
  assert.equal(extra.branch_observed, true)
  assert.equal(extra.method_declared, true)
  assert.equal(extra.selector_documented_in_readme, false)
  assert.equal(extra.policy, 'do_not_conflate_with_openai_codex_official_webp')
  assert.equal(names.includes(extra.id), false)
})
