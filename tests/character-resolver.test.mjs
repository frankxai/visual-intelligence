import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { resolveCharacter, normalize } from '../core/character-resolver.mjs'
import { ensureCached, cacheHas, cacheKey, cacheRead } from '../core/character-cache.mjs'

const FIXTURE = new URL('./fixtures/character-manifest.synthetic.json', import.meta.url).pathname
const opts = { manifestPath: FIXTURE, cache: { dir: mkdtempSync(join(tmpdir(), 'vis-char-cache-')) } }
const sha = s => createHash('sha256').update(s).digest('hex')

test('resolves name and alias to the same immutable identity id', async () => {
  const a = await resolveCharacter({ name: 'Test Fox' }, opts)
  const b = await resolveCharacter({ name: '  foxy TEST ' }, opts)
  assert.equal(a.status, 'resolved')
  assert.equal(a.identity_id, 'test.char.fox')
  assert.equal(b.identity_id, a.identity_id)
  assert.equal(b.matched_alias, 'Foxy Test')
  assert.equal(a.rights, 'unknown'); assert.equal(a.approval, 'unknown'); assert.equal(a.publish_authorized, false)
})

test('original is recovered bytes only; rejected lineages never positive', async () => {
  const r = await resolveCharacter({ name: 'Test Fox' }, opts)
  assert.deepEqual(r.positive_references.map(e => e.edition), ['v1'])
  assert.equal(r.positive_references[0].class, 'recovered_bytes')
  assert.equal(r.positive_references[0].sha256, sha('synthetic:test-fox:v1'))
  assert.deepEqual(r.proposals.map(e => e.edition), ['v2'])
  const rej = r.rejected_lineages.map(e => e.edition).sort()
  assert.deepEqual(rej, ['Fire v1', 'Unity v2'])
  assert.ok(r.rejected_lineages.every(e => e.use_as_positive_reference === false))
  assert.ok(r.conflicts.some(c => c.type === 'status_conflicts_with_rejected_lineage' && c.edition === 'Fire v1'))
  for (const p of r.positive_references) assert.ok(!r.rejected_lineages.some(x => x.sha256 === p.sha256))
})

test('reports locators, missing and conflicting references', async () => {
  const r = await resolveCharacter({ name: 'Test Fox' }, opts)
  assert.equal(r.positive_references[0].locators.drive_file_id, 'SYN_DRIVE_FOX_1')
  assert.equal(r.positive_references[0].locators.r2_key, null)
  assert.equal(r.positive_references[0].locators.cached, false)
  assert.ok(r.missing_references.some(m => m.type === 'not_accessible'))
  const twin = await resolveCharacter({ name: 'Twinny' }, opts)
  assert.ok(twin.conflicts.some(c => c.type === 'multiple_stable_ids'))
  assert.match(twin.identity_id, /^vis\.char\.[0-9a-f]{16}$/)
})

test('sha256 shared with a rejected lineage is withheld from positives', async () => {
  const r = await resolveCharacter({ name: 'Test Mole' }, opts)
  assert.equal(r.positive_references.length, 0)
  assert.ok(r.conflicts.some(c => c.type === 'sha256_shared_with_rejected_lineage'))
  assert.ok(r.missing_references.some(m => m.type === 'no_positive_reference'))
})

test('confusable aliases stay separate and are never merged', async () => {
  const a = await resolveCharacter({ name: 'Firo' }, opts)
  const b = await resolveCharacter({ name: 'Frio' }, opts)
  assert.equal(a.identity_name, 'Test Owl'); assert.equal(b.identity_name, 'Test Hare')
  assert.notEqual(a.identity_id, b.identity_id)
  assert.ok(a.warnings.some(w => w.type === 'confusable_alias_not_merged' && w.near.some(n => n.alias === 'Frio')))
  assert.equal(a.aliases.some(x => x.alias === 'Frio'), false)
  const fuzzy = await resolveCharacter({ name: 'Fiiro' }, opts)
  assert.equal(fuzzy.status, 'not_found')
})

test('ambiguous alias returns candidates and no references', async () => {
  const r = await resolveCharacter({ name: 'Shared' }, opts)
  assert.equal(r.status, 'ambiguous'); assert.equal(r.alias_candidates.length, 2)
  assert.equal(r.positive_references, undefined)
})

test('vendor guests are unofficial with rights pending', async () => {
  const r = await resolveCharacter({ name: 'Claude' }, opts)
  assert.equal(r.class, 'vendor-guest'); assert.equal(r.unofficial, true); assert.equal(r.rights, 'pending')
  assert.equal(r.approval, 'unknown')
})

test('manifest rights fields are ignored', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vis-char-m-'))
  const p = join(dir, 'm.json')
  writeFileSync(p, JSON.stringify([{ identity_name: 'Test Ox', stable_id: 'test.char.ox', sha256: sha('x'), drive_file_id: 'D', status: 'original', rights: 'owned', approval: 'approved' }]))
  const r = await resolveCharacter({ name: 'Test Ox' }, { manifestPath: p, cache: { dir } })
  assert.equal(r.rights, 'unknown'); assert.equal(r.approval, 'unknown')
})

