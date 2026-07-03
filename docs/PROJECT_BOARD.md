# VIS Project Board

Date: 2026-07-03

This is the operating board for turning VIS from a working scanner/MCP prototype into Frank's daily media asset operating system and then a sellable product. GitHub Issues are now the execution source, with this file as the human-readable board and cross-agent handoff.

## Decision

- Canonical execution tracker: GitHub Issues in `frankxai/visual-intelligence`, synced from `docs/VIS_TASK_REGISTRY.json`.
- Repo-visible fallback: this Markdown board plus `docs/GITHUB_ISSUE_BACKLOG.md`.
- Operating rulebook: `docs/PROJECT_OPERATING_SYSTEM.md`.
- GitHub Projects v2: pending `gh auth refresh -s read:project,project`; use milestones until that scope is available.
- Personal reminder layer: Google Tasks/Calendar only for time-bound human actions such as buying Eagle, installing on laptop 2, or weekly review.
- Product truth: VIS repo docs, SQLite graph, MCP server, and release reports.

## Milestones

| Milestone | Goal | Exit Criteria |
| --- | --- | --- |
| M0 Personal Estate Setup | Two laptops and two phones can capture, sync, index, and browse assets reliably. | Eagle/Drive/Photos/VIS/MCP installed and verified on main and second laptop. |
| M1 Daily Cockpit | Frank can use VIS daily without touching JSON or terminal for normal browsing. | Local dashboard/PWA has fast grid, filters, detail, packets, and setup health. |
| M2 Asset Intelligence | VIS understands where assets came from, where they are used, and what should happen next. | Provenance, rights, usage, duplicates, orphans, scoring, and curation packets are reliable. |
| M3 Media Expansion | Images, video, audio, music release assets, and prompts share one provenance spine. | Music IS proof folders and audio metadata index cleanly without flattening music-specific workflows. |
| M4 Product Beta | VIS becomes a packaged product for AI-native creators and agentic teams. | Install path, docs, demo dataset, security policy, pricing hypothesis, and beta feedback loop exist. |

## Now

- [ ] Buy Eagle and install it on the two primary laptops.
- [x] Add Eagle parity roadmap and current build/use decision to repo docs.
- [x] Add first VIS cockpit slice for smart collections, source/folder navigation, batch packets, audio preview, and Music IS handoff.
- [x] Add local curation primitives for annotations, custom tags, ratings, color labels, collections, saved searches, CLI, MCP, and dashboard visibility.
- [x] Add GitHub task registry, issue templates, and task sync script.
- [x] Sync task registry into GitHub Issues and milestones.
- [x] Add `frank-estate` scan profile dry-run for repos, brand image-system, Drive/Eagle vault paths, Music IS, website usage roots, and MCP allowlist generation.
- [x] Add dry-run-first Eagle metadata adapter for local library tags, notes, source URLs, folders, collections, provider locations, and provenance.
- [x] Add Music IS release packet preflight for audio, cover, Canvas/video, proof docs, prompts, rights, approval, CLI, MCP, and Codex handoff.
- [x] Add PWA-ready static cockpit shell, service worker, manifest, and local media preview server.
- [x] Add first local similarity review groups with CLI, MCP, dashboard queue, and smart collection.
- [x] Add dry-run-first batch curation for selected assets across dashboard, CLI, and MCP.
- [x] Add dry-run-first rights and approval review for selected assets across dashboard, CLI, and MCP.
- [x] Add public-use gates so unsafe assets stay visible but are excluded from Cloudinary/NFT/export-ready handoffs by default.
- [x] Add project operating system, issue templates, weekly review checklist, and Google Tasks reminder boundary.
- [x] Teach GitHub task sync to use explicit registry statuses, including done and blocked.
- [ ] Create the Google Drive `Starlight Creative Vault` structure.
- [ ] Configure both phones to back up to Google Photos and share curated assets into Drive.
- [ ] Configure Eagle library inside the Drive-synced vault.
- [ ] Point VIS scanner at Drive vault, Eagle library, repo assets, and Music IS proof folders.
- [ ] Install VIS MCP for Claude/Codex on both laptops.
- [ ] Run `npm run doctor`, `npm run lint`, `npm test`, estate scan, usage scan, and dashboard generation on both laptops.

## Next

- [ ] Build a richer Next.js/PWA dashboard after the static PWA cockpit proves daily value.
- [ ] Add GitHub Projects v2 board after `gh` token gets project scope.
- [ ] Verify Eagle adapter against Frank's real synced Eagle library after install.
- [ ] Add Google Drive metadata adapter with provider IDs and sync health.
- [ ] Add Google Photos/manual mobile inbox intake workflow.
- [ ] Verify Music IS release packets against Frank's real proof folders after next estate scan.
- [ ] Add agent run logging sidecars for generated media.
- [ ] Add semantic embeddings and stronger visual similarity using a permissive local model or external adapter.

## Later

- [ ] R2 approved-master backup adapter.
- [ ] Cloudinary production delivery adapter.
- [ ] Postiz publication tracking adapter.
- [ ] C2PA/IPTC/ExifTool metadata evidence adapter.
- [ ] Tauri desktop shell after PWA proves daily value.
- [ ] Hosted/team beta after the solo-founder OS is stable.

## Operating Cadence

- Daily: add/capture assets, curate inbox, run VIS packet when an agent uses an asset.
- Weekly: run duplicate/orphan/rights review, update issue statuses, pick one product improvement.
- Before publishing: check rights, provenance, usage map, optimized derivative, and publication record.
- Before merging: run `npm run lint`, `npm test`, `npm run doctor`, MCP smoke, and no generated `data/` staged.

## Risk Register

| Risk | Mitigation |
| --- | --- |
| Drive sync conflicts corrupt Eagle library | Use one active Eagle writer at a time; wait for sync complete before switching laptops. |
| Personal/private assets leak into exports | Keep MCP allowlists narrow; keep `data/` ignored; run security scan before commits. |
| GitHub Projects unavailable due token scope | Use GitHub Issues plus milestones; add Project v2 after `gh auth refresh -s project`. |
| VIS overbuilds Eagle/Immich features | Use Eagle/Google Photos/Drive for commodity UX; build provenance, agents, usage, and product intelligence. |
| Music workflows get flattened into visual workflows | Keep Music IS as canonical release system; VIS indexes and links media assets. |
