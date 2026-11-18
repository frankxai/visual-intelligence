# Bound visual review

An opt-in review surface on the existing loopback VIS operator. The asset and version IDs, provenance graph, renditions and asset relationships remain VIS records. The operator enrolls a dedicated local VIS database for one tenant. Administrative access to that database and its host is trusted. Keep it off shared networks. The interface accepts public verification keys only. Keep human signing keys outside the agent and server environments.

## Run a private review

From an empty project with the existing VIS CLI, use an existing private directory for customer-owned originals and a separate private directory for each export. Set the project root with the CLI's usual `--root` option. Initialize once. Import parents before derivatives.

```sh
node bin/vis.mjs library review-init --tenant demo --execute
node bin/vis.mjs library review-intake --tenant demo --store "$VIS_STORE" --actor ingest-operator --manifest source.json --original input.png --execute
VIS_REVIEW_WORKBENCH=1 VIS_REVIEW_CONFIG="$VIS_REVIEW_KEYS" node bin/vis.mjs library serve
node bin/vis.mjs library review-storage-audit --tenant demo --store "$VIS_STORE"
```

The source manifest follows `schemas/vis-review-intake.schema.json`. It binds the source URI, upstream version, owner, declared rights, consent, measured content digest, MIME, exact parent versions and generation evidence. Unknown model and cost fields stay null. Customer storage must support local filesystem semantics, atomic links and byte readback. A successful raster decode covers file and pixel integrity. Separate, current scan evidence is required to prepare a publication handoff. Unsupported media validation stays on hold.

```json
{
  "tenant": "demo",
  "reviewers": {
    "operator-key": {"actor":"owner","kind":"human","scopes":["comment","archive","recover"],"publicKey":"<Ed25519 public key PEM>"},
    "critic-key": {"actor":"independent-reviewer","kind":"critic","scopes":["critique"],"publicKey":"<Ed25519 public key PEM>"}
  },
  "authorities": {}
}
```

Use an owner-controlled file with one identifier per principal and a separately enrolled key for the critic. A reviewer with a key capable of signing must read the exact asset, destination, rights and action. Software possession of a human credential cannot prove physical human presence. The portable preview uses synthetic inputs and disables writes.

## Decision contract

See `schemas/vis-review-decision.schema.json` and `api/vis-review.openapi.json`. Obtain the current edition and revision from the private review screen. Sign UTF-8 JSON encoded as base64url. The signature covers the ASCII encoded payload. The envelope is payload, dot, base64url Ed25519 signature. A nonce is one-use within the review instance. A fresh import gets a different audience. Never run simultaneous clones of a live review database. Re-enroll signers with a new audience after disaster recovery from a stale snapshot.

```sh
node bin/vis-review-decision.mjs sign reviewed-claims.json human-private-key.pem
node bin/vis-review-records.mjs handoff data/vis.sqlite "$VIS_REVIEW_KEYS" ASSET_ID placement.json
node bin/vis-review-records.mjs audit data/vis.sqlite "$VIS_REVIEW_KEYS" > private-audit.json
```

| Signed action | Additional evidence and effect |
|---|---|
| comment, critique | Signed note. The critic must differ from the recorded maker. Critique is advisory. |
| clear_rights | Exact destination, rights, consent, evidence_ref and valid_until. A declared block or denial is a hold. |
| verify_scan | Scanner identity, clean result, evidence_ref and validity bound to the original digest. This records a reviewer attestation. |
| approve_asset | Current destination rights and independent critique. The reviewer classifies identity_usage as none, brand_mark or character and names the subject for identity-bearing placements. |
| approve_identity, approve_canon | Match a tenant-configured registry subject of the correct kind, brand, source, revision and enrolled reference asset/version/hash. The server records a signed local intent. |
| replace_canonical | Bind the exact preceding identity/canon intent and incumbent asset, version and SHA. The owning registry must separately apply an approved replacement with a current-head compare-and-swap. |
| publish | Approve one destination after identity, parent, scan and rights checks. The draft exporter rechecks custody, authority and grant validity. No dispatcher is installed. |
| publication_receipt | A human attests provider, receipt_ref, occurred_at and authorization_nonce. Late observation is possible. The provider remains the authority on actual delivery. |
| revoke_rights, archive, delete | Invalidate existing grants. Delete places a reversible quarantine on the local edition. Original bytes are preserved. |
| recover | Rehash original bytes and reopen the edition as a candidate. Earlier permissions require new decisions. |

A named registry pin in `authorities[subject]` has `kind` (identity or character), `brand`, `source`, `revision`, `asset_id`, `version` and `sha256`. The owner provisions it from the external registry. The signed claims name `subject`, `authority_source`, `authority_revision`, `reference_asset_id`, `reference_version` and `reference_sha256`. Replacement also signs `previous_asset_id`, `previous_version` and `previous_sha256`.

The placement document contains channel, campaign_id, content_id, variant_id and placement_id. Its exact destination joins those five values with slashes. Supported channel families are editorial, newsletter, linkedin, website, slides and interactive. Each draft carries the immutable VIS identity, authorization nonce, expiry and unfilled provider receipt. The downstream integration must revalidate before dispatch and deduplicate on the authorization nonce. Nothing in a prepared packet grants a downstream application access to private bytes.

## Portability, migration and recovery

1. Keep the existing workstation catalog and all design masters in place. Reconcile candidate refs against a pinned authority and independently measure selected original bytes. For legacy metadata with unknown provenance or rights, retain that state.
2. Pilot in an empty owner-controlled VIS database. Existing populated databases require an owner-reviewed tenant mapping and a recoverable snapshot. Enrollment deliberately refuses an automatic takeover. Keep each customer’s index, private keys and store separate. Dry-run eligible source mappings before explicit intake.
3. Use `library review-export` with an empty package directory and an offline signing key. Import with `library review-import`, the trusted public key, matching tenant and a new destination store. Restore parents first. Verify SHA and the signed manifest. Import re-establishes custody as a candidate. The private audit export retains historical decisions, attestations, denials and usage evidence for independent verification. Never replay historical approvals during import. Keep source access and signing-key history separately.
4. For hosted staging, extend the existing `platform/migrations/20261105_vis_catalog.sql` version rows with workspace-scoped foreign keys, unique workspace nonce and ordered revision constraints. Require authenticated membership and human reviewer enrollment. Exercise cross-tenant negative tests against real policies; service-role access alone cannot establish isolation. Switch the object adapter only after conditional immutable puts, deletion protection, verified restore, retention and a distinct purge policy pass. Retain existing delivery URLs.
5. Roll back by stopping the flagged process and closing the review project. Restore the pre-enrollment snapshot of the original service only. Preserve all new receipts and quarantined bytes. Reconcile interrupted writes using the read-only storage audit. No production database migration, bucket mutation, public release, or physical purge is part of this patch.

The decision tables provide application-level append-only history. The owner can alter filesystem/SQL state. Off-host signed checkpoints, centralized membership/deprovisioning, provider-verified receipt reconciliation, shared nonce coordination across restored installations, and closed-loop production channel adapters are deployment gates.
