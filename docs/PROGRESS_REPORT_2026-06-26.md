# VIS Progress Report

Date: 2026-06-26

## GitHub Connection

Repository:

```text
https://github.com/frankxai/visual-intelligence.git
```

Active branch:

```text
codex/visual-intelligence-os-v02
```

Pull request:

```text
https://github.com/frankxai/visual-intelligence/pull/7
```

This report is intended for cross-check by Claude/Codex/Grok on Frank's other PC.

## Main Merge Recommendation

Do not direct-push this work to `main`. Keep it in PR #7 until the other PC Claude cross-check passes.

Current recommendation:

- Use `codex/visual-intelligence-os-v02` as the implementation branch.
- Use `origin/claude/asset-os-coordination` as a coordination/reference branch only.
- After other-PC verification, mark PR #7 ready for review and merge into `main`.
- Do not merge Claude's coordination branch over this branch without a file-by-file review, because that branch is mostly docs/coordination and would remove the new SQLite core, dashboard, schemas, and tests if applied as-is.

Merge gates:

- `npm run lint` passes.
- `npm test` passes.
- `node bin\vis.mjs doctor` passes.
- MCP smoke test returns an asset.
- Dashboard opens and renders local images.
- No generated `data/` files are staged.
- Other PC regenerates its own local SQLite/dashboard state.
- Rights and write/publish gates are explicitly reviewed before any public use.

## Implemented Layers

- Core SQLite asset graph in `core/vis-core.mjs`
- CLI in `bin/vis.mjs`
- MCP server in `mcp/vis-mcp-server.mjs`
- Static local dashboard in `web/vis-dashboard.mjs`
- Product docs in `docs/`
- JSON schemas in `schemas/`
- Core regression test in `tests/vis-core.test.mjs`
- Open-source/license tech radar in `docs/OPEN_SOURCE_TECH_RADAR.md`
- Install/health check command: `node bin\vis.mjs doctor`

## Review Hardening Added After PR Feedback

- Node engine now reflects `node:sqlite`: `>=22.13.0`, with Node 24+ recommended.
- Scanner hashes media files in chunks instead of reading full files into memory.
- Config parse errors now report the exact invalid `vis.config.json` path.
- SVG `viewBox` parsing now handles comma/space separated values and rejects invalid dimensions.
- MCP path allowlist resolution now resolves relative roots against `VIS_ROOT` and redacts paths outside normalized allowed roots.
- MCP protocol version is configurable through `VIS_MCP_PROTOCOL_VERSION`; default remains the tested `2025-06-18`, with `2024-11-05` available for older clients.
- Regression tests cover malformed config and SVG viewBox parsing.

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
node bin\vis.mjs doctor
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

Expected `doctor` signal:

```text
repoRoot: OK
config: OK
nodeVersion: OK
sqliteIndex: OK after scan
dashboard: OK after dashboard generation
mcpServer: OK
```

## Cross-Check Tasks For Other PC Claude

- Compare this branch with `claude/asset-os-coordination`.
- Confirm PR #7 is the branch that should graduate to `main`, not a direct push.
- Confirm MCP resources and tools list correctly.
- Confirm dashboard opens and images render.
- Confirm `record_publication` remains dry-run unless writes are explicitly enabled.
- Confirm no generated SQLite/JSON/dashboard files are staged.
- Review rights/default status policy before any public publishing.
- Run `node bin\vis.mjs doctor --json` and paste the result into the PR or a follow-up report.
- Run a selected asset through `node bin\vis.mjs packet <asset_id> --use "other laptop validation"` and confirm the local path is valid on that laptop.

## Technology Absorption Policy

The radar in `docs/OPEN_SOURCE_TECH_RADAR.md` is now the rulebook for absorbing other GitHub projects.

Default stance:

- MIT/Apache/BSD/public-domain dependencies can be considered for core.
- AGPL/GPL/BSL/source-available/proprietary projects stay adapter-only or inspiration-only.
- Every adopted external project gets source, license, version, and credit recorded before productization.
- R2, Cloudinary, Postiz, Drive, OneDrive, IPFS, thirdweb, C2PA, IPTC, ExifTool, and similar systems remain adapters unless a future product decision explicitly changes that.

## Known Gaps

- Rights and approval states are still defaults: all assets begin as `unknown` and `candidate`.
- C2PA/IPTC embedding is not implemented yet; VIS ledger is the current provenance source.
- R2, Cloudinary, Postiz, Drive, OneDrive, and IPFS/thirdweb are dry-run manifests or planned adapters, not live upload/post/mint flows.
- Native desktop/mobile app is deferred; current UI is static local dashboard.
