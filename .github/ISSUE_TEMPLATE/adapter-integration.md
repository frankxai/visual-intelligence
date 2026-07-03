---
name: Adapter integration
about: External tool/service adapter such as Eagle, Drive, Cloudinary, R2, Postiz, Music IS
title: "Adapter: "
labels: adapter
assignees: ""
---

## External System

Name, docs/source URL, license/commercial posture, and why VIS needs it.

## Integration Boundary

- Source of truth:
- Read operations:
- Write operations:
- Human-gated actions:

## Tasks

- [ ] Add source/license note to `docs/OPEN_SOURCE_TECH_RADAR.md`
- [ ] Define dry-run manifest or read model
- [ ] Implement adapter
- [ ] Add docs and tests

## Acceptance Criteria

- [ ] No secrets committed
- [ ] Dry-run before writes
- [ ] Provider IDs/URLs/checksums recorded where relevant
- [ ] Paths outside allowlist redacted in MCP responses
