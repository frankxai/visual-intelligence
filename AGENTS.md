# AGENTS.md — Shared brain for all agents working in this repo

> **Canonical instructions for every agent: Claude Code, Codex, Grok, and any other CLI.**
> `CLAUDE.md` is a shim that points here. Read this fully before doing any work.

## Mission

`visual-intelligence` (VIS) is the **asset record** for the FrankX / Arcanea / GenCreator estate. Every file is known by its hash, keeps rights at `unknown` until a person sets them, and records where it was placed. Agents search and propose. People set rights and publish.

## Who works here

Several agents on two machines work in this repo **at the same time**:
- **Claude** (`claude/`) — lane: **ingestion, dedup, manifest, provenance, and the library record**
- **Codex** (`codex/`) — lane: **catalog, MCP, n8n, GitHub Action**
- **Grok** (`agent/grok/`) — fixes and guards on the integration branch, through PRs

Stay in your lane to avoid editing the same files. Cross-lane work goes **through an issue and a PR** so the other agents see it.

## The rules that keep us aligned

1. **Integration branch:** `codex/visual-intelligence-os-v02` (draft #7) is where lanes meet until it lands on `main`. Branch from it, PR into it, and `git pull --rebase` before starting.
2. **GitHub Issues are the task queue.** Before working an item, self-assign it and add `status:in-progress` plus your agent label. When you finish, comment on the issue with what changed and what comes next.
3. **Never push to `main` or force-push a shared branch.** Branch per task, and open a PR that references the issue. Use small, conventional commits.
4. **Human gates** (issue #41): rights, publication, production deploys, R2 writes, and deleting the only copy. Agents never cross them.

## Accepted decisions (keep this honest)

- **Storage:** `architecture_media_fabric_v2` (frankxai/agentic-ops#44, accepted 2026-09-11). Vercel Blob/Image delivers new app media. R2 is a named exception only (frankxai/agentic-ops#115). There is no public `r2.dev` bucket.
- **Build and buy:** own the record (hash, renditions, rights, provenance, placement, proposal events). Rent storage and resizing. Do **not** run Immich/PhotoPrism or rebuild Eagle (the 2026-06-26 Immich + R2-mirror lock is superseded).
- **Plan pack:** `.agent-harness/plans/library-and-storage-2026-09` on Frank's workstation.

## Current state

- Phase 0 census: `docs/asset-os/PHASE0-REPORT.md`. Raw data lives in gitignored `data/`.
- The library record (watched roots, thumb/preview/ThumbHash, proposals, operator screen, MCP gates) is in #39.
- `vis keep` / truth / usage guard are on the integration branch (Grok and Codex lanes).

## Safety

- The repo is **public**. Never commit raw asset data, absolute local paths, secrets, or license-restricted images. Big data lives in gitignored `data/`.
- Machine health: the main workstation runs hot. Defer heavy crawls and large agent fan-outs, and never run an estate-wide scan without Frank.

## Quick start for a new session
```
git pull --rebase
gh issue list --label status:todo
gh issue edit <N> --add-label status:in-progress --add-label agent:<you> --add-assignee @me
git checkout -b <you>/<N>-slug codex/visual-intelligence-os-v02
# ...work... then:
gh pr create --fill --base codex/visual-intelligence-os-v02
```

## Handoff

Summarize changed files, validation run, risks, and any follow-up needed.

## Design Taste Kernel

For any site, app, landing page, dashboard, visual identity, brand, motion, media, social, or frontend task, apply the shared Design Taste Kernel before handoff:

- C:\Users\frank\starlight\repos\DESIGN_TASTE.md
- C:\Users\frank\starlight\repos\WEB_EXPERIENCE_STANDARD.md
- C:\Users\frank\starlight\repos\MOTION_TASTE_RUBRIC.md
- C:\Users\frank\starlight\repos\MULTI_AGENT_DESIGN_COUNCIL.md
- C:\Users\frank\starlight\repos\VISUAL_QA_GATE.md

When motion, scroll, generated media, GIF/video, or premium polish matters, route through the Motion Design Studio plugin/skills and verify the result visually.


<!-- PREMIUM-WEB-OS:START -->
## Premium Intelligence Web OS Adoption

This repo participates in the Starlight Premium Intelligence Web OS.

For any website, app, landing page, dashboard, brand surface, visual asset, motion system, 3D/WebGL scene, generated media, or public-facing UI work:

- Read the estate OS first: `C:\Users\frank\starlight\repos\_intelligence\README.md`.
- Use the activation contract: `C:\Users\frank\starlight\repos\_intelligence\adoption\activation-contract.md`.
- Treat `C:\Users\frank\starlight\repos\_intelligence\` as the source of truth for premium web taste, design, motion, WebGL, copy, assets, and quality gates.
- Use `/pwo` or the `premium-web-os` skill for full builds; use `/mad` for a design council pass.
- Use `/pwo review-pr` before absorbing another agent's PR or branch.
- Use `/pwo absorb-assets` before using external, generated, scientific, audio, video, or 3D assets.
- Use `/pwo motion-score` before shipping cinematic scroll, sound-paired motion, or complex choreography.
- Build static composition first, add Track A local motion second, add Track B GSAP/Lenis scroll only when earned, and add 3D only with fallback and reduced-motion behavior.
- Use VIS through `C:\Users\frank\starlight\repos\visual-intelligence` for asset provenance, curation packets, rights, and publication records.
- Use `C:\Users\frank\starlight\repos\_intelligence\visual-worlds\neural-cosmos.md` for neuroscience, cerebrum, spine, electron, signal, or golden spiral direction.
- Do not copy reference sites or agencies. Deconstruct principles and create original execution.
- Do not ship without responsive, accessibility, performance, reduced-motion, and visual QA checks appropriate to the change.

Repo-local instructions remain authoritative when stricter.
<!-- PREMIUM-WEB-OS:END -->
