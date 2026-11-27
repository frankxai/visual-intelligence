# Image source capture in VIS

Status: offline adapter and CLI. Tracks #79; extends the source-intake work in #15 and source verification in #71. No connector, watcher, hosted endpoint, queue or schedule is installed by this change.

`scripts/image-capture.mjs` accepts authorized source pages and generation events. It stores observations, receipts and source checkpoints in the **existing VIS SQLite database**. `asset`, `asset_version`, `asset_location` and `provenance_event` remain canonical. It does not create asset records from remote filenames, URLs or declared checksums.

## Contract

The machine-readable contract is [`vis-image-capture.schema.json`](../schemas/vis-image-capture.schema.json). Pages are bounded to 250 unique source items and 4 MiB; larger pages fail before advancing the cursor. Local byte verification is limited to 64 MiB per file and 256 MiB per page. There are no network requests, model calls, uploads, deletions, rights changes or publication operations.

```json
{
  "schema_version": "vis.image-capture.v1",
  "batch_id": "export-20261116-page-001",
  "source": { "provider": "chatgpt-library", "scope": "opaque-account-and-query" },
  "mode": "backfill",
  "captured_at": "2026-11-16T09:00:00Z",
  "cursor": { "previous": null, "next": "provider-page-2", "revision": 0 },
  "coverage": { "exhausted": false, "note": "First authorized image-query page; other chats and deleted files are not enumerated." },
  "items": [{
    "source_item_id": "stable-provider-file-id",
    "source_uri": "source:stable-provider-file-id",
    "filename": "star-study.png",
    "mime_type": "image/png",
    "created_at": null,
    "discovered_at": "2026-11-16T09:00:00Z",
    "generation": {
      "user_prompt": { "value": null, "status": "unknown", "evidence_ref": null },
      "requested_model": { "value": null, "status": "unknown", "evidence_ref": null },
      "resolved_model": { "value": null, "status": "unknown", "evidence_ref": null },
      "reason": { "value": null, "status": "unknown", "evidence_ref": null }
    },
    "concept": { "characters": [], "stories": [], "worlds": [], "intended_uses": [] },
    "metadata": { "source_query": "authorized image inventory" }
  }]
}
```

Omitted generation claims become `{value:null,status:"unknown",evidence_ref:null}`. Known values require an evidence reference. `exact` means copied from the cited evidence, not independent verification of its author. Reconstructed or inferred claims keep their status; they are never promoted into observed facts. `model` is accepted as an alias for `resolved_model` for older callers; conflicting aliases fail.

| Evidence | Required interpretation |
| --- | --- |
| `user_prompt` | User-authored prompt, separate from assistant summaries |
| `effective_prompt` / `revised_prompt` | Actual tool request / returned revision, when exposed |
| `requested_model` | Model requested by the caller |
| `resolved_model` | Backend model explicitly returned or recorded by the image provider; a ChatGPT assistant model or tool name is insufficient |
| `reason` | Recorded reason for model choice or image creation; inference must be labelled |
| `created_at` | Source creation time; null when unavailable |
| `discovered_at` / `captured_at` | Observation time / page capture time; never substituted for creation time |
| `concept` | Unreviewed summary and proposed character/story/world/use labels; never canon approval |
| `relations` | Evidence-linked edit, variation, derivative or reference edges to stable source items; targets may remain unresolved |

Use stable source IDs, not expiring download links, as identity. Keep account/query scope stable across pages and distinct across accounts or query filters. Put source-specific fields, chat/message IDs, dimensions reported by a provider, and retrieval evidence in `metadata`. Do not put credentials in any manifest; prefer stable private evidence references over signed URLs.

## Run a private backfill

Use the current catalog path (normally `data/vis.sqlite`) or another private VIS catalog. Run `vis library ingest --execute` through the existing declared-root workflow before byte-linked captures; that workflow owns binary indexing and rendition generation.

