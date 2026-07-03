# GitHub Issue Sync Report

Date: 2026-07-03

Canonical registry: `docs/VIS_TASK_REGISTRY.json`

Sync command:

```powershell
npm run tasks:sync -- --execute
```

## Result

- Labels synced: 16
- Milestones created: 5
- Registry-backed VIS issues: 25
- Latest new VIS issues created: VIS-022 through VIS-025 / issues #29-#32
- Existing VIS issues updated on 2026-07-03 from the registry
- Status labels added: `status:blocked`, `status:done`
- VIS-010 / issue #17 marked `status:done` and closed as completed
- VIS-015 / issue #22 marked `status:done` and closed as completed
- VIS-017 / issue #24 marked `status:done` and closed as completed
- VIS-018 / issue #25 marked `status:done` and closed as completed
- VIS-019 / issue #26 marked `status:done` and closed as completed
- VIS-020 / issue #27 marked `status:done` and closed as completed
- VIS-021 / issue #28 marked `status:done` and closed as completed
- VIS-022 / issue #29 marked `status:done` and closed as completed
- VIS-023 / issue #30 opened for two-laptop install, MCP, and evidence reporting
- VIS-024 / issue #31 opened for weekly product experiment reporting
- VIS-025 / issue #32 opened as `status:blocked` until `gh` has project scope
- GitHub Projects v2: pending local `gh` token project scope

## Milestones

| Milestone | Open Issues |
| --- | ---: |
| M0 Personal Estate Setup | 6 |
| M1 Daily Cockpit | 3 |
| M2 Asset Intelligence | 4 |
| M3 Media Expansion | 1 |
| M4 Product Beta | 3 |

## Issues

| Key | Issue | Milestone |
| --- | --- | --- |
| VIS-001 | [#8 Set up Google Drive Creative Vault across two laptops and two phones](https://github.com/frankxai/visual-intelligence/issues/8) | M0 Personal Estate Setup |
| VIS-002 | [#9 Buy, install, and configure Eagle as the visual inbox](https://github.com/frankxai/visual-intelligence/issues/9) | M0 Personal Estate Setup |
| VIS-003 | [#10 Install VIS MCP and run doctor on both laptops](https://github.com/frankxai/visual-intelligence/issues/10) | M0 Personal Estate Setup |
| VIS-004 | [#11 Build VIS scan profile for Drive, Eagle, repos, and Music IS](https://github.com/frankxai/visual-intelligence/issues/11) | M0 Personal Estate Setup |
| VIS-005 | [#12 Build Next.js/PWA daily cockpit MVP](https://github.com/frankxai/visual-intelligence/issues/12) | M1 Daily Cockpit |
| VIS-006 | [#13 Add Eagle adapter for library metadata and import mapping](https://github.com/frankxai/visual-intelligence/issues/13) | M2 Asset Intelligence |
| VIS-007 | [#14 Add Google Drive metadata adapter](https://github.com/frankxai/visual-intelligence/issues/14) | M2 Asset Intelligence |
| VIS-008 | [#15 Define mobile inbox workflow for Google Photos and Drive](https://github.com/frankxai/visual-intelligence/issues/15) | M1 Daily Cockpit |
| VIS-009 | [#16 Add music/audio integration with Music IS](https://github.com/frankxai/visual-intelligence/issues/16) | M3 Media Expansion |
| VIS-010 | [#17 Add agent provenance sidecars for generated media](https://github.com/frankxai/visual-intelligence/issues/17) | M2 Asset Intelligence |
| VIS-011 | [#18 Add rights and approval review board](https://github.com/frankxai/visual-intelligence/issues/18) | M2 Asset Intelligence |
| VIS-012 | [#19 Add semantic and visual similarity search](https://github.com/frankxai/visual-intelligence/issues/19) | M2 Asset Intelligence |
| VIS-013 | [#20 Add R2 and Cloudinary publication/storage adapters](https://github.com/frankxai/visual-intelligence/issues/20) | M4 Product Beta |
| VIS-014 | [#21 Prepare private beta product package](https://github.com/frankxai/visual-intelligence/issues/21) | M4 Product Beta |
| VIS-015 | [#22 Add GitHub issue templates and weekly review ritual](https://github.com/frankxai/visual-intelligence/issues/22) | M0 Personal Estate Setup |
| VIS-016 | [#23 Build Eagle parity cockpit slice and adapter path](https://github.com/frankxai/visual-intelligence/issues/23) | M1 Daily Cockpit |
| VIS-017 | [#24 Add VIS asset action recipes for agentic curation queues](https://github.com/frankxai/visual-intelligence/issues/24) | M2 Asset Intelligence |
| VIS-018 | [#25 Add Creative Vault planner for two-laptop and mobile asset intake](https://github.com/frankxai/visual-intelligence/issues/25) | M0 Personal Estate Setup |
| VIS-019 | [#26 Add live smart collection evaluation for Eagle-style queues](https://github.com/frankxai/visual-intelligence/issues/26) | M1 Daily Cockpit |
| VIS-020 | [#27 Add color palette intelligence for Eagle-style filtering](https://github.com/frankxai/visual-intelligence/issues/27) | M1 Daily Cockpit |
| VIS-021 | [#28 Add dry-run batch rename for Eagle-style bulk cleanup](https://github.com/frankxai/visual-intelligence/issues/28) | M1 Daily Cockpit |
| VIS-022 | [#29 Add VIS project status reporting and Google Tasks reminder layer](https://github.com/frankxai/visual-intelligence/issues/29) | M0 Personal Estate Setup |
| VIS-023 | [#30 Run two-laptop VIS software install and MCP evidence report](https://github.com/frankxai/visual-intelligence/issues/30) | M0 Personal Estate Setup |
| VIS-024 | [#31 Run weekly VIS product experiment and reporting loop](https://github.com/frankxai/visual-intelligence/issues/31) | M4 Product Beta |
| VIS-025 | [#32 Enable GitHub Projects v2 board after gh project scope refresh](https://github.com/frankxai/visual-intelligence/issues/32) | M0 Personal Estate Setup |

## Existing Legacy Issues

Issues #2 through #6 predate this registry and remain open. They should be consolidated into the VIS registry or closed after their requirements are mapped to the new milestone issues.

## Next Project Step

Run this once Frank is ready to grant GitHub Projects scope:

```powershell
gh auth refresh -s read:project,project
```

Then create a GitHub Projects v2 board named `Visual Intelligence OS` and add the milestone issues.
