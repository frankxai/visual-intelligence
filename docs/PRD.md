# Visual Intelligence OS PRD

Date: 2026-06-26

## Product

Visual Intelligence OS, short name VIS, is a local-first visual asset operating system for AI-native creators, founders, and agentic teams. It manages images first, then video, audio, music, prompts, provenance, website usage, social usage, NFT collection readiness, rights, evaluation, and publishing state.

VIS is not another generic DAM. It is the agent-accessible asset graph that lets Frank and future teams answer:

- What is this asset?
- Where did it come from?
- Which prompt/model/agent/skill produced it?
- Where is it stored, backed up, and published?
- Is it approved, legally usable, and on-brand?
- Which agent should use it next, and for what?

## Primary User

Frank, solo founder on two laptops, operating Starlight, Arcanea, FrankX, AnimeLegends, creator products, social channels, and Web3/NFT experiments.

Secondary users later:

- Founder/creator teams with many generated assets.
- Agencies managing AI creative operations.
- NFT/collectible teams needing metadata and provenance readiness.
- Agentic marketing operators who need assets exposed to coding and publishing agents.

## Goals

- Index local media without exposing private paths publicly by default.
- Create stable `asset_id`, immutable `version_id`, and append-only provenance events.
- Let agents retrieve assets through MCP using `visual://` URIs.
- Give Frank a visual dashboard for search, preview, copy-path, copy-URI, and copy-Codex-packet workflows.
- Preserve compatibility with the existing JSON registry and HTML report flow.
- Keep integrations as adapters: R2, Cloudinary, Postiz, Drive, OneDrive, IPFS, thirdweb, Vercel.

## Non-Goals For V0

- No full Google Photos replacement.
- No native mobile app.
- No generic enterprise permission system.
- No social scheduler.
- No wallet or minting stack.
- No destructive file cleanup.
- No automatic public publishing without human approval.

## Success Criteria

- `vis scan` builds `data/vis.sqlite`, `data/visual-registry.json`, and `data/vis-atlas.json`.
- `vis dashboard` produces a local visual cockpit with asset cards and detail drawer.
- MCP exposes resources and tools for search, trace, scoring, curation packets, dry-run manifests, and dry-run publication records.
- Same bytes across folders collapse to one logical asset with multiple locations.
- Website/content references become `asset_usage` edges.
- Every public asset can carry rights status and approval status.
- Publication and adapter operations are dry-run by default.

## Release Shape

V0.2 is an internal OS vertical slice:

- Core SQLite index.
- CLI.
- MCP server.
- Static dashboard export.
- Product docs and schemas.

V0.3 should add deeper sidecar capture, richer prompt extraction, optimized derivative generation, and adapter dry-runs for R2/Cloudinary/Postiz.

