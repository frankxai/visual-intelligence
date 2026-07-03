# VIS Google Tasks Reminder Layer

Date: 2026-07-03

Google Tasks is a personal nudge layer, not the VIS backlog. GitHub Issues plus `docs/VIS_TASK_REGISTRY.json` remain canonical because Codex, Claude, and future agents can read, sync, and audit them from the repo.

Use Google Tasks for human actions that need to happen on a device, account, or calendar rhythm.

## Rules

- One Google Task should map to one GitHub issue.
- Put the GitHub issue URL in the Google Task details.
- Do not paste secrets, local private paths, API keys, or account details into Google Tasks.
- Keep implementation notes in GitHub Issues, PRs, or repo docs.
- Close or reschedule Google Tasks during the weekly VIS review.

## Copy-Ready Personal Tasks

- [ ] VIS-001: Create Google Drive `Starlight Creative Vault` and verify both laptops can see it.
- [ ] VIS-001: Test phone 1 upload into `00_INBOX_MOBILE`.
- [ ] VIS-001: Test phone 2 upload into `00_INBOX_MOBILE`.
- [ ] VIS-002: Buy Eagle license.
- [ ] VIS-002: Install Eagle and browser extension on laptop 1.
- [ ] VIS-002: Install Eagle and browser extension on laptop 2.
- [ ] VIS-002: Place Eagle library inside `01_Eagle_Library`.
- [ ] VIS-003: Pull VIS branch and run `npm install`, `npm run lint`, `npm test`, and `node bin\vis.mjs doctor` on laptop 1.
- [ ] VIS-003: Pull VIS branch and run `npm install`, `npm run lint`, `npm test`, and `node bin\vis.mjs doctor` on laptop 2.
- [ ] VIS-003: Install `vis-mcp` in Claude on laptop 1.
- [ ] VIS-003: Install `vis-mcp` in Claude on laptop 2.
- [ ] VIS-004: Point VIS at Drive vault, Eagle library, repo estate, and Music IS proof folders.
- [ ] VIS-008: Move one useful phone asset from Google Photos into Drive inbox and scan it with VIS.
- [ ] VIS-023: Ask Claude on the other PC to run the VIS cross-check and comment evidence on the issue.
- [ ] Weekly: Run VIS project review, update issue statuses, and regenerate `docs/PROJECT_STATUS_REPORT.md`.

## Suggested Cadence

- Daily: capture or curate new assets into Drive/Eagle, then use VIS dashboard or packets for agent work.
- Twice weekly while setting up: run install and MCP checks on whichever laptop changed.
- Weekly: review inbox, rights, duplicates, orphans, prompt gaps, and issue statuses.
- Monthly: review adapter priorities, product packaging, pricing, and whether Eagle/Cloudinary/R2/Postiz usage changed.

## Report Command

Use this before or after weekly review:

```powershell
npm run project:report
```

It regenerates `docs/PROJECT_STATUS_REPORT.md` from the canonical registry and current GitHub issue links.