```sh
node scripts/image-capture.mjs --manifest /private/capture/page-001.json --db /private/vis.sqlite --out /private/capture/plan.json
node scripts/image-capture.mjs --manifest /private/capture/page-001.json --db /private/vis.sqlite --execute --out /private/capture/receipt.json --index-out /private/capture/index.json
```

For authorized local files add `local_path` relative to an explicit `--media-root /private/originals`. Optional `expected_sha256` must match bytes read locally. An expected checksum without local bytes is retained as a declaration and never treated as measured. Traversal and symlinks escaping the declared root are rejected.

| Receipt state | Meaning and next action |
| --- | --- |
| `metadata-only` | Source metadata captured; binary unverified. Retrieve authorized original bytes before claiming recovery. |
| `pending-library-ingest` | Bytes hashed but not present in canonical VIS versions. Use existing library ingestion, then a new capture batch. |
| `linked` | Measured bytes match an existing canonical VIS version; the asset trace includes `image-source-captured` with full typed evidence. |

Exact-byte duplicates link to the same existing asset/version while each source URI, local path and lineage remains in its observation. No similar-image or perceptual duplicate claim is made. Each observation is immutable; subsequent batches append source revisions and changed metadata. Replaying a committed batch returns its original receipt without re-reading files or moving the cursor. Use a **new batch ID** to verify changed local bytes or link later ingestion.

The CLI dry run opens an existing catalog read-only, or uses memory when the database does not exist. It never creates a persistent database or capture tables. `--out` is an explicit private receipt export. Execute commits source checkpoint, all observations, provenance links and receipt in one transaction; a hash mismatch, stale cursor/revision or SQL failure rolls everything back. `cursor.revision` is 0 on the first page and increments after every committed batch, including null-to-null event pages. Omission defaults to 0 only for a new scope. Use the receipt's `cursor.revision_committed` for the next page. A stale initial page cannot reopen an exhausted null cursor because its revision no longer matches. Dry runs and exact batch replays never advance either checkpoint field. A changed manifest under an already committed batch ID is rejected. Duplicate source IDs within a page fail. After any partial source retrieval, submit only a fully enumerated bounded page and its real next cursor; never advance over unreturned items.

Receipts and exports contain private metadata and prompts. Keep them outside the public checkout. SQLite is the durable checkpoint; receipt/index file exports can be regenerated after an export failure. `--index-out` exports up to 100,000 observations and is only available on execute. Output files and newly created database files use mode 0600; use private parent directories. Do not sync a live SQLite database through Drive.

`coverage.exhausted` reports only the supplied account/query scope. Every receipt retains `all_history_verified:false`: connector results cannot prove that deleted images, inaccessible conversations, other accounts or absent exports were captured. Page counts and captured source IDs are evidence; “every image ever generated” is not a supported completeness claim.

## Future generation wiring

Use `mode:"event"` in a separate source scope from a historical backfill. Persist a **request batch before the paid generation call** with `metadata.request_id`, `metadata.project_id`, `metadata.reference_source_item_ids`, `metadata.generation_phase:"requested"`, the user/effective prompts, requested model, purpose and available evidence. A caller should require a recorded prompt, reason and project for new work; historical recovery remains permissive about unknown metadata.

After the provider responds, submit a second immutable batch with the same request ID, `generation_phase:"completed"`, stable output IDs and actual tool-response references. Populate the resolved image model only when returned by the provider. Save original bytes under an authorized declared library root, use the existing library ingest, and capture again with measured local bytes to connect the source record to the canonical asset. Record failed generation in source-specific `metadata` under a separate event batch rather than inventing an output image.

The adapter API is `captureImages(existingDb, manifest, {execute:true, mediaRoot})`; existing runtimes can call it directly. Callers own authentication, source pagination, generation orchestration, retry scheduling and their preflight gate. This PR supplies no unattended trigger, cross-process queue or provider-history API. Host the eventual intake endpoint behind existing authorization; do not expose this local adapter directly to the public internet.

