#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'
import { loadDamStoragePolicy, planDamRollout } from '../core/dam-storage-policy.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

function usage() {
  return `VIS DAM rollout planner

Produces a deterministic plan only. It cannot upload, delete, publish, change DNS,
create credentials, or mutate Cloudflare, Vercel, Drive, GitHub, or VIS.

Usage:
  node scripts/plan-dam-rollout.mjs [options]

Options:
  --db <path>                 VIS SQLite database (default: data/vis.sqlite)
  --policy <path>             DAM policy JSON (default: config/dam-storage-policy.json)
  --brand <key>               Limit the plan to one classified brand
  --limit <number>            Limit selected assets
  --review-queue              Prioritize critical identity, hero, proof, cover, and social assets
  --per-brand <number>        Per-brand cap for --review-queue (default: 20)
  --include-absolute-paths     Include local absolute paths in the output
  --summary                   Emit counts and byte totals without item rows
  --out <path>                Manifest destination; requires --write-plan
  --write-plan                Allow writing the JSON plan file (never provider data)
  --help                      Show this help

The intentionally unsupported --execute flag fails closed. Provider execution must
be implemented as a separate checksum-verifying adapter with explicit approval.`
}

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') result.help = true
    else if (arg === '--write-plan') result.writePlan = true
    else if (arg === '--include-absolute-paths') result.includeAbsolutePaths = true
    else if (arg === '--summary') result.summary = true
    else if (arg === '--review-queue') result.reviewQueue = true
    else if (arg === '--execute') result.execute = true
    else if (['--db', '--policy', '--brand', '--limit', '--per-brand', '--out'].includes(arg)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      result[arg.slice(2)] = value
      index += 1
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  return result
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  if (args.execute) throw new Error('--execute is intentionally unsupported; this command is plan-only')
  if (args.out && !args.writePlan) throw new Error('--out requires --write-plan to make the local manifest write explicit')
  if (args.writePlan && !args.out) throw new Error('--write-plan requires --out <path>')

  const databasePath = path.resolve(args.db || path.join(repoRoot, 'data', 'vis.sqlite'))
  const policyPath = path.resolve(args.policy || path.join(repoRoot, 'config', 'dam-storage-policy.json'))
  if (!fs.existsSync(databasePath)) throw new Error(`VIS database not found: ${databasePath}`)
  if (!fs.existsSync(policyPath)) throw new Error(`DAM storage policy not found: ${policyPath}`)

  const policy = loadDamStoragePolicy(policyPath)
  const db = new DatabaseSync(databasePath, { readOnly: true })
  let plan
  try {
    db.exec('PRAGMA query_only = ON')
    plan = planDamRollout(db, policy, {
      brand: args.brand,
      limit: args.limit,
      reviewQueue: args.reviewQueue,
      perBrand: args['per-brand'],
      includeAbsolutePaths: args.includeAbsolutePaths,
    })
  } finally {
    db.close()
  }

  const output = args.summary
    ? {
        plan_id: plan.plan_id,
        policy_version: plan.policy_version,
        generated_at: plan.generated_at,
        plan_only: plan.plan_only,
        provider_writes_supported: plan.provider_writes_supported,
        filters: plan.filters,
        summary: plan.summary,
        gates: plan.gates,
      }
    : plan
  const json = `${JSON.stringify(output, null, 2)}\n`
  if (args.out) {
    const outputPath = path.resolve(args.out)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, json, { encoding: 'utf8', flag: 'wx' })
    process.stderr.write(`Wrote plan-only manifest: ${outputPath}\n`)
    process.stderr.write('No provider objects, database rows, DNS records, or source files were changed.\n')
    return
  }
  process.stdout.write(json)
}

try {
  main()
} catch (error) {
  process.stderr.write(`DAM rollout planner failed: ${error.message}\n`)
  process.exitCode = 1
}
