import fs from 'node:fs'
import { openLibraryDatabase } from '../core/vis-library.mjs'
import { loadConfig } from '../core/vis-core.mjs'
import { recordVisualEvaluation } from '../core/vis-review.mjs'
const [project, policyFile, evaluationFile] = process.argv.slice(2)
if (!evaluationFile) throw Error('Usage: vis-record-critique.mjs PROJECT POLICY SIGNED_EVALUATION')
const db = openLibraryDatabase(project, loadConfig(project))
try {
  console.log(
    JSON.stringify(
      recordVisualEvaluation(
        db,
        JSON.parse(fs.readFileSync(policyFile)),
        JSON.parse(fs.readFileSync(evaluationFile)),
      ),
    ),
  )
} finally {
  db.close()
}
