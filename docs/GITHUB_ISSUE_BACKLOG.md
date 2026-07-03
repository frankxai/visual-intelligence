# VIS GitHub Issue Backlog

Date: 2026-07-03

This backlog is mirrored by `docs/VIS_TASK_REGISTRY.json` and can be synced to GitHub with:

```powershell
npm run tasks:dry-run
npm run tasks:sync -- --execute
```

Keep labels and milestones aligned with `docs/PROJECT_BOARD.md`. GitHub Projects v2 is pending local token project scope; GitHub Issues plus milestones are the canonical tracker for now.

Synced on 2026-07-03 as GitHub issues #8-#23. See `docs/GITHUB_ISSUE_SYNC_REPORT.md`.

## Labels

- `setup`
- `product`
- `dashboard`
- `mcp`
- `adapter`
- `music`
- `security`
- `research`
- `good-first-internal`
- `human-gated`

## Milestones

- `M0 Personal Estate Setup`
- `M1 Daily Cockpit`
- `M2 Asset Intelligence`
- `M3 Media Expansion`
- `M4 Product Beta`

## Issue 1: Set up Google Drive Creative Vault across two laptops and two phones

Labels: `setup`, `good-first-internal`
Milestone: `M0 Personal Estate Setup`

Body:

```markdown
Create the `Starlight Creative Vault` in Google Drive and make it usable across two laptops and two phones.

Tasks:
- [ ] Create folder structure from `docs/SETUP_RUNBOOK.md`.
- [ ] Install Google Drive for desktop on laptop 1.
- [ ] Install Google Drive for desktop on laptop 2.
- [ ] Make the vault locally available where Eagle/VIS need stable paths.
- [ ] Add Drive app shortcuts on both phones.
- [ ] Test phone upload into `00_INBOX_MOBILE`.

Acceptance:
- [ ] Both laptops can see the same vault path.
- [ ] Both phones can upload selected assets into Drive.
- [ ] VIS can scan the vault from at least one laptop.
```

## Issue 2: Buy, install, and configure Eagle as the visual inbox

Labels: `setup`, `human-gated`
Milestone: `M0 Personal Estate Setup`

Body:

```markdown
Use Eagle as the daily visual browsing and inspiration manager while VIS remains provenance/agent source of truth.

Tasks:
- [ ] Buy Eagle license.
- [ ] Install Eagle on laptop 1.
- [ ] Install Eagle on laptop 2.
- [ ] Install Eagle browser extension.
- [ ] Place Eagle library under `01_Eagle_Library`.
- [ ] Define starter folders/tags for FrankX, Arcanea, VIS, music, websites, NFT, social.
- [ ] Document sync caution: one active Eagle writer at a time.

Acceptance:
- [ ] Eagle opens the same synced library on both laptops.
- [ ] Browser extension captures into Eagle.
- [ ] VIS can scan the Eagle library folder.
```

## Issue 3: Install VIS MCP and run doctor on both laptops

Labels: `setup`, `mcp`
Milestone: `M0 Personal Estate Setup`

Body:

```markdown
Make VIS agent-accessible on both laptops.

Tasks:
- [ ] Pull active VIS branch on laptop 1 and laptop 2.
- [ ] Run `npm install`.
- [ ] Run `npm run doctor`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Install `vis-mcp` in Claude on both laptops.
- [ ] Smoke test `search_assets` through MCP.

Acceptance:
- [ ] `claude mcp get vis-mcp` shows connected on both laptops.
- [ ] `node bin\vis.mjs doctor --json` returns `ok: true` after scan/dashboard generation.
- [ ] A selected asset packet resolves to a valid local path on both laptops.
```

## Issue 4: Build VIS scan profile for Drive, Eagle, repos, and Music IS

Labels: `setup`, `product`
Milestone: `M0 Personal Estate Setup`

Body:

```markdown
Define the first canonical VIS scan roots and exclusion rules.

Tasks:
- [ ] Add Drive creative vault scan root.
- [ ] Add Eagle library scan root.
- [ ] Keep repo estate scan root.
- [ ] Add Music IS proof folders.
- [ ] Exclude generated/cache/private directories.
- [ ] Run scan and record counts.

Acceptance:
- [ ] Scan completes without indexing secrets or private memory.
- [ ] Dashboard shows assets from Drive, Eagle, repos, and music proof folders.
- [ ] Duplicate/orphan reports work after scan.
```

## Issue 5: Build Next.js/PWA daily cockpit MVP