test('unresolved without manifest; unknown name is not invented', async () => {
  assert.equal((await resolveCharacter({ name: 'Test Fox' }, { manifestPath: join(tmpdir(), 'nope.json') })).status, 'unresolved')
  assert.equal((await resolveCharacter({ name: 'Nobody' }, opts)).status, 'not_found')
  assert.equal((await resolveCharacter({}, opts)).reason, 'name_required')
  assert.equal(normalize('Ünï-Café'), 'uni cafe')
})

test('content-addressed cache never fetches the same bytes twice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vis-char-cache-'))
  const bytes = Buffer.from('synthetic bytes'); const h = sha(bytes)
  let calls = 0
  const fetcher = async () => { calls++; return bytes }
  const first = await ensureCached(dir, h, fetcher)
  const second = await ensureCached(dir, h, fetcher)
  assert.equal(calls, 1); assert.equal(first.fetched, true); assert.equal(second.fetched, false)
  assert.ok(await cacheHas(dir, h)); assert.equal(readFileSync(first.path).toString(), 'synthetic bytes')
  assert.ok(first.path.endsWith(cacheKey(h)))
  await assert.rejects(ensureCached(dir, sha('other'), async () => bytes), /sha256_mismatch/)
  assert.equal(await cacheHas(dir, sha('other')), false)
  const r = await resolveCharacter({ name: 'Test Fox' }, { manifestPath: FIXTURE, cache: { dir } })
  assert.equal(r.positive_references[0].locators.cached, false)
})

test('cached sha256 shows a local cache path in the receipt', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vis-char-cache-'))
  const bytes = 'synthetic:test-fox:v1'
  await ensureCached(dir, sha(bytes), async () => Buffer.from(bytes))
  const r = await resolveCharacter({ name: 'Test Fox' }, { manifestPath: FIXTURE, cache: { dir } })
  assert.equal(r.positive_references[0].locators.cached, true)
  assert.ok(existsSync(r.positive_references[0].locators.local_cache_path))
})

test('CLI resolves from VIS_CHARACTER_MANIFEST and exits 3 when unresolved', () => {
  const env = { ...process.env, VIS_CHARACTER_MANIFEST: FIXTURE }
  const ok = spawnSync(process.execPath, ['bin/vis-character.mjs', '--name', 'Tfx'], { encoding: 'utf8', env })
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(JSON.parse(ok.stdout).identity_id, 'test.char.fox')
  const bad = spawnSync(process.execPath, ['bin/vis-character.mjs', '--name', 'Nobody'], { encoding: 'utf8', env })
  assert.equal(bad.status, 3)
})

test('MCP tool visual.character.resolve is advertised and resolves', () => {
  const call = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, params })
  const input = [call(1, 'tools/list', {}), call(2, 'tools/call', { name: 'visual.character.resolve', arguments: { name: 'Test Fox' } })].join('\n') + '\n'
  const r = spawnSync(process.execPath, ['mcp/vis-mcp-server.mjs'], { input, encoding: 'utf8', env: { ...process.env, VIS_CHARACTER_MANIFEST: FIXTURE } })
  assert.equal(r.status, 0, r.stderr)
  const rows = r.stdout.trim().split('\n').map(JSON.parse)
  assert.ok(rows.find(x => x.id === 1).result.tools.some(t => t.name === 'visual.character.resolve'))
  const out = JSON.parse(rows.find(x => x.id === 2).result.content[0].text)
  assert.equal(out.identity_id, 'test.char.fox'); assert.equal(out.rights, 'unknown')
})

test('rejected lineage terms split across fields are still rejected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vis-char-m-'))
  const p = join(dir, 'm.json')
  const row = o => ({ identity_name: 'Test Ox', stable_id: 'test.char.ox', drive_file_id: 'D', status: 'original', ...o })
  writeFileSync(p, JSON.stringify([
    row({ family: 'Arcanea', edition: 'Fire', sha256: sha('a') }),
    row({ family: 'Unity', edition: 'v1', sha256: sha('b') }),
    row({ family: 'Unity', edition: 'V2', sha256: sha('c') }),
    row({ family: 'Test Family', edition: 'v1', sha256: sha('d') }),
  ]))
  const r = await resolveCharacter({ name: 'Test Ox' }, { manifestPath: p, cache: { dir } })
  assert.equal(r.rejected_lineages.length, 3)
  assert.deepEqual(r.positive_references.map(e => e.sha256), [sha('d')])
})

test('cache read verifies the hash; a corrupt file is a miss and is re-fetched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vis-char-cache-'))
  const bytes = Buffer.from('good bytes'); const h = sha(bytes)
  const { path } = await ensureCached(dir, h, async () => bytes)
  writeFileSync(path, 'corrupted')
  assert.equal(await cacheHas(dir, h), false)
  await assert.rejects(cacheRead(dir, h), /cache_corrupt/)
  let calls = 0
  const again = await ensureCached(dir, h, async () => { calls++; return bytes })
  assert.equal(calls, 1); assert.equal(again.fetched, true)
  assert.equal((await cacheRead(dir, h)).toString(), 'good bytes')
})
