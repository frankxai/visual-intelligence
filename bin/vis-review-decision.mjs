#!/usr/bin/env node
// Offline reviewer tool. The web server never needs signing material.
import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { reviewActions } from '../core/vis-review.mjs'

const [verb, claimsFile, keyFile] = process.argv.slice(2)
if (verb !== 'sign' || !claimsFile || !keyFile) {
  console.error('Usage: node bin/vis-review-decision.mjs sign reviewed-claims.json human-private-key.pem')
  process.exitCode = 2
} else {
  const claims = JSON.parse(readFileSync(claimsFile, 'utf8'))
  if (claims.protocol !== 'vis.review/1' || !reviewActions.includes(claims.action))
    throw new Error('unknown review instruction')
  const key = createPrivateKey(readFileSync(keyFile))
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Ed25519 signing key required')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  process.stdout.write(payload + '.' + sign(null, Buffer.from(payload), key).toString('base64url') + '\n')
}
