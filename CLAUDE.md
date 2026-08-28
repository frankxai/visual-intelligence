# CLAUDE.md

Read **`AGENTS.md`** first — it is the canonical, shared instruction set for every agent
(Claude Code, Codex, and others) working in this repo. This file is only a pointer.

Key reminders:
- Pull-rebase before work; claim a GitHub Issue before starting; never push to `main`; branch + PR.
- Claude's lane: ingestion / dedup / manifest / provenance. Codex's lane: catalog infra / MCP / n8n / Action.
- Repo is public — keep raw asset data and local paths out of git (`data/` is gitignored).
