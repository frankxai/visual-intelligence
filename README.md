# VIS - Visual Intelligence OS

Local-first visual asset intelligence for AI-native creators, agentic teams, websites, social publishing, and NFT/Web3 collections.

VIS turns scattered images, videos, audio files, prompts, website references, and publication records into a SQLite-backed asset graph. It gives humans and agents a shared way to search, trace, score, curate, and use visual assets without losing provenance.

## Current Status

- GitHub repo: https://github.com/frankxai/visual-intelligence
- Active implementation branch: `codex/visual-intelligence-os-v02`
- Main integration path: PR into `main`, not direct push
- Execution tracker: GitHub Issues and milestones synced from `docs/VIS_TASK_REGISTRY.json`
- Local-first source of truth: `data/vis.sqlite`
- Local visual dashboard export: `data/vis-dashboard.html`
- PWA cockpit shell: `data/vis-dashboard.webmanifest`, `data/vis-dashboard-sw.js`, and `vis serve-dashboard`
- Agent layer: read-first MCP server at `mcp/vis-mcp-server.mjs`
- Runtime: Node.js `>=22.13.0`; Node 24+ recommended

This branch is intended to become `main` after cross-machine Claude/Codex verification. The local generated data under `data/` is intentionally ignored by Git and should be regenerated per laptop.

## What VIS Does Now

- Indexes image, video, and audio files into stable `asset_id`s and immutable `version_id`s.
- Stores assets, versions, locations, prompt sidecars, usage edges, publications, evaluations, rights, and approval state in SQLite.
- Reads and records `.vis.provenance.json` generation sidecars with prompt, model, provider, seed/settings, output paths, coding agent, repo, thread/session, and skill context.
- Detects duplicate content by SHA-256 and samples orphan assets with no detected usage.
- Finds local similarity review groups with dependency-free metadata heuristics while semantic embeddings remain adapter-planned.
- Extracts dependency-free SVG/GIF/PNG-palette color swatches and enables Eagle-style color family or hex search for design, website, music cover, Canvas, and NFT review.
- Scans website/content routes to map where assets appear.
- Adds local curation metadata: notes, custom tags, ratings, color labels, collections, and saved smart-folder searches.
- Lists and evaluates live Eagle-style smart collections for inbox, rights review, prompt/provenance gaps, usage, orphans, duplicates, music, video, NFT/Web3, website-ready, and social-ready queues.
- Supports dry-run-first batch curation for Eagle-style multi-select review, tagging, and collection moves.
- Supports dry-run-first batch rename planning/execution for same-folder designer and music-release file cleanup.
- Supports dry-run-first asset action recipes for designer inbox, Music IS release inbox, prompt/provenance gaps, website/social candidates, NFT/Web3 review, orphans, duplicates, and similarity groups.
- Supports dry-run-first derivative/export planning for website, social, Music IS release media, NFT/Web3, and Cloudinary variants without transforming, uploading, posting, minting, or deleting files.
- Supports dry-run-first rights and approval review with provenance before website, social, NFT, or music release use.
- Plans and initializes the Google Drive `Starlight Creative Vault` folder contract for two laptops, two phones, Eagle, VIS, and Music IS.
- Guards public-use packets and export manifests so unknown, blocked, or unapproved assets stay visible but not publish-ready.
- Builds Music IS handoff packets that group audio, cover art, Canvas/video, proof docs, prompts, rights, approval, and next release-gate action.
- Generates a static dashboard/PWA shell for fast visual browsing, local media previews, smart collections, selected-asset command shelf, and asset detail drawers.
- Exposes MCP resources and tools for agents via `visual://asset/{asset_id}`.
- Produces Codex-ready curation packets with path, `visual://` URI, rights, provenance, and next action.
- Produces dry-run Cloudinary manifests, NFT readiness reports, and publication records.

## Quick Start

```powershell
cd C:\Users\frank\starlight\repos\visual-intelligence
npm install
npm run lint
npm test
node bin\vis.mjs doctor
node bin\vis.mjs vault-plan
node bin\vis.mjs scan --media-root "C:\Users\frank\starlight\repos"
node bin\vis.mjs usage --usage-root "C:\Users\frank\starlight\repos\frankx.ai-vercel-website"
node bin\vis.mjs scan-profile frank-estate
node bin\vis.mjs eagle --library "<Google Drive>\Starlight Creative Vault\01_Eagle_Library"
node bin\vis.mjs dashboard --limit 3000
```

