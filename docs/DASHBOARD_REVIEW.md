# PR #53 review and verification

Tracking: [issue #15](https://github.com/frankxai/visual-intelligence/issues/15)
and [PR #53](https://github.com/frankxai/visual-intelligence/pull/53).
Primary review and screenshot inspection: 17 October 2026. Independent review
remains pending; keep the PR in draft.

The existing watched-library record, operator and MCP gates are preserved.
All browser assets are synthetic SVG fixtures created in a temporary directory.
No private catalogue, originals, source chats or credentials are included.

## Concrete repairs

| Before | After | Why |
| --- | --- | --- |
| Read-only HTTP serving reached the mutation path; raw index files could be served from the output directory | Early read-only denial, loopback binding, origin/Host checks and a static-file allowlist | Keep sample preview and private local serving within their intended boundary |
| A generated output could alias and overwrite the input SQLite file | Check every output target against the index by device/inode | Preserve the catalogue, including hard-link aliases |
| A zero limit silently became the default | Validate the supplied limit explicitly | Make bounded processing predictable |
| Background controls remained reachable during inspector review | Make the background inert, contain focus and return it on close | Keyboard users can complete review without losing their place |
| Keyboard review animated and modified browser shortcuts could trigger review actions | Instant keyboard transitions and preserved modifier shortcuts | Keep review responsive and native copy usable |
| Missing files left a broken preview; controls pushed the gallery below small screens | Explicit unavailable-preview state and compact responsive controls | Show usable asset cards and explain missing media |
| Whitespace-only prompt records counted as available prompts | Require non-empty prompt text | Keep evidence filters and counts truthful |
| Feedback could commit, then report failure after a ledger-drain error | Return the saved decision with a pending-sync receipt; retain the retryable outbox | Avoid asking the operator to repeat a decision already saved |
| Replaying a written but unmarked outbox event appended it again | Use stable event IDs and skip IDs already present in the ledger | Recover from the tested append-before-mark interruption |

The feedback repair also fixes a query that read `repo` from the asset table
instead of the asset-location table. Undo restores the previous annotation.
The ledger replay checks cover sequential retry; cross-process exactly-once
delivery is not established by these tests.

## Evidence

Baseline `27fecf2063099106c56a0649250b1866a6bbe4da` contains reproductions.
Its [browser run](https://github.com/frankxai/visual-intelligence/actions/runs/38990498368)
failed before the repairs. Some browser failures also exposed an ambiguous test
selector, which was corrected by scoping it to the evidence-filter group.

Repaired code `242476c9a5a4b8407029af4af0bf0959512c68b8` passes:

- [Library and unit CI](https://github.com/frankxai/visual-intelligence/actions/runs/38991443254): 75 passed, no failures or skips.
- [Hosted Chromium CI](https://github.com/frankxai/visual-intelligence/actions/runs/38991443245): 16 passed across desktop, tablet, mobile touch emulation and reduced motion.
- Local lint and the 14 focused dashboard, coverage and feedback tests.

The browser suite checks real preview loading, unavailable previews, horizontal
overflow, initial gallery visibility, evidence filters, multiword search, JSON
download, read-only controls, focus containment/return and native copy. A follow-up
assertion verifies pointer transition reversal as well as instant reduced motion.
Check the latest PR Actions runs for that revision's result.

Screenshots from the passing run were inspected at 1440×900, 768×1024 and 375×812,
including the open inspector. Artifacts contain only disposable sample data and
expire after three days. The browser job has one worker, no retries, a four-minute
suite limit and an eight-minute job limit. It runs on PR changes; no scheduled
service or production deployment was added.

Design review applied the existing VIS appearance and Emil design engineering
for keyboard motion, focus, touch targets and interruption. This is sample-based
interaction and layout verification. It does not establish calibrated aesthetic
ranking, physical-device accessibility or end-to-end processing of real assets.

## Work requiring an authorised host or account

- Inspect the real private catalogue and original files on their owning computer.
  Native folder operations need the host online, authorised paths and working
  desktop/filesystem tools. No physical move was implemented or tested here.
- Recover ChatGPT creation context or inspect Drive/provider assets through an
  actually authenticated connector, browser session or supplied export. GitHub
  access does not provide those sessions or unseen chats.
- Prove one real source image plus context through capture, deduplication/retry
  and one reviewed placement. Brand selection and calibrated taste remain open.
- Follow [issue #41](https://github.com/frankxai/visual-intelligence/issues/41)
  for rights, publication, R2 writes, production deployment and deleting an only copy.

No local browser was started for this review because machine admission held it.
Hosted Linux Chromium results do not verify Windows desktop control or private
file access. The next reviewer should inspect the exact current PR head and use
the existing library, rather than introducing another catalogue or server.