## Import runtime request and outcome records

The executable bridge accepts authorized **local copies** of `starlight.imageGeneration.v1` records. It does not fetch a bucket or authenticate to a runtime. Use [`vis-runtime-image-capture-input.schema.json`](../schemas/vis-runtime-image-capture-input.schema.json) to describe a page and supply the current VIS checkpoint explicitly:

```json
{
  "schema_version": "vis.runtime-image-capture-input.v1",
  "batch_id": "runtime-copy-page-001",
  "source": { "provider": "creator-command", "scope": "opaque-bucket-account" },
  "captured_at": "2026-11-16T10:00:00Z",
  "cursor": { "previous": null, "next": null, "revision": 0 },
  "coverage": { "exhausted": false, "note": "Three authorized event copies; source enumeration remains open." },
  "records": [
    { "object_key": "media-capture/EXAMPLE_ATTEMPT/requested.json", "record_path": "requested.json" },
    { "object_key": "media-capture/EXAMPLE_ATTEMPT/completed.json", "record_path": "completed.json", "local_path": "original.png" },
    { "object_key": "media-capture/EXAMPLE_ATTEMPT/failed.json", "record_path": "failed.json" }
  ]
}
```

```sh
node scripts/image-capture.mjs --runtime-input /private/events/page.json --records-root /private/events/records --media-root /private/originals --db /private/vis.sqlite --out /private/events/plan.json
node scripts/image-capture.mjs --runtime-input /private/events/page.json --records-root /private/events/records --media-root /private/originals --db /private/vis.sqlite --execute --out /private/events/receipt.json
```

`projectRuntimeImageRecords(input, {recordsRoot})` returns a normalized `vis.image-capture.v1` manifest for `captureImages`. Every local JSON record is bounded to 256 KiB, the combined record reads to 4 MiB, and the projected manifest to the normal capture limits. Optional `expected_record_sha256` must match the exact JSON copy bytes. Record digests measure those local copies; they do not independently authenticate the remote origin. Original binary copies still require the separately declared media root and their own measured SHA-256.

The source item ID is the immutable **event object key**, so requested, completed and failed records coexist. Full source records, request/output references, record digests, reference IDs, project IDs and phase remain in private observation metadata. The bridge never turns a request or failure into an output asset. A failure's `completed_image_ref` remains evidence of a separate completion; it does not erase that completion or automatically link failed-event bytes. The complete event's output key must identify its attempt-specific original, not a replaceable display card.

When a matching request copy is supplied in the page, its measured digest must match `request_ref.sha256`; otherwise the reference remains explicitly `source-declared-only`. A failed event's completion reference is checked against a supplied completion's JSON digest and original hash; `matched-local-outcome-and-original-hashes` describes exactly those checks, not verification of auxiliary model-summary fields. Generation claims pass through with their fidelity intact. Exact resolved-model or revised-prompt claims must match the recorded provider-response field. A routed model, legacy adapter model, display projection or episode topic cannot fill a missing backend model or user prompt. Malformed UTF-8 source records are rejected rather than replacing bytes inside prompt text.

The CLI protects event copies and original media from output-path aliases in addition to the database and input manifest. `--manifest` and `--runtime-input` are mutually exclusive; the latter requires `--records-root` and an explicit checkpoint revision. An external reconciler can retrieve authorized private objects and invoke this bridge after merge, with retry state owned by the existing VIS receipt/checkpoint. No scheduler or remote delivery is installed here.

## Validation

```sh
node --test tests/image-capture.test.mjs tests/runtime-image-capture.test.mjs
npm run lint
```

The tests exercise catalog trace integration, duplicate bytes with retained sources, unknown and reconstructed evidence, request/completion events, atomic checkpoint rollback, stale/conflicting retries, source isolation, bounded inputs, path confinement and read-only dry runs. All fixtures are synthetic.
