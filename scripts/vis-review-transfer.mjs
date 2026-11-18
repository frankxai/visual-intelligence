// Offline owner command. Re-importing evidence carries no reviewer capabilities.
import fs from 'node:fs'
import path from 'node:path'
import { openLibraryDatabase } from '../core/vis-library.mjs'
import { loadConfig } from '../core/vis-core.mjs'
import { exportOriginal, importOriginal } from '../core/vis-intake.mjs'
const [mode, project, policyFile, objectRoot, bundle, eventId] = process.argv.slice(2)
if (
  !['import', 'export'].includes(mode) ||
  !bundle ||
  !project ||
  !objectRoot ||
  !policyFile ||
  (mode === 'export' && !eventId)
)
  throw Error(
    'Usage: vis-review-transfer.mjs import|export PROJECT POLICY OBJECT_ROOT BUNDLE [INTAKE_EVENT_ID]',
  )
const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8')),
  db = openLibraryDatabase(project, loadConfig(project))
try {
  const result =
    mode === 'import'
      ? await importOriginal({
          db,
          project,
          policy,
          objectRoot,
          file: path.join(bundle, 'original'),
          envelope: JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8')),
        })
      : await exportOriginal({ db, policy, objectRoot, eventId, directory: bundle })
  console.log(JSON.stringify(result ?? { exported: true }))
} finally {
  db.close()
}
