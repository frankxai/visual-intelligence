# Continue asset work from GitHub or a connected computer

Repository: `frankxai/visual-intelligence`.
Publication branch: `agent/codex/asset-cloud-handoff-20261016`.
Base: main at `812c538cdc2f773cd0735ffb49edbeac0b0116e9`.
Source implementation: the earlier local `85e6dd5` slice, ported onto current main.
Tracking: [#15](https://github.com/frankxai/visual-intelligence/issues/15), with
[#40](https://github.com/frankxai/visual-intelligence/issues/40) for library history
and [#41](https://github.com/frankxai/visual-intelligence/issues/41) for human gates.

## What is available here

The merged library remains intact: watched roots, hash identity, renditions,
proposals, operator screen and gated MCP. This branch adds a read-only coverage
audit, location/processing evidence in the existing catalogue cockpit, optional
bounded local file-presence checks and an inventory JSON export. It also supplies
the capture instruction kit and reusable execution prompt.

The private catalogue, original media, generated local HTML snapshot, source chats,
provider account inventories, credentials and machine evidence are not in GitHub.
Brand-specific private planning remains with its authorised owner. Do not infer
access to those records from a repository connection or the earlier conversation.

| Work | Cloud repository session | Local or connected computer |
| --- | --- | --- |
| Code, docs, tests and pull-request review | Can continue with repository/tool access | Can also continue |
| UI review with synthetic or authorised sample data | Can continue with an available browser and admitted runtime | Can also continue |
| Inspect or move workstation originals | No access from an ordinary cloud container | Needs the host online, authorised paths and working tools |
| Open the private local catalogue/snapshot | Must receive an explicitly authorised copy or scoped service | Use the owning machine's private files |
| Read Drive/Cloudinary/other cloud assets | Needs separately authenticated tools and permissions | Same requirement; GitHub grants none |
| Access private ChatGPT image/chats | Only through an actually available authorised session/export | Same requirement; never assume unseen-chat access |
| Publish, change rights, write R2 or deploy | Follow #41 and the applicable approvals | Same gates |

Cloud-only code work can run while the workstation is off. Eligible Work Cloud
tasks with local computer access can use an online connected host when that
feature is enabled. Availability and setup must be verified; this handoff does
not enable access or convert an older chat. See [Codex Cloud](https://learn.chatgpt.com/docs/cloud),
[local computer access](https://learn.chatgpt.com/docs/enterprise/cloud-local-access)
and [remote connections](https://learn.chatgpt.com/docs/remote-connections).

## Start a cloud session

Select this repository in a supported cloud coding environment. Explicitly check
out the publication branch, or fetch it from a new owned branch. Do not assume the
default main branch contains an unmerged draft PR. Read `AGENTS.md`, this guide,
`VISUAL_WORKSPACE.md` and `CREATIVE_OPERATOR_PROMPT.md` first.

Use Node >=22.13 with the repository's supported dependencies. The full library
suite uses optional `sharp` and `thumbhash`; install through the cloud environment's
approved package setup when absent. Never substitute the private local index for
a test fixture. Start with:

```sh
node --test --test-concurrency=1 tests/asset-coverage.test.mjs tests/vis-dashboard.test.mjs
npm run lint
node bin/vis.mjs --help
```

For broader library changes, run the full suite with its dependencies. A Linux
cloud test does not prove Windows desktop control, file moves or native bindings.

## Next useful task

Review this exact PR revision independently, then inspect the running cockpit with
temporary sample assets at mobile/tablet/desktop sizes. Verify loading failures,
evidence filters, JSON export, read-only decisions, keyboard focus/return, touch
and reduced motion. Preserve the accepted library/operator; do not make another
catalogue or server. Keep rendered QA and independent-review status pending until
performed. Coordinate cross-lane work through the existing issue and PR.

After that, prove one authorised source image plus context through intake,
deduplication/retry and one reviewed placement. Real private asset selection,
native folder operations, source-chat recovery, cloud authentication, calibrated
taste and production acceptance remain open. The handoff does not close them.

## Prompt to paste into ChatGPT Work or Codex Cloud

```text
Continue frankxai/visual-intelligence on branch
agent/codex/asset-cloud-handoff-20261016. Read AGENTS.md and
docs/CLOUD_CONTINUATION.md, then use docs/CREATIVE_OPERATOR_PROMPT.md.
Verify the checkout and current PR head. Keep the merged library intact.
First review the code and run the focused tests, then use temporary sample assets
to verify the actual interface and fix concrete failures. Track work in issue #15.
Do not assume access to my local index, images, browser, other chats or credentials.
Use an authorised connected host only for steps that require it. Keep private data
out of GitHub and previews. Deliver reviewed code and evidence through the PR;
keep deployment and human-gated actions separate.
```

Maintain the product issue and `frankxai/agentic-ops-hub` handover. Update this guide
when the branch lands or the next task changes, preserving unresolved outcomes.