Open:

```text
C:\Users\frank\starlight\repos\visual-intelligence\data\vis-dashboard.html
```

## Claude/Codex MCP Install

Local Claude Code install:

```powershell
claude mcp add vis-mcp `
  -e VIS_ROOT="C:\Users\frank\starlight\repos\visual-intelligence" `
  -e VIS_ALLOWED_ROOTS="C:\Users\frank\starlight\repos" `
  -- node "C:\Users\frank\starlight\repos\visual-intelligence\mcp\vis-mcp-server.mjs"
```

Verify:

```powershell
claude mcp get vis-mcp
node bin\vis.mjs doctor
node bin\vis.mjs search arcanea --limit 3
```

The MCP server is read-only by default. Write-like tools require both `VIS_ENABLE_WRITES=1` and an explicit `execute: true` argument.

For older MCP clients, set `VIS_MCP_PROTOCOL_VERSION=2024-11-05`. The tested default is `2025-06-18`.

## Other Laptop Cross-Check

On Frank's other PC:

```powershell
cd C:\Users\frank\starlight\repos\visual-intelligence
git fetch origin
git checkout codex/visual-intelligence-os-v02
npm install
npm run lint
npm test
node bin\vis.mjs doctor
node bin\vis.mjs scan --media-root "C:\Users\frank\starlight\repos" --json
node bin\vis.mjs scan-profile frank-estate --json
node bin\vis.mjs dashboard --limit 3000
node bin\vis.mjs serve-dashboard --limit 3000
claude mcp get vis-mcp
```

Cross-check against the coordination branch without merging over the implementation:

```powershell
git diff --stat codex/visual-intelligence-os-v02..origin/claude/asset-os-coordination
```

Use Claude's branch for coordination notes. Use this Codex branch for the SQLite/MCP/dashboard implementation.

## Task Sync

VIS keeps its operating backlog in Git and syncs it to GitHub Issues:

```powershell
npm run tasks:dry-run
npm run tasks:sync -- --execute
npm run project:status
npm run project:report
```

The source registry is `docs/VIS_TASK_REGISTRY.json`. It creates or updates labels, milestones, and the issue backlog. GitHub Projects v2 is intentionally not automated until the local `gh` token has project scope; Issues plus milestones are the current canonical tracker.

Use [docs/PROJECT_OPERATING_SYSTEM.md](docs/PROJECT_OPERATING_SYSTEM.md) for the full project-management rule: GitHub Issues plus `docs/VIS_TASK_REGISTRY.json` are canonical, Markdown files are the offline control plane, and Google Tasks/Calendar are only personal reminder layers for human actions like buying Eagle, installing laptop 2, and weekly review. Use [docs/GOOGLE_TASKS_REMINDER_LAYER.md](docs/GOOGLE_TASKS_REMINDER_LAYER.md) for copy-ready personal reminders and [docs/PROJECT_STATUS_REPORT.md](docs/PROJECT_STATUS_REPORT.md) for the latest generated project status snapshot.

## CLI

```powershell
node bin\vis.mjs init
node bin\vis.mjs doctor
node bin\vis.mjs scan --media-root <path>
node bin\vis.mjs profiles
node bin\vis.mjs scan-profile frank-estate
node bin\vis.mjs scan-profile frank-estate --execute
node bin\vis.mjs vault-plan
node bin\vis.mjs vault-init --vault-root "<Google Drive>\Starlight Creative Vault" --execute
node bin\vis.mjs eagle --library <eagle-library-path>
node bin\vis.mjs eagle --library <eagle-library-path> --execute
node bin\vis.mjs usage --usage-root <path>
node bin\vis.mjs report
node bin\vis.mjs dashboard --limit 3000
node bin\vis.mjs search "arcanea guardian"
node bin\vis.mjs search --color blue
node bin\vis.mjs smart-collection color-indexed
node bin\vis.mjs trace <asset_id|visual://asset/...|path>
node bin\vis.mjs packet <asset_id|visual://asset/...|path> --use "homepage hero"
node bin\vis.mjs duplicates
node bin\vis.mjs orphans
node bin\vis.mjs similar
node bin\vis.mjs similar <asset_id|visual://asset/...|path|query>
node bin\vis.mjs score <asset_id>
node bin\vis.mjs annotate <asset_id> --tag favorite --rating 5 --color mint --collection "Homepage candidates"
node bin\vis.mjs annotate <asset_id> --tag favorite --rating 5 --color mint --collection "Homepage candidates" --execute
node bin\vis.mjs batch-annotate <asset_id> <asset_id> --tag review --curation-status needs-review --collection "VIS Review Queue"
node bin\vis.mjs batch-annotate <asset_id> <asset_id> --tag review --curation-status needs-review --collection "VIS Review Queue" --execute
node bin\vis.mjs batch-rename <asset_id> <asset_id> --template "{category}-{index}-{title}"
node bin\vis.mjs batch-rename --query "music cover" --template "{workflow}-{index}-{title}" --limit 10
node bin\vis.mjs review-assets <asset_id> <asset_id> --rights-status generated-owned --approval-status approved --reason "Human rights review complete"
node bin\vis.mjs smart-collections
node bin\vis.mjs smart-collection prompt-gaps --limit 50
node bin\vis.mjs smart-collection music --query "cover canvas" --json
node bin\vis.mjs action-recipes
node bin\vis.mjs action-recipe prompt-gap-review --limit 50
node bin\vis.mjs action-recipe music-release-inbox --query "suno cover" --tag release-candidate
node bin\vis.mjs action-recipe website-candidates <asset_id> <asset_id> --collection "Homepage candidates" --execute
node bin\vis.mjs derivative-presets
node bin\vis.mjs derivative-plan --preset website <asset_id|visual://asset/...|path>
node bin\vis.mjs derivative-plan --preset music-release --query "cover canvas" --output-root exports --json
node bin\vis.mjs derivative-plan --preset social --media-type video --limit 20
node bin\vis.mjs save-search --name "Favorite music assets" --query music --tag favorite
node bin\vis.mjs save-search --name "Favorite music assets" --query music --tag favorite --execute
node bin\vis.mjs saved-searches
node bin\vis.mjs music-releases
node bin\vis.mjs music-packet <release_id|asset_id|path>
node bin\vis.mjs serve-dashboard --port 3766
node bin\vis.mjs record-generation <asset_id|visual://asset/...|path> --prompt "..." --model gpt-image-1 --provider openai --agent codex --skill imagegen
node bin\vis.mjs record-generation <asset_id|visual://asset/...|path> --prompt "..." --model gpt-image-1 --provider openai --agent codex --skill imagegen --write-sidecar --execute
node bin\vis.mjs record-publication --asset <asset_id> --platform website --route /sanctum
node bin\vis.mjs record-publication --asset <asset_id> --platform website --route /sanctum --execute
node bin\vis.mjs cloudinary-manifest --category brand
node bin\vis.mjs cloudinary-manifest --category brand --include-unsafe
node bin\vis.mjs nft-report --query "anime character"
node bin\vis.mjs optimize --max-kb 2000
node bin\vis.mjs mcp-info
```

`record-generation` and `record-publication` are dry-run unless `--execute` is passed. `record-generation --write-sidecar --execute` writes `<asset-name>.vis.provenance.json` beside the asset. The MCP server is stricter and also requires `VIS_ENABLE_WRITES=1`.

## MCP Surface

Resources:

- `visual://asset/{asset_id}`
- `visual://asset/{asset_id}/versions`
- `visual://asset/{asset_id}/provenance`
- `visual://collection/{collection_id}`
- `visual://brand/{brand}/approved`

