import test from 'node:test'
import assert from 'node:assert/strict'
import { scanUsageOnly } from '../core/vis-core.mjs'

test('usage scan refuses to delete page links unless replaceUsage is set', () => {
  assert.throws(() => scanUsageOnly({ root: 'C:/missing-vis-root' }), /Refusing to delete usage edges/)
})
