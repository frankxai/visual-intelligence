# The visual workspace

Use VIS as the asset catalogue and operator interface. Keep the existing library,
CLI and MCP implementation. Connect the CMS, LMS and publishing tools through
asset IDs and versioned placements. They should not each own another master copy.

## Open something useful

The existing cockpit can produce a private HTML snapshot:

```powershell
node bin/vis.mjs dashboard --read-only --verify-locations --limit 40 --output <private-output-directory>/asset-desk.html
```

Open that HTML file in a browser. Local previews refer to the original files on
this computer. Paths that no longer exist cannot preview. File paths, prompts and
internal source references can be embedded in the page. Keep it private; do not
deploy this export or use the public web build with a private catalogue.

For HTTP previews on the owning computer:

```powershell
node bin/vis.mjs serve-dashboard --read-only --verify-locations --limit 40
```

The server accepts loopback binds only. Read-only mode rejects mutation requests
at the handler, and the server refuses unrelated origins and arbitrary files in
the output directory. These checks do not make a private catalogue suitable for
public hosting. Use `vis library serve` for the watched-library workflow below.

The new Files and processing section shows the latest catalogue observation
separately from the export time, with timing details in a disclosure. Filters identify present files, prompt gaps and
missing export/publication records within the loaded snapshot. Select an asset
to inspect up to eight locations, their current presence check and the earlier
index observation. Download inventory exports selected assets, or the current
filtered set when nothing is selected. The JSON stays on the device and includes
private paths. It is an inventory snapshot, not a processing job or move receipt.

`--read-only` opens SQLite read-only, does not create/migrate the index, and disables
feedback in the exported interface and HTTP handler. `--verify-locations` checks local file presence
for at most 100 displayed assets and eight paths per asset. It does not walk roots,
download cloud files or re-hash bytes. Network shares and URLs are not checked.
Records can be stale; no publication records does not mean never published.
Storage and publication records may represent plans rather than completed work.

The existing watched-library operator is a separate, already merged implementation:
`vis library serve` serves its private local screen at `http://127.0.0.1:4323/`.
See `docs/LIBRARY.md` and issue #40. PR #39 merged on 2 October 2026; earlier notes
calling it unmerged are stale. This publication branch starts from current main
and includes that implementation. Preserve its server and shared record.

Run `node bin/vis.mjs library serve` from the repository to start that operator
when local runtime admission permits. The documented address is a local service,
not a hosted link or evidence that it is currently running. Its existing proposal
queue supports rank, set, tag and rights suggestions. The built-in suggester uses
folders to propose sets; it does not perform visual analysis or choose homepage
placements. See `LIBRARY.md` for the CLI/MCP gates.

## How the complete interface should work

| Surface | User job | Current boundary |
| --- | --- | --- |
| Folders and sources | Browse declared local roots, Drive intake, ChatGPT captures and provider locations | Snapshot has indexed folders/locations; cloud inventory is not a live filesystem |
| Contact sheet | Inspect images/video posters, compare candidates and create brand/project sets | Existing cockpit and library operator; actual taste decisions remain scoped human feedback |
| Inspector | See original, versions, prompt/context, generation labels, rights and usage | New evidence view covers recorded locations/processing; missing history stays unknown |
| Placement board | Compare a candidate inside a homepage component, lesson or social crop | Existing placement briefs are proposals; rendered placement workflow still pending |
| Operations | Watch a concrete transfer/transform job, inspect before/after, retry or undo | Physical move/job console still pending; snapshot never pretends to execute it |
| Activity | See the actor, source, destination, version, result and receipt | Existing provenance/feedback/publication records; unified job events need integration |

A collection can put one asset in several brands/projects without moving the
original. A physical file move changes its location. A derivative creates a new
version or related asset. Keep these operations distinct in both UI and CLI.

Before implementing physical moves, use an explicit plan containing source path,
destination path, asset/version IDs and expected hash. Preview collisions and
broken source references. Execute within named roots, verify the result, retain
a durable receipt and support recovery after interruption. Cross-volume transfers
need copy, hash verification and source removal as separate recoverable steps.
Undo must refuse when the destination bytes changed or the original path is
occupied. Avoid silently moving code-referenced website files.

