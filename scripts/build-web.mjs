#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { generateDashboard } from '../web/vis-dashboard.mjs'
import { findProjectRoot, loadConfig } from '../core/vis-core.mjs'

const root = findProjectRoot(process.cwd())
const config = loadConfig(root)
const outDir = path.resolve(root, 'dist')

console.log(`[VIS Web Build] Starting web build for Vercel...`)
console.log(`[VIS Web Build] Root: ${root}`)
console.log(`[VIS Web Build] Target: ${outDir}`)

fs.mkdirSync(outDir, { recursive: true })

const result = generateDashboard(root, {
  output: path.join(outDir, 'index.html'),
  limit: process.env.VIS_BUILD_LIMIT ? Number(process.env.VIS_BUILD_LIMIT) : 10000,
})

console.log(`[VIS Web Build] Rendered: ${result.outputPath}`)
console.log(`[VIS Web Build] Assets indexed: ${result.assets}`)
console.log(`[VIS Web Build] PWA manifest: ${result.pwa.manifest}`)
console.log(`[VIS Web Build] Web build ready for Vercel deployment!`)
