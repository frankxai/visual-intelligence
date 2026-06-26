# VIS — Visual Intelligence OS

Local-first visual asset intelligence for AI-native creators and agentic teams.

VIS indexes images, video, and audio into a SQLite asset graph with stable `asset_id`s, immutable `version_id`s, local locations, route usage, prompts, provenance events, rights, evaluations, publication records, and agent-ready curation packets.

## What Changed In V0.2

- SQLite source of truth at `data/vis.sqlite`.
- Compatibility exports at `data/visual-registry.json` and `data/vis-atlas.json`.
- Local dashboard export at `data/vis-dashboard.html`.
- MCP resources and tools for `visual://asset/{asset_id}`.
- Dry-run Cloudinary and NFT manifests.
- Dry-run publication recording by default.
- Product docs and JSON schemas.

## Quick Start

```powershell
npm run lint
npm test
node bin/vis.mjs scan --media-root "C:\Users\frank\starlight\repos"
node bin/vis.mjs usage --usage-root "C:\Users\frank\starlight\repos\frankx.ai-vercel-website"
node bin/vis.mjs dashboard
```

Open the generated dashboard:

```text
data/vis-dashboard.html
```

## CLI

```powershell
node bin/vis.mjs init
node bin/vis.mjs scan
node bin/vis.mjs scan --media-root <path>
node bin/vis.mjs usage --usage-root <path>
node bin/vis.mjs report
node bin/vis.mjs dashboard
node bin/vis.mjs search "arcanea guardian"
node bin/vis.mjs trace <asset_id|visual://asset/...|path>
node bin/vis.mjs packet <asset_id|visual://asset/...|path> --use "homepage hero"
node bin/vis.mjs duplicates
node bin/vis.mjs orphans
node bin/vis.mjs score <asset_id>
node bin/vis.mjs record-publication --asset <asset_id> --platform website --route /sanctum
node bin/vis.mjs record-publication --asset <asset_id> --platform website --route /sanctum --execute
node bin/vis.mjs cloudinary-manifest --category brand
node bin/vis.mjs nft-report --query "anime character"
```

`record-publication` is dry-run unless `--execute` is passed. The MCP server is stricter: it also requires `VIS_ENABLE_WRITES=1`.

## MCP

Run:

```powershell
$env:VIS_ROOT = "C:\Users\frank\starlight\repos\visual-intelligence"
$env:VIS_ALLOWED_ROOTS = "C:\Users\frank\starlight\repos"
node mcp/vis-mcp-server.mjs
```

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
- `score_asset`
- `score_collection`
- `create_curation_packet`
- `record_publication`
- `export_cloudinary_manifest`
- `export_nft_metadata_report`

Legacy aliases remain: `vis_search`, `vis_report`, `vis_audit`, `vis_suggest`, `vis_intelligence`.

## Architecture

```text
core/       scanner, SQLite schema, graph API, scoring, manifests
bin/        CLI
mcp/        MCP server
web/        dashboard exporter
schemas/    JSON schemas
docs/       PRD, architecture, workflows, security, integrations, AGDLC
```

## Security

- Local-first by default.
- Generated data stays under `data/` and is ignored by Git.
- MCP read-only by default.
- Write/publication operations require explicit gates.
- Paths outside the MCP allowlist are redacted.
- Secrets, `.env`, private keys, wallet files, and private memory folders should not be indexed.

See [docs/SECURITY.md](docs/SECURITY.md).