## Agent teams you can see

Status: proposed extension of the existing VIS operator. The current library,
inspector, rank/set/tag/rights proposal queue and asset events already exist.
The placement comparison board and team/job view below are not implemented.
No team processes, automatic vision calls or recurring dispatch are activated.

Use one visible workspace over the shared asset record. Give each responsibility
a stable role, then assign a capable runtime to a bounded job when needed. Codex,
Grok and other admitted agents can use the same CLI/MCP contract when their
connection is configured and tested. Provider choice does not create a separate
asset library. Keep the repository's named engineering lanes intact.

| Responsibility | Result visible to the operator |
| --- | --- |
| Library operations | Ingestion receipt, original/version identity, duplicates, source context and missing evidence |
| Visual analyst | Searchable subject/composition attributes and separate assessments of technical quality, brand fit and crop suitability, with evidence and uncertainty |
| Brand art director | Up to three candidates for a named brand and slot, reasons, alternatives and scoped feedback; respect each brand's current authority |
| Placement and story editor | Candidate rendered in the actual page/component, desktop/mobile crop and related social or lesson treatment |
| Reviewer and release owner | Independent findings, human approval, requested derivatives and actual publication receipts after the applicable gates |

These responsibilities extend the existing content team's strategist, creator,
editor/QA and publisher roles. They are not five new services. Human rights and
publication decisions remain human decisions.

The intended post-ingestion workflow is:

```mermaid
flowchart LR
  I[Ingestion receipt] --> L[Identity and context checks]
  L --> A[Bounded visual analysis]
  A --> B[Brand and slot candidates]
  B --> P[Placement comparison]
  P --> H[Review and human decision]
  H --> E[Authorised export or publication]
  E --> U[Recorded use and feedback]
```

Show this through these views in the same operator:

| View | What Frank should see | Implementation boundary |
| --- | --- | --- |
| Library | Folders/collections, thumbnails, duplicates, prompt/model evidence and current uses | Existing record and operator; source coverage still depends on ingestion |
| Suggested uses | Three candidate thumbnails beside a specific homepage slot, component, lesson or social brief; reason and desktop/mobile crop | New contextual recommendation/comparison view needed |
| Brands and projects | Open slots, candidate sets, approved versions and live placements per brand/project | Existing sets and placement records are inputs; unified board needed |
| Team and jobs | Role, assigned runtime/actor, input asset IDs, exact output, actual state, last event, cost evidence and retry/review action | Job telemetry/dispatch integration needed; an actor label is not proof a worker is running |
| Review and activity | Pending proposals, what changed, who decided, output receipt and scoped preference feedback | Proposal queue and asset events exist; placement and job review need integration |

A recommendation card should answer: which exact asset/version, for which brand,
page and component, why it fits, which crop was inspected, what is unknown, who
proposed it and what decision is required. Keep the existing image and a no-image
alternative available. A high aesthetic score alone must not imply rights,
approval, canon compliance or a successful placement.

For example, an illustrative card might say: "Candidate A for a homepage's story
section: subject stays visible at both crops; the hero crop loses the subject.
Proposed by brand art director; awaiting your review." This is the shape of a
recommendation, not an assessment of any private asset in this repository.

Start with one brand, one named slot and three authorised assets. A dry-run route
packet contains the source asset/version IDs and hashes, actual context links,
brand/slot brief revision, role owner, inspected crops, three candidate reasons,
reviewer, budget, stop condition and output receipts. Dispatch stays disabled
until explicitly requested and admitted. Cache useful analysis by content hash
and analysis/rubric revision; re-run affected work when those inputs change.
Deterministic hashing and metadata checks should precede model calls.

## App, build tooling and agent control

