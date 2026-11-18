// Owner-side only. Inspect the complete decision/manifest before signing.
import fs from 'node:fs'
import { createPrivateKey, sign } from 'node:crypto'
import { decisionBytes } from '../core/vis-review.mjs'
import { manifestBytes } from '../core/vis-intake.mjs'
const [kind, input, keyFile, output] = process.argv.slice(2)
if (!['manifest', 'decision'].includes(kind) || !output)
  throw Error('Usage: vis-sign-scope.mjs manifest|decision INPUT OWNER_KEY OUTPUT')
const payload = JSON.parse(fs.readFileSync(input, 'utf8'))
const key = createPrivateKey(fs.readFileSync(keyFile))
if (key.asymmetricKeyType !== 'ed25519') throw Error('Ed25519 required')
const bytes = kind === 'decision' ? decisionBytes(payload) : manifestBytes(payload)
fs.writeFileSync(
  output,
  JSON.stringify({ [kind]: payload, signature: sign(null, bytes, key).toString('base64url') }, null, 2),
  { flag: 'wx', mode: 0o600 },
)
