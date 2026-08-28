# AGENTS.md — Shared brain for all agents working in this repo

> **Canonical instructions for every agent — Claude Code, Codex, and any other CLI.**
> `CLAUDE.md` is a shim that points here. Read this fully before doing any work.

## Mission

`visual-intelligence` (VIS) is the **Asset OS** for the FrankX / Arcanea ecosystem:
one source of truth for managing visual assets — and their prompts and plans —
across every repo and machine. Audit → dedup → catalog → curate → provenance → publish.

## Who works here

Two agents on two machines operate this repo **concurrently**:
- **Claude** (FrankX main workstation) — lane: **ingestion / dedup / manifest / provenance**
- **Codex** (second laptop) — lane: **catalog infra / MCP / n8n automations / GitHub Action**

Stay in your lane to avoid editing the same files. Cross-lane work is allowed but
**only via an issue + PR** so the other agent sees it.

## The 4 rules that keep us aligned

1. **Single source of truth = this repo, `main` branch.** Always `git pull --rebase` before starting.
2. **GitHub Issues are the task queue.** Before working an item:
   - self-assign the issue, add label `status:in-progress` + your agent label (`agent:claude` / `agent:codex`).
   - If it is already claimed by the other agent, pick a different one.
   - Comment on the issue when you finish: *what changed + what's next* (this is the handoff log).
3. **Never push to `main`.** Branch per task: `claude/<issue#>-slug` or `codex/<issue#>-slug`.
   Open a PR that references the issue (`Closes #N`). Small, conventional commits
   (`feat:`, `fix:`, `chore:`, `docs:`).
4. **Lanes** (see above) minimize file-level collisions. When in doubt, smaller PRs, merge often.

## Definition of "claimed" / "done"
- **Claimed:** issue assigned + `status:in-progress` label + your agent label.
- **Done:** PR merged to `main`, issue closed, handoff comment posted.

## Current state (updated by whoever changes it — keep this honest)
- **Phase 0 (census) — DONE.** `docs/asset-os/PHASE0-REPORT.md`. 3,146 assets, 336 exact-dup
  clusters (~350 MB), no provenance, license unverified. Raw manifest/dup data is in
  `data/phase0/` (gitignored — local only; repo is public).
- **Locked decisions:** OSS catalog (Immich/PhotoPrism) · hybrid topology (local masters + Cloudflare R2 mirror)
  · thin Supabase+pgvector manifest backbone · reuse `arcanea-onchain` `canon-checker` + Prompt Hub + Higgsfield.
- **Existing VIS building blocks:** `scripts/scan-visual-registry.mjs` (→ `data/visual-registry.json` = the manifest),
  `scripts/audit-visual-health.mjs` (placeholders/dupes/orphans/oversized), `vis.config.json` `council` perspectives
  (= the curation eval council), `bin/vis.mjs` CLI, `action.yml` (PR-gate Action).

## Roadmap (issues track the detail)
- **P1** Catalog: stand up Immich/PhotoPrism + R2 mirror *(Codex lane)*
- **P2** Manifest+embeddings: extend `visual-registry.json` with sha256 dedup + CLIP vectors *(Claude lane)*
- **P3** Curation council: wire `canon-checker` + quality scorer into the audit *(shared)*
- **P4** Provenance graph: prompt + model + seed + plan-id per asset *(Claude lane)*
- **P5** Publish/mint: IPFS/Arweave pin → Vanguard 20 *(shared)*

## Safety
- Repo is **public** — never commit raw asset data, local paths, secrets, or license-restricted images.
  Big data lives in gitignored `data/`. Flip repo private if you need to track manifests.
- Machine health: the main workstation runs hot (RED). Defer heavy crawls/large agent fan-outs;
  prefer the second laptop for compute-heavy steps.

## Quick start for a new session
```
git pull --rebase
gh issue list --label status:todo        # find unclaimed work
gh issue edit <N> --add-label status:in-progress --add-label agent:<you> --add-assignee @me
git checkout -b <you>/<N>-slug
# ...work...  then PR:
gh pr create --fill --base main
```