Tools:

- `search_assets`
- `get_asset`
- `trace_asset`
- `map_usage`
- `find_duplicates`
- `find_orphans`
- `find_similar_assets`
- `score_asset`
- `score_collection`
- `create_curation_packet`
- `annotate_asset`
- `bulk_annotate_assets`
- `batch_rename_assets`
- `review_assets`
- `list_smart_collections`
- `evaluate_smart_collection`
- `list_asset_action_recipes`
- `run_asset_action_recipe`
- `list_derivative_presets`
- `plan_asset_derivatives`
- `list_saved_searches`
- `save_search`
- `list_music_releases`
- `create_music_release_packet`
- `import_eagle_library`
- `plan_creative_vault`
- `init_creative_vault`
- `record_generation_provenance`
- `record_publication`
- `export_cloudinary_manifest`
- `export_nft_metadata_report`

Legacy aliases remain: `vis_search`, `vis_report`, `vis_audit`, `vis_suggest`, `vis_intelligence`.

## Architecture

```text
core/       scanner, SQLite schema, graph API, scoring, manifests
bin/        CLI
mcp/        read-first MCP server
web/        static dashboard exporter
schemas/    JSON schemas
docs/       PRD, architecture, workflows, security, integrations, AGDLC, tech radar
```

Core principle: build the repo-aware asset graph, provenance ledger, MCP layer, visual curator, agent memory, and route/social/NFT usage map. Use external tools as adapters where they are already excellent.

