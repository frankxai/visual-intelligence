import test from 'node:test'
import assert from 'node:assert/strict'
import { routeAssetDestination } from '../core/adapters/upload-router.mjs'

test('an unlabelled file stays on the machine', () => {
  const route = routeAssetDestination({
    asset_id: 'x',
    category: 'experiments',
    primary_path: 'notes/sketch.png',
    tags: [],
  })
  assert.equal(route.brand, 'unassigned')
  assert.equal(route.primary, 'local')
  assert.deepEqual(route.destinations, [])
})

test('a Starlight category is not labelled FrankX', () => {
  const route = routeAssetDestination({
    asset_id: 's',
    category: 'Starlight-Intelligence-System',
    primary_path: 'map.png',
    tags: [],
  })
  assert.equal(route.brand, 'starlight')
  assert.equal(route.primary, 'cloudflare-r2')
})