Labels: `dashboard`, `product`
Milestone: `M1 Daily Cockpit`

Body:

```markdown
Replace static HTML as the daily operating UI with a local-first dashboard/PWA.

Tasks:
- [x] Create static PWA app shell with manifest, service worker, icon, and local serve command.
- [x] Add asset grid with stable thumbnails and served local media proxy.
- [x] Add search, filters, tags, media type, rights, approval, source in the static cockpit.
- [x] Add detail drawer with provenance, usage, local path, `visual://` URI.
- [x] Add copy actions: local path, visual URI, Codex packet, website/social packets, and Music IS packet.
- [ ] Promote cockpit to richer Next.js/PWA only after static app-mode workflow is proven.
- [ ] Add duplicate/orphan/rights review panels.

Acceptance:
- [ ] Dashboard handles at least current 3k+ asset graph smoothly.
- [ ] Desktop and mobile responsive views pass visual QA.
- [ ] No private paths are exposed outside allowed local context.
```

## Issue 6: Add Eagle adapter for library metadata and import mapping

Labels: `adapter`, `product`
Milestone: `M2 Asset Intelligence`

Body:

```markdown
Read Eagle library metadata where safe and map it into VIS without copying Eagle proprietary code.

Tasks:
- [ ] Research Eagle library metadata format and API/plugin options.
- [ ] Map Eagle folders, tags, notes, source URLs, and local file paths into VIS records.
- [ ] Detect Eagle-managed assets as locations, not duplicate source truth.
- [ ] Add docs for Eagle sync conflict rules.

Acceptance:
- [ ] VIS can show Eagle folder/tag context for indexed assets.
- [ ] Eagle remains optional and adapter-only.
- [ ] No Eagle proprietary code or assets are copied into VIS.
```

## Issue 7: Add Google Drive metadata adapter

Labels: `adapter`
Milestone: `M2 Asset Intelligence`

Body:

```markdown
Link Drive files to provider IDs and sync state so VIS understands cloud locations.

Tasks:
- [ ] Define Drive metadata fields in `storage_object`/location model.
- [ ] Add dry-run Drive import manifest.
- [ ] Add provider ID and web URL capture.
- [ ] Keep credentials outside Git.

Acceptance:
- [ ] VIS can report local path plus Drive provider identity for a sample asset.
- [ ] Adapter runs without exposing tokens.
- [ ] Dry-run output is human-readable before writes.
```

## Issue 8: Define mobile inbox workflow for Google Photos and Drive

Labels: `setup`, `product`
Milestone: `M1 Daily Cockpit`

Body:

```markdown
Create a repeatable phone-to-VIS workflow.

Tasks:
- [ ] Document when assets stay only in Google Photos.
- [ ] Document when assets move to Drive inbox.
- [ ] Add weekly inbox curation checklist.
- [ ] Add VIS search/filter for mobile inbox assets.

Acceptance:
- [ ] Phone assets can become VIS assets without manual path confusion.
- [ ] Mobile backup does not become product source of truth by accident.
```

## Issue 9: Add music/audio integration with Music IS

Labels: `music`, `adapter`
Milestone: `M3 Media Expansion`

Body:

```markdown
Index audio/music assets while preserving Music IS as the canonical release operating system.

Tasks:
- [x] Index MP3/WAV/M4A/FLAC metadata.
- [x] Link Music IS proof folders through scan profiles and music release packet grouping.
- [x] Link cover, Canvas, lyrics, prompt, credits, and release checklist in VIS preflight packets.
- [x] Add CLI/MCP release packet handoff.
- [ ] Add release packet curation view.
- [ ] Avoid making VIS the release truth; Music IS remains canonical.

Acceptance:
- [ ] VIS can trace a song's cover, Canvas, audio, lyrics, and release usage.
- [ ] Music IS catalog remains source of truth for release state.
```

## Issue 10: Add agent provenance sidecars for generated media

Labels: `mcp`, `product`
Milestone: `M2 Asset Intelligence`

Body:

```markdown
Every generated image/video/audio output should carry sidecar provenance even when embedded metadata is missing.

Tasks:
- [ ] Define `.vis.provenance.json` sidecar format.
- [ ] Capture agent, model, prompt, negative prompt, seed/settings, skill, repo, thread/session, output paths.
- [ ] Add CLI command to record generation event.
- [ ] Teach MCP curation packets to include provenance summary.

