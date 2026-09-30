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
- **Now:** (Claude) library record #39 / #40, reviewing #38, reconciling the storage contract with `core/storage-sync-engine.mjs`.
- **Next:** land #7 on `main` once the lanes are green.
- **Blocked on Frank (#41):** frankxai/agentic-ops#115 (R2 exceptions), Worker account and secrets, restic token, first placement.

## Session log (newest first)
- 2026-09-30 Claude — merged `main` into the integration branch (AGENTS.md conflict), updated this board, triaged #2 and #23 as superseded by `architecture_media_fabric_v2`.
- 2026-06-26 Claude — scaffolded AGENTS.md/CLAUDE.md/COORDINATION.md, folded in Phase 0 census. Next: hand off to Codex for catalog infra.
