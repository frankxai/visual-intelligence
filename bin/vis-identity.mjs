#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolveVisualIdentity } from '../core/visual-identity.mjs'
let query
try { query = JSON.parse(readFileSync(0, 'utf8')) } catch { /* invalid request */ }
const receipt = await resolveVisualIdentity(query)
console.log(JSON.stringify(receipt))
process.exitCode = receipt.status === 'resolved' ? 0 : 3
