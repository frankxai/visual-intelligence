# COORDINATION — live board

A quick human-readable view of who is doing what. **GitHub Issues are authoritative.** This file is a courtesy snapshot; update it in the same PR when you start or finish a lane item.

## Agents & lanes
| Agent | Machine | Lane | Branch prefix |
|-------|---------|------|---------------|
| Claude | FrankX workstation (runs hot; defer heavy crawls) | ingestion · dedup · manifest · provenance · library record | `claude/` |
| Codex | second laptop | catalog · MCP · n8n · GitHub Action | `codex/` |
| Grok | either | guards and fixes on the integration branch, via PR | `agent/grok/` |

## Protocol (1-line version)
`git pull --rebase` → claim issue (`status:in-progress` + `agent:*`) → branch from `codex/visual-intelligence-os-v02` → work → PR into it → comment handoff.

## Now / Next / Blocked
- **Now:** the library record is the operator screen at `http://127.0.0.1:4323`. Uploads need `VIS_ENABLE_PUBLISH=1`. One studio contact sheet is `generated-owned`. Every other asset stays `unknown`.
- **Next:** record a placement only when a real page serves those bytes. Published renditions go to Vercel Blob or the product repository.
- **Private preview:** `vis-media` is deployed to the confirmed Cloudflare account with `workers_dev` off, zero routes, and no r2.dev URL. Its secrets are set. A `test/` object was written and deleted.
- **Blocked:** the restic bucket still needs a token scoped to `starlight-restic-offsite` in Infisical. No watched master currently matches a frankx.ai page.

## Session log (newest first)
- 2026-10-17 Codex — continued PR #53 / issue #15. Reproduced and fixed read-only serving, output-file protection, inspector focus/motion, missing previews and feedback retry failures. Code revision `242476c` passes all 75 library/unit tests and 16 hosted Chromium cases; sample screenshots inspected at desktop, tablet, mobile touch emulation and reduced motion. See `docs/DASHBOARD_REVIEW.md`. PR stays draft pending independent review. Real private capture-to-placement, rights and production gates remain open.
- 2026-10-16 Codex — issue #15, branch `agent/codex/asset-cloud-handoff-20261016` from current `main`. Ports the read-only cockpit evidence/audit and a portable cloud/local handoff. Private catalogues, images and machine evidence are excluded. Rendered QA and independent review remain pending; draft PR, no deployment or human-gate action. The AGENTS.md main-based protocol supersedes the older integration-branch line above.
- 2026-09-30 Claude — merged `main` into the integration branch (AGENTS.md conflict), updated this board, triaged #2 and #23 as superseded by `architecture_media_fabric_v2`.
- 2026-06-26 Claude — scaffolded AGENTS.md/CLAUDE.md/COORDINATION.md, folded in Phase 0 census. Next: hand off to Codex for catalog infra.
