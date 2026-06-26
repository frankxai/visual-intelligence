# COORDINATION — live board for the two-agent setup

Quick human-readable view of who's doing what. **GitHub Issues are authoritative**;
this file is a courtesy snapshot. Update it in the same PR when you start/finish a lane item.

## Agents & lanes
| Agent | Machine | Lane | Branch prefix |
|-------|---------|------|---------------|
| Claude | FrankX workstation (runs hot — defer heavy crawls) | ingestion · dedup · manifest · provenance | `claude/` |
| Codex | second laptop | catalog infra (Immich/PhotoPrism) · mcp · n8n · GitHub Action | `codex/` |

## Protocol (1-line version)
`git pull --rebase` → claim issue (`status:in-progress` + `agent:*`) → branch → work → PR `Closes #N` → comment handoff.

## Now / Next / Blocked
- **Now:** (Claude) bootstrapping coordination layer — this PR.
- **Next:** P1 catalog stand-up (Codex) · P2 manifest+dedup into `visual-registry.json` (Claude).
- **Blocked:** P1 needs a host decision for Immich/PhotoPrism (VPS vs Cloudflare) — see issue.

## Session log (newest first — append a line when you start/end a session)
- 2026-06-26 Claude — scaffolded AGENTS.md/CLAUDE.md/COORDINATION.md, folded in Phase 0 census. Next: hand off to Codex for catalog infra.
