#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createSchema, openVisDatabaseFile, openVisDatabaseReadOnly } from '../core/vis-core.mjs'
import { captureImages, exportCaptureIndex, MAX_MANIFEST_BYTES, normalizeCapture } from '../core/adapters/image-capture-adapter.mjs'
import { projectRuntimeImageRecords } from '../core/adapters/runtime-image-capture-adapter.mjs'

export function parseArgs(argv) {
  const result = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!['--manifest', '--runtime-input', '--records-root', '--db', '--media-root', '--out', '--index-out', '--execute', '--help'].includes(key)) throw new Error(`Unknown option: ${key}`)
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate option: ${key}`)
    if (key === '--execute' || key === '--help') result[key] = true
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value: ${key}`)
      result[key] = argv[++i]
    }
  }
  return result
}

function physicalPath(filename, depth = 0) {
  if (depth > 40) throw new Error('Too many symbolic links in capture paths')
  const absolute = path.resolve(filename)
  try { return fs.realpathSync(absolute) } catch (error) { if (error.code !== 'ENOENT') throw error }
  let ancestor = absolute
  const suffix = []
  while (true) {
    try {
      const stat = fs.lstatSync(ancestor)
      const resolved = stat.isSymbolicLink()
        ? physicalPath(path.resolve(path.dirname(ancestor), fs.readlinkSync(ancestor)), depth + 1)
        : fs.realpathSync(ancestor)
      return path.join(resolved, ...suffix)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    const parent = path.dirname(ancestor)
    if (parent === ancestor) throw new Error('Cannot resolve capture output parent')
    suffix.unshift(path.basename(ancestor))
    ancestor = parent
  }
}

function assertDistinctPaths(args, protectedPaths = []) {
  const identify = filename => {
    const resolved = physicalPath(filename)
    const stat = fs.existsSync(resolved) ? fs.statSync(resolved) : null
    return { resolved, inode: stat ? `${stat.dev}:${stat.ino}` : null }
  }
  const aliases = (a, b) => a.resolved === b.resolved || (a.inode && a.inode === b.inode)
  const identities = ['--manifest', '--runtime-input', '--db', '--out', '--index-out'].filter(key => args[key]).map(key => identify(args[key]))
  for (let i = 0; i < identities.length; i++) {
    for (const other of identities.slice(i + 1)) {
      if (aliases(identities[i], other)) {
        throw new Error('Manifest, database and output paths must be distinct (including aliases)')
      }
    }
  }
  const writable = ['--db', '--out', '--index-out'].filter(key => args[key]).map(key => identify(args[key]))
  for (const filename of protectedPaths) {
    const source = identify(filename)
    if (writable.some(target => aliases(source, target))) throw new Error('Source records/media and writable paths must be distinct (including aliases)')
  }
}

function writePrivateJson(filename, value) {
  fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true, mode: 0o700 })
  // Receipts are replaceable exports; committed batches in SQLite remain authoritative.
  // Replace the directory entry instead of following a destination symlink/hardlink.
  const temporary = path.join(path.dirname(path.resolve(filename)), `.image-capture-${crypto.randomUUID()}.tmp`)
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    fs.renameSync(temporary, filename)
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
}

export function main(argv) {
  const args = parseArgs(argv)
  if (args['--help']) {
    console.log('Usage: node scripts/image-capture.mjs (--manifest private/page.json | --runtime-input private/events.json --records-root private/records) --db private/vis.sqlite [--media-root authorized/files] [--out private/receipt.json] [--execute --index-out private/index.json]')
    return
  }
  if ((!args['--manifest'] && !args['--runtime-input']) || (args['--manifest'] && args['--runtime-input']) || !args['--db']) throw new Error('Exactly one of --manifest or --runtime-input, plus --db, is required')
  if (Boolean(args['--runtime-input']) !== Boolean(args['--records-root'])) throw new Error('--runtime-input and --records-root must be supplied together')
  if (args['--index-out'] && !args['--execute']) throw new Error('--index-out requires --execute; a dry-run has no committed index')
  assertDistinctPaths(args)
  const inputPath = args['--manifest'] || args['--runtime-input']
  if (fs.statSync(inputPath).size > MAX_MANIFEST_BYTES) throw new Error('Manifest exceeds 4 MiB')
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const manifest = args['--runtime-input'] ? projectRuntimeImageRecords(input, { recordsRoot: args['--records-root'] }) : normalizeCapture(input)
  const protectedPaths = args['--runtime-input'] ? input.records.map(record => path.resolve(args['--records-root'], record.record_path)) : []
  if (args['--media-root']) protectedPaths.push(...manifest.items.filter(item => item.local_path).map(item => path.resolve(args['--media-root'], item.local_path)))
  assertDistinctPaths(args, protectedPaths)
  let db
  if (args['--execute']) {
    fs.mkdirSync(path.dirname(path.resolve(args['--db'])), { recursive: true, mode: 0o700 })
    db = openVisDatabaseFile(args['--db'])
    fs.chmodSync(args['--db'], 0o600)
    createSchema(db)
  } else if (fs.existsSync(args['--db'])) db = openVisDatabaseReadOnly(args['--db'])
  else { db = new DatabaseSync(':memory:'); createSchema(db) }
  try {
    const receipt = captureImages(db, manifest, { execute: args['--execute'] === true, mediaRoot: args['--media-root'] })
    assertDistinctPaths(args, protectedPaths)
    if (args['--out']) writePrivateJson(args['--out'], receipt)
    if (args['--index-out']) writePrivateJson(args['--index-out'], exportCaptureIndex(db))
    console.log(JSON.stringify({ schema_version: receipt.schema_version, dry_run: receipt.dry_run, replayed: receipt.replayed, counts: receipt.counts, all_history_verified: false }))
    return receipt
  } finally { db.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)) }
  catch (error) { console.error(`Image capture failed: ${error.message}`); process.exitCode = 1 }
}
