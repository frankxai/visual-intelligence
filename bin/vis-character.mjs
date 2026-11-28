#!/usr/bin/env node
// Usage: VIS_CHARACTER_MANIFEST=<path> node bin/vis-character.mjs --name "<name or alias>"
import { resolveCharacter } from '../core/character-resolver.mjs'
const i = process.argv.indexOf('--name')
const name = i > 0 ? process.argv[i + 1] : undefined
const receipt = await resolveCharacter({ name })
console.log(JSON.stringify(receipt, null, 2))
process.exitCode = receipt.status === 'resolved' ? 0 : 3
