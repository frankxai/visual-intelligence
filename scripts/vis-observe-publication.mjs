import fs from 'node:fs'
import { openLibraryDatabase } from '../core/vis-library.mjs'
import { loadConfig } from '../core/vis-core.mjs'
import { bindReview, observePublication } from '../core/vis-review.mjs'
const [project, policyFile, receiptFile] = process.argv.slice(2)
if (!receiptFile) throw Error('Usage: vis-observe-publication.mjs PROJECT POLICY SIGNED_PROVIDER_RECEIPT')
const policy = JSON.parse(fs.readFileSync(policyFile)),
  db = openLibraryDatabase(project, loadConfig(project))
try {
  bindReview(db, policy.workspace)
  console.log(JSON.stringify(observePublication(db, policy, JSON.parse(fs.readFileSync(receiptFile)))))
} finally {
  db.close()
}
