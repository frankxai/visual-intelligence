# VIS Progress Report

Date: 2026-06-26

## GitHub Connection

Repository:

```text
https://github.com/frankxai/visual-intelligence.git
```

This report is intended for cross-check by Claude/Codex/Grok on Frank's other PC.

## Implemented Layers

- Core SQLite asset graph in `core/vis-core.mjs`
- CLI in `bin/vis.mjs`
- MCP server in `mcp/vis-mcp-server.mjs`
- Static local dashboard in `web/vis-dashboard.mjs`
- Product docs in `docs/`
- JSON schemas in `schemas/`
- Core regression test in `tests/vis-core.test.mjs`

## Local Runtime State

Generated local files are intentionally ignored by Git:

```text
data/vis.sqlite
data/visual-registry.json
data/vis-atlas.json
data/vis-dashboard.html
data/brand-visual-dna.json
```

Current local graph summary from Frank's main PC:

```text
assets:      3276
versions:    3277
locations:   13372
usageEdges:  25497
prompts:     14
images:      3221
video:       32
audio:       23
```

Top lanes:

```text
FrankX: 1127
frankx.ai-vercel-website: 600
Starlight-Intelligence-System: 381
arcanea: 331
brand: 169
arcanea-guardians: 84
arcanea-luminors: 48
animelegends: 45
characters: 41
```

## Experiments Run

Security:

```powershell
& C:\Users\frank\starlight\repos\security\Invoke-UntrustedRepoIntake.ps1 -Path C:\Users\frank\starlight\repos\visual-intelligence
```

Result: passed.

Code gates:

```powershell
npm run lint
npm test
```

Result: passed.

Estate scan:

```powershell
node bin\vis.mjs scan --media-root "C:\Users\frank\starlight\repos" --json
```

Result: `13376` scanned files, `3276` logical assets.

Targeted usage scan:

```powershell
node bin\vis.mjs usage `
  --usage-root "C:\Users\frank\starlight\repos\frankx.ai-vercel-website" `
  --usage-root "C:\Users\frank\starlight\repos\arcanea-ai-app" `
  --usage-root "C:\Users\frank\starlight\repos\gencreator.ai" `
  --usage-root "C:\Users\frank\starlight\repos\Starlight-Intelligence-System" `
  --usage-root "C:\Users\frank\starlight\repos\AnimeLegends" `
  --json
```

Result: `25497` usage edges.

Dashboard:

```powershell
node bin\vis.mjs dashboard --limit 3000
```

Result:

```text
C:\Users\frank\starlight\repos\visual-intelligence\data\vis-dashboard.html
```

MCP smoke test:

```powershell
$env:VIS_ROOT = "C:\Users\frank\starlight\repos\visual-intelligence"
$env:VIS_ALLOWED_ROOTS = "C:\Users\frank\starlight\repos"
@'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_assets","arguments":{"query":"arcanea","max_results":1}}}
'@ | node mcp\vis-mcp-server.mjs
```

Result: MCP initialized and returned a VIS asset.

## MCP Install On Main PC

Claude Code local project config has been installed and health-checked:

```powershell
claude mcp add vis-mcp `
  -e VIS_ROOT="C:\Users\frank\starlight\repos\visual-intelligence" `
  -e VIS_ALLOWED_ROOTS="C:\Users\frank\starlight\repos" `
  -- node "C:\Users\frank\starlight\repos\visual-intelligence\mcp\vis-mcp-server.mjs"
```

Health check:

```powershell
claude mcp get vis-mcp
```

Result:

```text
Status: Connected
Type: stdio
Command: node
Read-only default: true
```

## Install On Other PC

1. Pull the GitHub branch containing this report.
2. Run `npm install` or `pnpm install` if dependencies are missing.
3. Run `npm run lint` and `npm test`.
4. Regenerate local runtime state on that machine:

```powershell
node bin\vis.mjs scan --media-root "C:\Users\frank\starlight\repos" --json
node bin\vis.mjs usage --usage-root "C:\Users\frank\starlight\repos\frankx.ai-vercel-website" --json
node bin\vis.mjs dashboard --limit 3000
```

5. Install Claude MCP on that PC:

```powershell
claude mcp add vis-mcp `
  -e VIS_ROOT="C:\Users\frank\starlight\repos\visual-intelligence" `
  -e VIS_ALLOWED_ROOTS="C:\Users\frank\starlight\repos" `
  -- node "C:\Users\frank\starlight\repos\visual-intelligence\mcp\vis-mcp-server.mjs"
```

6. Verify:

```powershell
claude mcp get vis-mcp
node bin\vis.mjs search arcanea --limit 3
node bin\vis.mjs packet <asset_id> --use "cross-machine validation"
```

## Cross-Check Tasks For Other PC Claude

- Compare this branch with `claude/asset-os-coordination`.
- Confirm MCP resources and tools list correctly.
- Confirm dashboard opens and images render.
- Confirm `record_publication` remains dry-run unless writes are explicitly enabled.
- Confirm no generated SQLite/JSON/dashboard files are staged.
- Review rights/default status policy before any public publishing.

## Known Gaps

- Rights and approval states are still defaults: all assets begin as `unknown` and `candidate`.
- C2PA/IPTC embedding is not implemented yet; VIS ledger is the current provenance source.
- R2, Cloudinary, Postiz, Drive, OneDrive, and IPFS/thirdweb are dry-run manifests or planned adapters, not live upload/post/mint flows.
- Native desktop/mobile app is deferred; current UI is static local dashboard.

