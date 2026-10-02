# VIS Project Status Report

Date: 2026-07-03

Registry: `docs/VIS_TASK_REGISTRY.json`
GitHub repo: https://github.com/frankxai/visual-intelligence

## Summary

- Total issues in registry: 27
- Open issues: 17
- Completed issues: 10
- Blocked issues: 1
- Human-gated open issues: 4
- GitHub Projects v2: pending_project_scope

## Milestones

| Milestone | Open | Done | Next Visible Work |
| --- | ---: | ---: | --- |
| M0 Personal Estate Setup | 6 | 3 | [#8 VIS-001](https://github.com/frankxai/visual-intelligence/issues/8), [#9 VIS-002](https://github.com/frankxai/visual-intelligence/issues/9), [#10 VIS-003](https://github.com/frankxai/visual-intelligence/issues/10) |
| M1 Daily Cockpit | 3 | 5 | [#12 VIS-005](https://github.com/frankxai/visual-intelligence/issues/12), [#15 VIS-008](https://github.com/frankxai/visual-intelligence/issues/15), [#23 VIS-016](https://github.com/frankxai/visual-intelligence/issues/23) |
| M2 Asset Intelligence | 4 | 2 | [#13 VIS-006](https://github.com/frankxai/visual-intelligence/issues/13), [#14 VIS-007](https://github.com/frankxai/visual-intelligence/issues/14), [#18 VIS-011](https://github.com/frankxai/visual-intelligence/issues/18) |
| M3 Media Expansion | 1 | 0 | [#16 VIS-009](https://github.com/frankxai/visual-intelligence/issues/16) |
| M4 Product Beta | 3 | 0 | [#20 VIS-013](https://github.com/frankxai/visual-intelligence/issues/20), [#21 VIS-014](https://github.com/frankxai/visual-intelligence/issues/21), [#31 VIS-024](https://github.com/frankxai/visual-intelligence/issues/31) |

## Install And Estate Lane

These are the tasks that make VIS real across Google Drive, Eagle, two laptops, two phones, Claude/Codex MCP, scans, and dashboard checks.

- [#8 VIS-001](https://github.com/frankxai/visual-intelligence/issues/8) Set up Google Drive Creative Vault across two laptops and two phones - `todo` `setup` `good-first-internal`
- [#9 VIS-002](https://github.com/frankxai/visual-intelligence/issues/9) Buy, install, and configure Eagle as the visual inbox - `todo` `setup` `human-gated`
- [#10 VIS-003](https://github.com/frankxai/visual-intelligence/issues/10) Install VIS MCP and run doctor on both laptops - `todo` `setup` `mcp`
- [#11 VIS-004](https://github.com/frankxai/visual-intelligence/issues/11) Build VIS scan profile for Drive, Eagle, repos, and Music IS - `todo` `setup` `product`
- [#30 VIS-023](https://github.com/frankxai/visual-intelligence/issues/30) Run two-laptop VIS software install and MCP evidence report - `todo` `setup` `mcp` `human-gated` `agent:claude`
- [#32 VIS-025](https://github.com/frankxai/visual-intelligence/issues/32) Enable GitHub Projects v2 board after gh project scope refresh - `blocked` `setup` `human-gated`

## Product Evolution Lane

These are the tasks that turn the internal OS into the sellable product: cockpit, intelligence, adapters, media expansion, and beta packaging.

- [#12 VIS-005](https://github.com/frankxai/visual-intelligence/issues/12) Build Next.js/PWA daily cockpit MVP - `todo` `dashboard` `product`
- [#13 VIS-006](https://github.com/frankxai/visual-intelligence/issues/13) Add Eagle adapter for library metadata and import mapping - `todo` `adapter` `product`
- [#14 VIS-007](https://github.com/frankxai/visual-intelligence/issues/14) Add Google Drive metadata adapter - `todo` `adapter`
- [#15 VIS-008](https://github.com/frankxai/visual-intelligence/issues/15) Define mobile inbox workflow for Google Photos and Drive - `todo` `setup` `product`
- [#16 VIS-009](https://github.com/frankxai/visual-intelligence/issues/16) Add music/audio integration with Music IS - `todo` `music` `adapter`
- [#18 VIS-011](https://github.com/frankxai/visual-intelligence/issues/18) Add rights and approval review board - `todo` `dashboard` `security`
- [#19 VIS-012](https://github.com/frankxai/visual-intelligence/issues/19) Add semantic and visual similarity search - `todo` `product` `research`
- [#20 VIS-013](https://github.com/frankxai/visual-intelligence/issues/20) Add R2 and Cloudinary publication/storage adapters - `todo` `adapter` `human-gated`
- [#21 VIS-014](https://github.com/frankxai/visual-intelligence/issues/21) Prepare private beta product package - `todo` `product`
- [#23 VIS-016](https://github.com/frankxai/visual-intelligence/issues/23) Build Eagle parity cockpit slice and adapter path - `todo` `dashboard` `adapter` `product`
- [#31 VIS-024](https://github.com/frankxai/visual-intelligence/issues/31) Run weekly VIS product experiment and reporting loop - `todo` `product` `research` `good-first-internal`

## Google Tasks Reminder Candidates

Google Tasks should only contain personal nudges. Use these as copy-ready task titles and keep the GitHub issue as the detail link.

- [ ] VIS-001: Set up Google Drive Creative Vault across two laptops and two phones (https://github.com/frankxai/visual-intelligence/issues/8)
- [ ] VIS-002: Buy, install, and configure Eagle as the visual inbox (https://github.com/frankxai/visual-intelligence/issues/9)
- [ ] VIS-003: Install VIS MCP and run doctor on both laptops (https://github.com/frankxai/visual-intelligence/issues/10)
- [ ] VIS-004: Build VIS scan profile for Drive, Eagle, repos, and Music IS (https://github.com/frankxai/visual-intelligence/issues/11)
- [ ] VIS-008: Define mobile inbox workflow for Google Photos and Drive (https://github.com/frankxai/visual-intelligence/issues/15)
- [ ] VIS-013: Add R2 and Cloudinary publication/storage adapters (https://github.com/frankxai/visual-intelligence/issues/20)
- [ ] VIS-023: Run two-laptop VIS software install and MCP evidence report (https://github.com/frankxai/visual-intelligence/issues/30)
- [ ] VIS-024: Run weekly VIS product experiment and reporting loop (https://github.com/frankxai/visual-intelligence/issues/31)
- [ ] VIS-025: Enable GitHub Projects v2 board after gh project scope refresh (https://github.com/frankxai/visual-intelligence/issues/32)

## Agent Cross-Check

Use this on the second laptop or with Claude before changing scope:

```powershell
cd C:\Users\frank\starlight\repos\visual-intelligence
git fetch origin
git checkout codex/visual-intelligence-os-v02
git pull
npm install
npm run project:status
npm run lint
npm test
node bin\vis.mjs doctor
node bin\vis.mjs scan-profile frank-estate --json
node bin\vis.mjs dashboard --limit 3000
```

## Management Rule

Update `docs/VIS_TASK_REGISTRY.json` first, run `npm run tasks:dry-run`, sync with `npm run tasks:sync -- --execute`, then regenerate this report with `npm run project:report`.
