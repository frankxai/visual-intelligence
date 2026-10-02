import test from 'node:test'
import assert from 'node:assert/strict'
import { planVercelBlobUpload } from '../core/adapters/vercel-blob-adapter.mjs'

test('Blob names carry the content hash so same-named files never collide', () => {
  const plan = planVercelBlobUpload([
    { asset_id: 'a', primary_path: 'brand/a/hero.png', category: 'heroes', sha256: 'aaaaaaaaaaaa1111', approval_status: 'approved' },
    { asset_id: 'b', primary_path: 'brand/b/hero.png', category: 'heroes', sha256: 'bbbbbbbbbbbb2222', approval_status: 'approved' },
  ], { brand: 'frankx' })
  const names = plan.items.map(i => i.pathname)
  assert.deepEqual(names, ['frankx/heroes/aaaaaaaaaaaa-hero.png', 'frankx/heroes/bbbbbbbbbbbb-hero.png'])
  assert.equal(new Set(names).size, 2)
})

test('an asset without a hash is flagged, not silently trusted', () => {
  const plan = planVercelBlobUpload([{ asset_id: 'c', primary_path: 'x/logo.png', category: 'logos', approval_status: 'approved' }])
  assert.ok(plan.items[0].warnings.some(w => /collision-safe/.test(w)))
})
