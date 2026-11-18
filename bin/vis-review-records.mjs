#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { openVisDatabaseReadOnly } from '../core/vis-core.mjs'
import { exportReviewAudit, loadReviewContext } from '../core/vis-review.mjs'
import { prepareReviewHandoff } from '../core/vis-review-handoff.mjs'

const [operation, index, configFile, assetId, placementFile] = process.argv.slice(2)
if (
  !['audit', 'handoff'].includes(operation) ||
  !index ||
  !configFile ||
  (operation === 'handoff' && (!assetId || !placementFile))
) {
  throw new Error(
    'Usage: vis-review-records.mjs audit INDEX CONFIG | handoff INDEX CONFIG ASSET PLACEMENT.json'
  )
}
const db = openVisDatabaseReadOnly(index)
try {
  const context = loadReviewContext(configFile)
  const result =
    operation === 'audit'
      ? exportReviewAudit(db, context)
      : prepareReviewHandoff(db, context, assetId, JSON.parse(readFileSync(placementFile, 'utf8')))
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
} finally {
  db.close()
}