Acceptance:
- [ ] A new generated asset can be traced from prompt to output to usage.
- [ ] Sidecar survives movement between Drive, Eagle, and repos.
```

## Issue 11: Add rights and approval review board

Labels: `dashboard`, `security`
Milestone: `M2 Asset Intelligence`

Body:

```markdown
Make rights and approval state visible and actionable before assets become public.

Tasks:
- [ ] Add rights filter and review queue.
- [ ] Add approval/reject workflow.
- [ ] Add blocked/needs-review state.
- [ ] Add export guard for unknown rights.

Acceptance:
- [ ] Public/publishing packets warn on unknown/blocked rights.
- [ ] Approval changes are recorded as provenance events.
```

## Issue 12: Add semantic and visual similarity search

Labels: `product`, `research`
Milestone: `M2 Asset Intelligence`

Body:

```markdown
Add natural-language and similarity search without locking VIS to a single provider.

Tasks:
- [x] Add local dependency-free visual similarity review groups using metadata heuristics.
- [x] Add CLI and MCP similarity review commands.
- [x] Add dashboard similarity review queue and smart collection.
- [x] Add dry-run-first batch curation across CLI, MCP, and dashboard selected-assets handoff.
- [ ] Research permissive local embedding options and external adapter options.
- [ ] Add embedding table/schema.
- [ ] Add CLI dry-run for embedding selected assets.
- [ ] Add semantic search UI mode.

Acceptance:
- [ ] Search can find assets by meaning, not only filename/tag.
- [ ] Provider/model used is recorded for provenance and reproducibility.
```

## Issue 13: Add R2 and Cloudinary publication/storage adapters

Labels: `adapter`, `human-gated`
Milestone: `M4 Product Beta`

Body:

```markdown
Move from dry-run manifests toward safe gated storage/delivery adapters.

Tasks:
- [ ] R2 approved masters dry-run to live upload gate.
- [ ] Cloudinary production derivatives dry-run to live upload gate.
- [ ] Store provider IDs, URLs, checksums, and status.
- [ ] Never upload without human approval.

Acceptance:
- [ ] Dry-run manifest is reviewed before upload.
- [ ] Upload records become storage objects in VIS.
```

## Issue 14: Prepare private beta product package

Labels: `product`
Milestone: `M4 Product Beta`

Body:

```markdown
Package VIS as a product for AI-native creators after internal OS proves useful.

Tasks:
- [ ] Define product name and positioning.
- [ ] Create demo dataset.
- [ ] Create install guide.
- [ ] Create pricing hypothesis.
- [ ] Create beta feedback form.
- [ ] Create public landing page draft.

Acceptance:
- [ ] A beta user can install and scan a local folder without Frank handholding.
- [ ] Product claims are honest about adapter/manual boundaries.
```

## Issue 15: Add GitHub issue templates and weekly review ritual

Labels: `product`, `setup`
Milestone: `M0 Personal Estate Setup`

Body:

```markdown
Make VIS work manageable by future agents.

Tasks:
- [ ] Add setup task issue template.
- [ ] Add product feature issue template.
- [ ] Add adapter issue template.
- [ ] Add weekly review checklist.
- [ ] Link docs from README.

Acceptance:
- [ ] New tasks can be opened consistently.
- [ ] Weekly review can move issues across Now/Next/Later.
```

## Issue 16: Build Eagle parity cockpit slice and adapter path

Labels: `dashboard`, `adapter`, `product`
Milestone: `M1 Daily Cockpit`

Body:

```markdown
Benchmark Eagle capabilities without copying proprietary UX, then ship the VIS-specific advantage layer.

Tasks:
- [ ] Keep `docs/EAGLE_PARITY_ROADMAP.md` current.
- [ ] Add smart collections for inbox, rights, prompt gaps, usage, orphans, duplicates, music, video, NFT/Web3, website-ready, and social-ready.
- [x] Add source/folder navigation and batch curation packet copy.
- [x] Add dry-run-first batch curation command copy plus CLI/MCP write gates.
- [ ] Add VIS curation memory: notes, tags, ratings, color labels, collections, and saved searches.
- [ ] Add audio preview and Music IS packet handoff.
- [ ] Add Eagle metadata adapter research for folders, tags, notes, and source URLs.
- [ ] Document what remains Eagle-owned versus VIS-owned.

Acceptance:
- [ ] Frank can use Eagle for daily designer browsing while VIS shows provenance, usage, MCP, and agent packets.
- [ ] VIS dashboard exposes the first Eagle-inspired cockpit slice.
- [ ] Eagle remains optional and no proprietary Eagle code is copied.
```
