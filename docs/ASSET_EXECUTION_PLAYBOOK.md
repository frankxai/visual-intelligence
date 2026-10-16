# Cost-aware execution for the existing asset system

Status: operating design and reusable capture kit. The coverage audit works; the
new intake automation, spend gate and evaluation cache described here are not
implemented by these documents. Continue existing VIS #15 and preserve the merged
library from #40/PR #39. Start at `CLOUD_CONTINUATION.md` for the current handoff.

## Who does what

Frank creates and selects images in the existing ChatGPT brand projects. The
creation chat preserves context using `CHATGPT_PROJECT_INSTRUCTIONS.md`. A host
agent executes available VIS operations, maintains evidence and prepares website/
content changes. It should ask only for a missing source, destination, budget or
approval that actually blocks the next dependent action.

Use one capable agent for ordinary work. Deterministic file work runs in scripts;
routine metadata extraction uses an evaluated economical model when needed; hard
selection, character consistency and final composition review can use a stronger
model on the shortlist. Model choice must be tested on the real task. A cheaper
token rate does not establish lower total cost if repair/review work increases.
Independent review remains required by the applicable release contract.

## Execution order

| Step | Work | Cost control |
| --- | --- | --- |
| Inventory | Read existing metadata and fresh change lists; hash exact new files | Local deterministic work; no per-image AI call |
| Reconcile | Match content hash, source item ID and provider IDs | Skip known bytes; retain all source links |
| Context | Read the small per-image handoff; flag missing/ambiguous matches | Avoid sending full chat archives or repeating extraction |
| Triage | Filter by explicit project/use, dimensions and known approval | Do not rate every image in the library with a premium model |
| Inspect | Describe/rank selected unique images against relevant references | Start with a small sample; inspect originals for final defects |
| Remember | Save human decisions and versioned evaluation results | Reuse unchanged results; invalidate when inputs/rubric change |
| Prepare | Generate only the needed crop/export variants | Use existing delivery/transformation capabilities where suitable |
| Place | Prepare one approved website/content change and record its version | Verify a real placement before broad processing |

Keep original bytes immutable. Use a suitable preview for initial visual triage,
but do not judge small text, hands or fine defects from an insufficient preview.
Prepare derivatives when requested instead of materializing every possible crop.

## A bounded first run

Use one existing project and up to 20 selected images as a proposed pilot. That
number is a scope limit, not an approved spend limit. Start with deterministic
inventory and a few explicitly selected originals supplied through an authorised
source. Do not infer their exact prompts/model identity from filenames.

1. Read the current repository, machine and lane contracts. Reconcile #40/PR #39.
2. Audit the explicitly named existing VIS index:

   ```powershell
   node scripts/asset-coverage.mjs --index data/vis.sqlite --limit 8
   ```

3. Obtain one selected original and its context handoff in an available authorized
   session. A private conversation link alone may not be accessible to the worker.
4. Verify bytes/hash and retain source IDs; use the reconciled existing intake path.
5. Repeat the same submission and interrupt/retry a transfer. Preserve the same
   source linkage without making another content-identical original.
6. Record any review/approval in its proper scope. Prepare one website placement
   and one requested content export. Verify the source version and actual output.
7. Measure elapsed time, repair effort, successful mappings, actual model usage,
   storage/transfer/transform consumption and remaining uncertainty.

The pilot passes when the original, context, provider locations, retry behavior
and one usable approved output can be traced together. A prompt kit or passing
audit tests alone does not pass this outcome.

## Spend and cache design

No external processing budget is implied by a request to prepare instructions.
Default additional unattended API spend to zero until the user sets a budget.
Use existing subscriptions within their actual quotas. Separate ChatGPT/agent
allowances, API invoices, storage, delivery/transform usage and human repair time.
Do not call any of those unconditionally free.

Before enabling a paid processing stage, show a measured sample and the proposed
model, number of unique images, expected input/output, provider rates, estimate,
worst-case bound, retries and stop condition. Do not quote an exact per-image cost
without knowing image billing, settings and actual request usage. Keep a shared
reservation so concurrent pending jobs cannot collectively overspend a cap. Refuse
new requests when the remaining bound is insufficient or a cost is unknown.

The proposed evaluation cache key includes content SHA-256, preprocessing version,
task/prompt revision, model snapshot, rubric revision and brand-reference-set hash.
Keep the actual structured output, inspected image version, confidence, usage,
cost basis and review date. Store human feedback separately. A new reference or
rubric can require re-evaluation even if the image bytes are unchanged.

For nonurgent supported requests, OpenAI's Batch API documents a 50% discount
against synchronous processing with a 24-hour window. Check model/endpoint and
regional eligibility at execution; do not promise it for every request or combine
discounts without evidence. Prompt caching can reduce repeated-input cost, but
measure actual cached tokens and any cache-write charges. Never pad a small prompt
just to reach a caching threshold.

Sources checked 2026-10-16:

- [Batch API](https://developers.openai.com/api/docs/guides/batch)
- [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [Current API prices](https://developers.openai.com/api/docs/pricing)

## Storage and schedule choices

Reuse VIS and the verified intake destination. Follow the accepted media-fabric
contract: page delivery through Vercel Blob or the product repo, with private R2
under its existing gates. Evaluate optional Cloudinary capabilities against that
contract rather than silently replacing it. Keep
each original once per checksum in the appropriate master store; record additional
locations as intentional copies. A phone photo backup, sync folder, working cache,
approved master and production derivative serve different purposes.

First use manual bounded processing when the inbox has new items. A new always-on
VM, paid DAM subscription, local GPU model or per-file agent is not justified by
the present evidence. If a schedule later proves useful, add it to the existing
supervisor with explicit owner, duration, RAM/storage limits, receipts and a stop
condition after authorization. Persist a source cursor and reprocess only changes.

Compare the existing VIS path with Cloudinary alone using the same pilot: original
and context retrieval, project matching, repair time, duplicate handling, useful
search, delivery cost and mobile recovery. Make no savings/superiority claim before
that measurement.

## Future chats and installation

Use the existing image-producing brand projects for capture. Put the reusable
block in their project instructions while preserving existing text. Keep a longer
playbook as a source document. Use an existing asset/operations project to steer
processing and track results. Ask which project is intended if it is unidentified.

The optional short block in `CHATGPT_PROJECT_INSTRUCTIONS.md` can be reused in
other projects. Avoid adding a large DAM manual to account-wide custom instructions.
A project instruction does not configure OAuth, install a processor, synchronize
the local index, or grant a cloud chat access to local paths.

Useful requests after installation:

- `Capture these for [project], intended use [website/content]. Prepare the handoff.`
- `Review these candidates for [use]. Explain your top choices and keep my feedback separate.`
- `Process new inbox items using existing tools. Start with a dry run; no additional API spend.`
- `Prepare this approved asset for [route or content format] and record the version used.`
- `Show what is discovered, downloaded, context-linked, processed, approved and published, with evidence freshness.`

These are natural-language conventions. A queue, upload, approval or publication
exists only after a real operation returns its corresponding evidence.

## Handoff and completion evidence

Record which instructions were prepared, applied in settings, reopened/verified,
and tested from a new mobile/project chat. Maintain the existing product issue and
hub handover. Keep private inventories and chat excerpts outside public repositories.
Report actual capability boundaries rather than installing a second product around
an unavailable connector action. No new scheduled automation is installed here.
