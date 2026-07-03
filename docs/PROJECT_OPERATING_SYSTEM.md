# VIS Project Operating System

Date: 2026-07-03

This document defines how VIS work is tracked across GitHub, Markdown, Google Tasks, and agent handoffs. The goal is simple: every install task, product feature, experiment, cross-device check, and report has one owner, one status, and one place to update first.

## Source Of Truth

| Layer | Use For | Source Of Truth? |
| --- | --- | --- |
| GitHub Issues | Shared execution, cross-agent handoff, milestones, implementation evidence, Claude/Codex review. | Yes |
| `docs/VIS_TASK_REGISTRY.json` | Repo-editable registry that creates or updates labels, milestones, and issues. Agents edit this before syncing GitHub. | Yes |
| `docs/PROJECT_BOARD.md` | Human-readable Now/Next/Later operating view. | Snapshot |
| `docs/GITHUB_ISSUE_BACKLOG.md` | Offline issue body fallback and audit trail. | Snapshot |
| Google Tasks or Calendar | Personal reminders for human actions on phones and laptops. | No |

Google Tasks should not become the product backlog. Use it for time-bound personal actions only: buying Eagle, installing on laptop 2, weekly review, mobile inbox curation, and cross-device smoke checks.

## Operating Rule

1. Add or change work in `docs/VIS_TASK_REGISTRY.json`.
2. Run `npm run tasks:dry-run`.
3. Run `npm run tasks:sync -- --execute` when the dry-run is clean.
4. Update `docs/PROJECT_BOARD.md` only when the Now/Next/Later view changes.
5. Commit and push the repo changes so the other laptop and Claude can cross-check.

## Board Model

Use GitHub milestones for phases:

- `M0 Personal Estate Setup`: Drive, Eagle, VIS, MCP, two laptops, two phones.
- `M1 Daily Cockpit`: dashboard/PWA and daily browsing workflow.
- `M2 Asset Intelligence`: provenance, usage, rights, duplicates, prompts, agent memory.
- `M3 Media Expansion`: audio, music, video, release proof folders, Music IS links.
- `M4 Product Beta`: packaging, pricing, demo dataset, beta user install flow.

Use labels for routing:

- `setup`: installation, device setup, local estate operations.
- `product`: core VIS capability, user workflow, packaging.
- `dashboard`: cockpit, visual browser, PWA, UX.
- `mcp`: agent resources, tools, gates, Claude/Codex access.
- `adapter`: Eagle, Drive, Cloudinary, R2, Postiz, IPFS, thirdweb, Music IS.
- `music`: audio, releases, proof folders, cover/Canvas/lyrics.
- `security`: rights, secrets, allowlists, human gates.
- `research`: market, competitor, open source, model/provider evaluation.
- `human-gated`: purchase, upload, publish, wallet, cloud spend, account action.

Use status labels:

- `status:todo`: available.
- `status:in-progress`: actively claimed.
- `status:blocked`: waiting on credential, purchase, external install, or human decision.
- `status:done`: complete and verified.

Use agent labels when useful:

- `agent:codex`
- `agent:claude`

## Google Tasks Layer

Create these as personal reminders if you want phone-native nudges:

- Buy Eagle and install it on laptop 1.
- Install Eagle and Google Drive for desktop on laptop 2.
- Create `Google Drive / Starlight Creative Vault`.
- Upload one phone asset into `00_INBOX_MOBILE`.
- Run VIS doctor/lint/test on laptop 1.
- Run VIS doctor/lint/test on laptop 2.
- Install `vis-mcp` in Claude on laptop 1.
- Install `vis-mcp` in Claude on laptop 2.
- Weekly VIS review: inbox, rights, duplicates, orphans, GitHub Issues.

Each Google Task should link back to the relevant GitHub issue, not contain the whole plan.

## Cross-Agent Handoff

When Codex, Claude, or another trusted agent starts work:

1. Pull the active branch and check dirty files.
2. Read `README.md`, `AGENTS.md`, `docs/PROJECT_OPERATING_SYSTEM.md`, and the target issue.
3. Add or keep the correct agent label on the GitHub issue.
4. Move the issue to `status:in-progress` when claimed.
5. Keep implementation evidence in the issue comment or PR summary.
6. Update `docs/VIS_TASK_REGISTRY.json` if scope, acceptance, or completion changes.
7. Run the smallest relevant validation set before handoff.

For this branch, Claude on the other PC should start with:

```powershell
cd C:\Users\frank\starlight\repos\visual-intelligence
git fetch origin
git checkout codex/visual-intelligence-os-v02
git pull
npm install
npm run lint
npm test
node bin\vis.mjs doctor
node bin\vis.mjs scan-profile frank-estate --json
node bin\vis.mjs dashboard --limit 3000
```

## Evidence Standard

Each issue should end with evidence appropriate to the work:

- Install/setup: device, path, command output summary, blocker notes.
- Dashboard/product: screenshot or visual QA note, command output summary, known limitations.
- MCP: tool/resource smoke test and allowed roots.
- Adapter: dry-run manifest before any write or upload.
- Security: secrets not printed, private paths not exported, human gates preserved.
- Music: Music IS remains canonical and VIS only indexes or packets media context.

## Weekly Review

Use `.github/ISSUE_TEMPLATE/weekly-review.md` or `docs/WEEKLY_REVIEW_CHECKLIST.md`.

The weekly review should:

1. Clear mobile and Eagle/Drive inboxes.
2. Run VIS health checks.
3. Review rights, duplicate, orphan, and prompt gaps.
4. Pick one product improvement for the week.
5. Update issue labels and `docs/PROJECT_BOARD.md`.
6. Log any product or market learning.

## GitHub Projects V2

GitHub Issues and milestones are enough for now. Add GitHub Projects v2 only after the local GitHub CLI token has project scope:

```powershell
gh auth refresh -s read:project,project
```

Then create a project named `Visual Intelligence OS` and add the milestone issues. Until then, do not block the product on Projects v2.