## Build / Use / Avoid

Build in VIS:

- Local asset graph and provenance ledger
- MCP resources and curation packets
- Website route/social/NFT usage maps
- Rights, approval, evaluation, and publication records
- Agent run and skill run capture
- Portable `.vis.provenance.json` sidecars for generated images, video, audio, and music release assets
- Dry-run asset action recipes that turn Eagle-style curation and agentic media operations into safe repeatable workflows
- Dry-run derivative/export manifests for website, social, music-release, NFT/Web3, and Cloudinary variants before any adapter execution
- Creative Vault setup planner and manifest for Drive/Photos/Eagle/two-laptop/Music IS operations

Use through adapters:

- Cloudflare R2 for approved master storage
- Cloudinary for CDN/DAM delivery
- Postiz for social scheduling/publishing
- Google Drive and OneDrive for cloud-file references
- C2PA/IPTC/ExifTool-compatible metadata evidence
- IPFS/thirdweb/OpenZeppelin/viem-style tooling for Web3 reports and gated drops

Avoid building first:

- Full camera roll backup
- Generic enterprise DAM permissions
- Social scheduler
- Image transformation CDN
- Wallet/minting stack
- Native mobile app

See [docs/OPEN_SOURCE_TECH_RADAR.md](docs/OPEN_SOURCE_TECH_RADAR.md) before absorbing code or architecture from another GitHub project.

## Docs

- [PRD](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Research](docs/RESEARCH.md)
- [Open Source Tech Radar](docs/OPEN_SOURCE_TECH_RADAR.md)
- [Eagle Parity Roadmap](docs/EAGLE_PARITY_ROADMAP.md)
- [Project Operating System](docs/PROJECT_OPERATING_SYSTEM.md)
- [Project Board](docs/PROJECT_BOARD.md)
- [Project Status Report](docs/PROJECT_STATUS_REPORT.md)
- [Google Tasks Reminder Layer](docs/GOOGLE_TASKS_REMINDER_LAYER.md)
- [VIS Task Registry](docs/VIS_TASK_REGISTRY.json)
- [GitHub Issue Sync Report](docs/GITHUB_ISSUE_SYNC_REPORT.md)
- [Setup Runbook](docs/SETUP_RUNBOOK.md)
- [Weekly Review Checklist](docs/WEEKLY_REVIEW_CHECKLIST.md)
- [GitHub Issue Backlog](docs/GITHUB_ISSUE_BACKLOG.md)
- [User Workflows](docs/USER_WORKFLOWS.md)
- [Security](docs/SECURITY.md)
- [Integrations](docs/INTEGRATIONS.md)
- [AGDLC](docs/AGDLC.md)
- [Progress Report](docs/PROGRESS_REPORT_2026-06-26.md)

## Security

- Local-first by default.
- Generated runtime data stays under `data/` and is ignored by Git.
- MCP path outputs are redacted outside allowlisted roots.
- Write/publication operations require explicit gates.
- Secrets, `.env`, private keys, wallet files, private memory folders, and personal folders should not be indexed or exported.
- Every public asset needs rights status: `owned`, `generated-owned`, `licensed`, `unknown`, `blocked`, or `needs-review`.

See [docs/SECURITY.md](docs/SECURITY.md).
