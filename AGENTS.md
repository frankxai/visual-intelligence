# AGENTS.md — Shared brain for all agents working in this repo

> **Canonical instructions for every agent: Claude Code, Codex, Grok, and any other CLI.**
> `CLAUDE.md` is a shim that points here. Read this fully before doing any work.

## Mission

`visual-intelligence` (VIS) is the **asset record** for the FrankX / Arcanea / GenCreator estate. Every file is known by its hash, keeps rights at `unknown` until a person sets them, and records where it was placed. Agents search and propose. People set rights and publish.

## Who works here

Several agents on two machines work in this repo **at the same time**:
- **Claude** (`claude/`) — lane: **ingestion, dedup, manifest, provenance, and the library record**
- **Codex** (`codex/`) — lane: **catalog, MCP, n8n, GitHub Action**
- **Grok** (`agent/grok/`) — review-screen quality, guards, and the local library on this workstation, through PRs

Stay in your lane to avoid editing the same files. Cross-lane work goes **through an issue and a PR** so the other agents see it.

## The rules that keep us aligned

1. **`main` is the base.** The library record landed there as merge `60428b6`, and the private-preview note landed as `febd182`. Branch from `main`, open a PR into `main`, and rebase onto `main` before pushing.
2. **GitHub Issues are the task queue.** Before working an item, self-assign it and add `status:in-progress` plus your agent label. When you finish, comment on the issue with what changed and what comes next.
3. **Ship through a PR.** Do not push directly to `main` and do not force-push a shared branch. When lint and `node --test` are green and the diff does not cross issue #41, squash-merge the PR. Suggest the change, build it, and merge it. A written proposal with no PR is not done.
4. **Human gates** (issue #41): rights, publication, production deploys, R2 writes, and deleting the only copy. Agents never cross them.

## Accepted decisions (keep this honest)

- **Storage:** accepted `architecture_media_fabric_v3` in `frankxai/agentic-ops/registry/architecture_decisions.yaml`, ruled 2026-10-22, supersedes the earlier v2 default. R2 is the canonical binary/media lake; Supabase owns hosted metadata, provenance and approvals; Vercel Image handles web image delivery; existing published Blob renditions remain valid. Local VIS retains its offline catalog and stable identities. This decision does not authorize uploads, production migrations or public bucket access; issue #41 remains in force.
- **Build and buy:** own the record (hash, renditions, rights, provenance, placement, proposal events). Rent storage and resizing. Do **not** run Immich/PhotoPrism or rebuild Eagle (the 2026-06-26 Immich + R2-mirror lock is superseded).
- **Plan pack:** `.agent-harness/plans/library-and-storage-2026-09` on Frank's workstation.

## Current state

- The library record is on `main`: watched roots, thumb and preview renditions, proposals, the loopback operator screen, and the MCP gates.
- The operator screen is `node bin/vis.mjs library serve` at `http://127.0.0.1:4323`. It shows thumbs and a preview, sets rank, and accepts or dismisses proposals. It does not publish.
- `workers/vis-media` is the private preview Worker. `workers_dev` and preview URLs stay off. No route is added unless issue #41 is already satisfied and Frank asks.
- Issue #41 is the remaining human work: an Infisical login before a restic token, and a real page before a publication.
- The next build is the review screen itself: a folder rail, keyboard review, and a stable preview. Build it, test it, and merge it. Do not add a second catalog or a browser extension.

## Safety

- The repo is **public**. Never commit raw asset data, absolute local paths, secrets, or license-restricted images. Big data lives in gitignored `data/`.
- Machine health: the main workstation runs hot. Defer heavy crawls and large agent fan-outs, and never run an estate-wide scan without Frank.

## Quick start for a new session
```
git fetch origin
git checkout main
git pull --rebase origin main
git checkout -b agent/<you>/<N>-slug
# implement, then node --test
gh pr create --base main
# squash-merge only after lint and node --test are green, and only if the diff stays outside issue #41
```

## Handoff

Summarize changed files, validation run, risks, and any follow-up needed.

## Cloud and local asset continuation

Start at `docs/CLOUD_CONTINUATION.md` for the current handoff, branch, verification
and next task. Read `docs/VISUAL_WORKSPACE.md` for cockpit/location evidence,
`docs/ASSET_EXECUTION_PLAYBOOK.md` for bounded processing, and
`docs/CHATGPT_ASSET_INTAKE.md` for capture/provenance design. The reusable session
prompt is `docs/CREATIVE_OPERATOR_PROMPT.md`; cloud-project capture instructions
are prepared in `docs/CHATGPT_PROJECT_INSTRUCTIONS.md`.

Use the already merged library on main. Private indexes, masters, rendered local
snapshots and credentials stay outside Git. Cloud repository access does not
provide workstation paths, another session's browser, or unseen ChatGPT chats.
If an estate-only guide or brand reference is unavailable, report that scope and
continue repository-contained work; obtain the guide before dependent design or
release decisions. Instruction pointers do not install tools or cloud settings.

## Design Taste Kernel

For any site, app, landing page, dashboard, visual identity, brand, motion, media, social, or frontend task, apply the shared Design Taste Kernel before handoff:

- DESIGN_TASTE.md
- WEB_EXPERIENCE_STANDARD.md
- MOTION_TASTE_RUBRIC.md
- MULTI_AGENT_DESIGN_COUNCIL.md
- VISUAL_QA_GATE.md

When motion, scroll, generated media, GIF/video, or premium polish matters, route through the Motion Design Studio plugin/skills and verify the result visually.


<!-- PREMIUM-WEB-OS:START -->
## Premium Intelligence Web OS Adoption

This repo participates in the Starlight Premium Intelligence Web OS.

For any website, app, landing page, dashboard, brand surface, visual asset, motion system, 3D/WebGL scene, generated media, or public-facing UI work:

- Read the estate OS first: `_intelligence/README.md` in the estate design checkout.
- Use the activation contract: `_intelligence/adoption/activation-contract.md`.
- Treat `_intelligence/` as the source of truth for premium web taste, design, motion, WebGL, copy, assets, and quality gates.
- Use `/pwo` or the `premium-web-os` skill for full builds; use `/mad` for a design council pass.
- Use `/pwo review-pr` before absorbing another agent's PR or branch.
- Use `/pwo absorb-assets` before using external, generated, scientific, audio, video, or 3D assets.
- Use `/pwo motion-score` before shipping cinematic scroll, sound-paired motion, or complex choreography.
- Build static composition first, add Track A local motion second, add Track B GSAP/Lenis scroll only when earned, and add 3D only with fallback and reduced-motion behavior.
- Use this repository for asset provenance, curation packets, rights, and publication records.
- Use `_intelligence/visual-worlds/neural-cosmos.md` for neuroscience, cerebrum, spine, electron, signal, or golden spiral direction.
- Do not copy reference sites or agencies. Deconstruct principles and create original execution.
- Do not ship without responsive, accessibility, performance, reduced-motion, and visual QA checks appropriate to the change.

Repo-local instructions remain authoritative when stricter.
<!-- PREMIUM-WEB-OS:END -->


## Exact visual canon and sprite retrieval

When a task concerns Mini Frank, Nilo, Brio, Riff, Starlight Queen, conductor folios, Codex pets, third-party mascots, character variants, Figma portraits, sprite sheets, or rejected image examples:

1. Read `docs/character-canon/source-map.v1.json`, `docs/character-canon/sprite-origin-catalog.v1.json`, and `skills/visual-canon-retrieval/SKILL.md` **before** generating, importing, naming or publishing an asset.
2. Query the actual VIS catalog through `get_asset_sources`, `search_assets`, `get_asset`, and `get_asset_preview` only where a verified authenticated gateway exists. A local or proposed MCP tool is not a live connected tool.
3. Resolve private Mini Me reference bytes through the authorized skill/Library source. Public GitHub stores safe manifests and tool contracts, never private likeness masters, credentials or signed links.
4. Identify every edition by stable identity + version + source + measured hash + owner/rights/review state. Preserve rejected editions as private learning evidence and prevent default reference reuse.
5. Distinguish eight vendor-owned Codex WebP sprite declarations from five product-defined procedural Canvas skins. An extra `codex_bot` rendering branch exists in Starlight Agent Pet; it is **not** an approved sixth official upstream sprite.
6. Keep Figma source-map boards, Notion visual galleries and existing Drive folders as **projections**, not second asset registries. Do not infer rights from visibility or status from file placement.
7. When sources cannot be retrieved, stop identity-continuity generation or deliver a link-only review brief with unknown hashes. Never invent a likeness or claim archival.
8. Record QA and release separately. Human gates for R2 writes, rights, external publication and deployment still apply through issue #41.

Source verification and design-lineage work belongs in bounded issues and draft PRs. This hook does not install skills into unrelated repositories or external agents.
