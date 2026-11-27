# Scoped asset review

This opt-in operator mode extends VIS library serve, asset_version, asset_derivative, eval_record, publication, and provenance_event. It opens a local, single-customer review surface. The existing catalog gateway remains the hosted discovery boundary. The source system still owns every identity or character lock.

## Local pilot

Use a dedicated customer project and its own object root. An owner-controlled policy file maps public Ed25519 keys to actors, actions, exact destinations and brands. A reviewer signs off-device or in their own OS session. Never give an agent the human private key. Imported content cannot set the policy. Read access on loopback assumes a trusted single-user machine. Keep customer database, files, configuration and backups separate at the OS account level.

1. For a fresh project create an empty vis.config.json containing an object. For a populated project inspect its complete inventory and explicitly set enrollmentDigest to the value from inventoryDigest(db). Preserve a pre-enrollment backup. A database can be bound to a single workspace.
2. Sign an intake manifest using scripts/vis-sign-scope.mjs manifest INPUT KEY OUTPUT. Use immutable source and version pointers. Package manifest.json (signed envelope) and original (bytes) together. Model, cost, prompt reference, rights, consent and folio may be unknown. Use null for unknown values. An ingestion signature attests provenance. It grants no use rights.
3. Run node scripts/vis-review-transfer.mjs import PROJECT POLICY OBJECT_ROOT BUNDLE. Export with the same arguments in export mode, a fresh directory, and the returned intake event ID. The receiver enrolls the source signer's public key for the exact workspace and repeats byte validation. Restored content keeps its VIS IDs. Imported approvals never inherit authority. Re-import parent versions before their derivatives.
4. From the project run node /path/to/vis/bin/vis.mjs library serve --review-policy /path/to/policy.json. The CLI reads the trusted policy again on each submitted decision. Legacy writes and master downloads are closed on this listener. An operator with privileged filesystem or database access is outside the web authorization boundary.
5. Compare two renditions, adjust overlay opacity, inspect the lineage and recorded decisions. Download the action template, fill every scope field, inspect its contents and sign with scripts/vis-sign-scope.mjs decision INPUT KEY OUTPUT. Load the signed decision in the desk and confirm. Expired templates require a fresh scope. Values are signed in the explicit array order defined by decisionBytes or manifestBytes, using UTF-8 JSON and unpadded base64url signatures.
6. Record an independently signed critique through scripts/vis-record-critique.mjs PROJECT POLICY SIGNED_EVALUATION. Use evaluationBytes for signing. The reference digest and candidate version are both required. The critic must have an enrolled key distinct from the intake signer. The result only appends an advisory score and notes.
7. A publication decision creates a planned placement and includes the exact campaign and destination. After an independently authorized external publication, an enrolled destination-specific adapter can report an observed event through scripts/vis-observe-publication.mjs PROJECT POLICY SIGNED_PROVIDER_RECEIPT. The event must match the signed scope, occur inside the approved interval, identify a permitted HTTPS origin and supply a stable provider ID. A later review revision sends disputed or late receipts to reconciliation. Fixture tests use a synthetic newsletter receipt.

The tests in tests/vis-scoped-review.test.mjs contain a complete synthetic policy and signing sequence. For an empty read-only review, use a policy file with only a workspace name. Enrollment is an owner action. Mount real inputs read-only during rehearsals.

## Wire contract

| Method | Path | Result |
| --- | --- | --- |
| GET | /api/review | Asset IDs/titles in the bound customer database |
| GET | /api/review/asset/{id} | Current version, technical inspection, provenance, rights, advisory critiques, lineage, receipts and placements |
| GET | /api/review/scope/{id}?action=… | Unsigned template with current revision, random nonce and five-minute expiry |
| POST | /api/review/asset/{id} | Signed decision only, same origin and operator header required. Refusals do not change revision |
| GET | /r/{id}/preview | Existing local WebP rendition |
| Offline | vis-review-transfer.mjs | Customer-owned original, signed portable manifest and verified restore |

See schemas/vis-intake.v1.json and schemas/vis-review.v1.json. Authority, clearance expiry, current digest, replay and typed database checks are additional runtime constraints. Scope clearances bind asset, version, digest, rightsRef, consentRef, campaign, destination, action, expiry and an externally verified technicalRef with technicalStatus passed. Project reviewers configure their attestations explicitly. A missing scanner or consent attestation cannot be replaced by a high visual score.

| Action | Durable effect |
| --- | --- |
| comment | Timestamped signed note |
| approve_use / approve_identity / approve_canon | Separate decision for the exact version and destination. Authority owners consume the receipt using their own gate |
| replace_canonical | Records a proposal authorized against the explicitly configured old head. The owning registry must compare-and-swap the old digest before applying it |
| authorize_publication | Planned VIS placement scoped to one campaign and exact adapter destination |
| archive / delete | Archived or recoverable quarantined review state. Master bytes remain available for authorized recovery |
| restore | Returns quarantined or archived content to candidate. Requires a fresh signed decision |
| revoke_rights | Restricts subsequent scoped use. Separate owner process handles historical publications and takedown |

Direct customer exports are privileged owner backup operations. A full backup includes SQLite and customer storage together. A single-file portable export carries source evidence and original bytes. It does not transfer the original tenant's decisions or private keys. Legacy clients are outside this opt-in product path.

## Migration and rollback

1. Read the existing VIS and owning product records. Preserve their asset IDs, version hashes, first-party rights and destination constraints. Inventory the old and proposed head before any replacement. Track differences as review items.
2. In an isolated customer copy, import one selected original and one derivative, test failed rights and stale decisions, quarantine and recover the derivative, and restore by SHA-256 into an empty destination. Approve the resulting byte-count and hash reconciliation.
3. In staging only, apply 20261105_vis_catalog.sql followed by 20261118_vis_review_receipts.sql to the existing Starlight Platform tenant model. The second migration adds a tenant-and-version-bound append-only projection. Only the trusted service can insert. Browser clients cannot read or write it directly. PGlite tests execute both migrations. The signature-verifying hosted write service and hosted customer key enrollment remain integration work.
4. Keep Arcanea metadata within its own IP boundary. Carry tenant-scoped pointers and permitted metadata only. Map existing GenCreator campaign IDs and adapter destinations by explicit agreement. Reconcile exact rights, scanner and consent attestations first. Customer R2 rollout requires a separately authorized restore drill. The tested transfer CLI currently uses the existing local storage adapter.
5. Stop the loopback process to roll back the pilot. Preserve the receipt database and immutable objects. Restore a verified pre-enrollment backup to return a legacy operator to its former database. Never clear review history or reopen a bound database through the legacy web mode. Leave staged SQL tables in place during rollback and disable their consuming feature.

## Acceptance boundary

This branch contains no dispatcher, destructive purge, production migration runner or identity-registry write. Tests cover PNG intake and content transfer, immutable master collision handling, scoped decisions, recovery, independent critique and observed publication. JPEG/WebP use the same decoder. SVG/MP4 initially receive container-level validation and remain unavailable for in-browser review without a trusted rendition. Malware, video/audio rights, caption checks and human visual approval are external evidence requirements. The local grant model is appropriate for a trusted single-user workstation. Hosted tenant access must use the existing membership resolver, restricted process credentials and service-side verification.