Keep the existing local Node/web operator as the first usable surface. A later
UI refactor can use [Vite](https://vite.dev/guide/), which supplies development and
build tooling; Vite does not supply the asset record, worker permissions or job
execution. A desktop wrapper is a separate packaging choice when native file
work requires it. Do not start a second dashboard as an integration shortcut.

CLI/API/MCP performs the recorded work; the operator displays its proposals and
receipts. MCP connects a host's clients to tools and resources using a shared
protocol; it does not create a durable job runner or a team automatically. See
the [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture).
Computer-use agents can inspect crops, operate authenticated UIs and verify a
page when those capabilities are available. Use named filesystem operations for
bulk asset work rather than replaying thousands of drag gestures.

Phone access needs a separately authenticated hosted/scoped service or an
authorised connection to the owning host. The current loopback-only operator
does not become phone-accessible by binding it publicly. Keep private originals
out of public deployments and maintain the accepted storage/publication gates.

Design guidance selected/read: Emil design engineering. Applied in this plan to
immediate keyboard navigation, focus containment/return, touch targets, reduced
motion and interrupted transition recovery. Existing sample interface behavior
was verified in PR #53; no new team/placement interface was built or verified by
this planning update.

## One engineering foundation

```mermaid
flowchart LR
  Sources[Local folders / mobile inbox / authorized cloud captures] --> Intake[VIS intake and reconciliation]
  Intake --> Records[VIS assets, versions, locations and provenance]
  Records --> UI[Visual library and placement review]
  Records --> Tools[CLI and MCP]
  UI --> Jobs[Reviewed operations and receipts]
  Tools --> Jobs
  Jobs --> Outputs[Website / CMS / LMS / content exports]
  Outputs --> Records
```

The diagram describes the integration target. It does not establish that every
connector, job, placement board or receipt already works.

Store originals in the chosen private master store; use Drive as a useful mobile
inbox and collaboration location. Use the existing delivery provider for approved
website derivatives where it fits. Keep provider IDs, checksums and location
states in VIS. SQLite is suitable for the current local operator; a hosted,
authenticated shared service is a separate implementation decision. A public CDN
is not the private master store. Do not pay for several overlapping systems
before a real capture-to-placement pilot establishes the need.

An LMS lesson should reference the same approved asset/version as the CMS or
website, while preserving its own lesson state. A content job adds a brief, crop,
caption and approval; it should not infer brand identity or rights from a filename.
Read the intended brand's current approved contract before making placement or
style decisions. Request an authorised reference when it is unavailable here.

## Visible execution and actual capabilities

Prefer CLI/API/MCP operations for reliable bulk work. The visual interface should
display the same operation and receipt, regardless of which tool started it.
Use visible browser/desktop control for curation, layout review and applications
that need UI interaction. Do not make thousands of drag gestures the backend.

Discover and test the current session's browser, desktop and connector tools.
An installed package does not establish a working desktop helper or access to
another session's tab. A signed-in browser does not confer access to every chat,
and a ChatGPT subscription is not an API for enumerating its private image library.

Current official references:

- [OpenAI computer use](https://learn.chatgpt.com/docs/computer-use): Windows uses
  the active desktop. Availability and app approval must be checked in the session.
- [OpenAI MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli): local Codex
  transports and ChatGPT web plugin connections have different setup boundaries.
- [Hermes computer use](https://hermes-agent.nousresearch.com/docs/user-guide/features/computer-use)
  and [browser tools](https://hermes-agent.nousresearch.com/docs/user-guide/features/browser):
  supported modes depend on the configured host/driver/backend.
- [Eagle Web API](https://developer.eagle.cool/web-api): a serious existing option
  for local library/folder/tag operations. Compare an actual task before claiming
  VIS is faster or cheaper. No measured head-to-head result has been established.

## Where future agents start

Read this repo's `AGENTS.md`, `CLOUD_CONTINUATION.md`, `ASSET_EXECUTION_PLAYBOOK.md`, this guide and the
relevant brand/placement contract. Continue the existing issue, currently #15 for
capture continuity and #40 for library integration. Preserve the source conversation
and private evidence references. Cross-repository handover lives in
`frankxai/agentic-ops-hub`, not in another new project queue.

Use `CREATIVE_OPERATOR_PROMPT.md` as the reusable execution brief. The separate
`CHATGPT_PROJECT_INSTRUCTIONS.md` is prepared for cloud project settings; a local
file does not install those settings. No runtime team, recurring watcher, paid
processing budget or public deployment is activated by reading these documents.
