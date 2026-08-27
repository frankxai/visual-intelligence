# Starlight DAM storage architecture

Status: governed rollout in progress
Policy: `config/dam-storage-policy.json`
Planner: `scripts/plan-dam-rollout.mjs`
Asset graph source of truth: VIS SQLite

## Verified foundation

On 2026-08-27, the signed-in Cloudflare dashboard showed three newly created, empty R2 buckets with the EU jurisdiction label, Standard storage class, and disabled public access. The redacted operator receipt is [`docs/evidence/r2-bucket-topology-2026-08-27.json`](evidence/r2-bucket-topology-2026-08-27.json). This is not an automated provider attestation.

| Bucket | Boundary | Public access |
| --- | --- | --- |
| `starlight-dam-originals-eu` | Rights-cleared, content-addressed source masters | Disabled |
| `starlight-dam-renditions-eu` | Approved web, social, video, and audio renditions | Disabled until a verified custom-domain delivery route exists |
| `starlight-dam-workflow-eu` | Expiring inbox, agent output, render, and review artifacts | Disabled |

The verified Google Drive collaboration root is `Starlight Creative Vault`. Its folder contract is represented by folder names in the policy; provider IDs and account identifiers must not be committed to this public repository.

No binary migration is implied by bucket creation. A bucket existing is not evidence that an asset is classified, rights-cleared, reviewed, or safe to publish. Content-addressed keys provide logical immutability; storage-level Object Lock, versioning, retention, lifecycle, and drift verification are not claimed.

## One authoritative graph, several purpose-built stores

| System | Owns | Does not own |
| --- | --- | --- |
| VIS SQLite | Asset identity, SHA-256, immutable versions, locations, usage edges, derivatives, provenance, rights, approval, evaluations, publications, and provider object records | Human file browsing, site copy, or public delivery |
| Google Drive | Human intake, collaboration, review packets, source documents, approvals, and browseable archives | Public CDN delivery or canonical machine-readable identity |
| Cloudflare R2 | Private masters, shared durable renditions, and expiring workflow objects | CMS records, agent memory, or unreviewed public publication |
| Vercel Blob | App-local uploads, dynamic media, and selected small delivery assets | Cross-brand master archive or estate-wide DAM |
| GitHub | Code, MDX/content, schemas, policies, manifests, provenance sidecars, releases, and intentionally small static assets | Bulk binary archive or agent scratch output |
| Vercel | Application builds, previews, production releases, and native Git deployments | Duplicate Action-driven deploy paths or shared asset governance |
| Eagle-compatible library | Optional high-speed local creative browsing and curation | Rights, usage, publication, or provider truth |

VIS resolves the same logical asset across these systems with `asset_id`, `version_id`, and SHA-256. A provider URL is a replaceable location, not the identity of the asset.

## Content and CMS architecture

The lowest-cost current CMS is the existing Git/MDX model:

- Git/MDX remains canonical for site copy, structured content, product metadata, and versioned manifests.
- VIS remains canonical for media metadata and relationships.
- Google Drive remains the human collaboration and approval surface.
- Notion may stage editorial work, but public sites should consume reviewed Git content rather than live workspace pages by default.
- A new paid headless CMS is not justified until editor volume, localization, workflow, or non-technical publishing needs exceed the Git/Drive model.
- Self-hosted DAM/CMS software on C940 should be reconsidered only after the C940 inventory is online, backed up, and the operating cost is justified. VIS already supplies the authoritative graph, so another DAM must be a view or workflow client rather than a second source of truth.

Agents should request assets by `visual://asset/{asset_id}` or a governed manifest. They must not search random folders, guess public URLs, or upload a local file directly to a production store.

## Object model and keys

All R2 and Blob planning is content-addressed. Filenames are readable suffixes only and cannot provide uniqueness.

- Private master: `v1/{brand}/{role}/{sha-prefix}/{sha256}/source.{extension}`
- Shared rendition: `v1/{brand}/{asset_id}/{version_id}/{profile}/{sha256}.{extension}`
- Workflow: `v1/{brand}/{stage}/{sha-prefix}/{sha256}/asset.{extension}`
- App-local Blob: `v1/{brand}/{app}/{legacy-key}/{version_id}/{sha-prefix}-{asset_id}.{extension}`

The Arcanea media tiers remain a compatibility constraint, but existing object keys and URLs are not rewritten automatically:

- R2: video, audio, and large images over 2 MiB.
- Vercel Blob: selected thumbnails, icons, logos, social assets, and other small app-local images under 2 MiB.
- Supabase: authenticated user-generated content when the product already uses that boundary.

Any new Starlight key adds brand, immutable version, and checksum identity. Arcanea and FrankX require an approved legacy-key resolver or redirect manifest before a new Blob key can be emitted. No filename-only provider key is allowed.

R2 custom metadata is limited to the compact allowlist in the policy and must stay below 2 KiB. Full provenance, prompts, reviews, and rights evidence stay in VIS/Git.

## Routing gates

The planner creates two independent decisions for every asset:

1. **Master decision:** keep the source, stage it in the private workflow bucket, or plan a checksum-addressed private master copy.
2. **Delivery decision:** hold it, plan an app-local Blob rendition, or plan a shared R2 rendition.

A private master can be planned only when brand, checksum, rights, and provenance are known. Workflow material can be staged privately only after rights clearance plus the structured `workflow-approved` / `data-classification:business-nonsensitive` review; names and folder placement alone never authorize a cloud copy.

Public delivery is stricter. Every asset must have:

- rights status `owned`, `generated-owned`, or `licensed`;
- approval status `approved`;
- an accepted premium-asset evaluation at 26/30 or higher;
- evidence that the actual export was inspected;
- a reviewer different from the maker;
- an approved publication record or explicit production-manifest edge, plus a mapped target application;
- an explicit target application or shared delivery manifest;
- a matching checksum absent from already-synced provider objects.

Unknown rights, personal/sensitive files, archives, unclassified brands, and unused candidates remain visible in the plan but receive no public delivery key.

## Google Drive alignment

Drive is organized by lifecycle rather than brand duplication:

| Folder | DAM role |
| --- | --- |
| `00_INBOX_MOBILE` | Unclassified intake; private review only |
| `01_Eagle_Library` | Human visual browsing/curation mirror |
| `02_APPROVED_MASTERS` | Human-approved master candidates; VIS gates still apply |
| `03_WEBSITE_ASSETS` | Website delivery candidates, not automatic publication |
| `04_SOCIAL_EXPORTS` | Social export candidates and review proofs |
| `05_NFT_COLLECTIONS` | Collection sources; mint and rights gates remain separate |
| `06_MUSIC_RELEASES` | Release media; Music IS remains release authority |
| `07_PROMPTS_AND_PROVENANCE` | Prompt, model, license, source, and creation evidence |
| `08_AGENT_OUTPUTS` | Expiring private workflow material |
| `99_ARCHIVE` | Retained history; no automatic cloud copy or deletion |
| `_MANIFESTS` | Human-readable migration/review packets |

Drive sharing must be Restricted for the vault and critical masters. Anyone-with-link writer permissions are an explicit blocker until removed by the account owner or a connector with permission-management capability.

## Production website wiring

Existing working URLs are not rewritten en masse. Each site moves through a manifest-driven, reversible cutover:

1. Generate a VIS plan and resolve all blockers for the selected route or collection.
2. Create optimized derivatives locally with the correct crop, format, dimensions, and accessibility text.
3. Run the premium 30-point review on the actual exports.
4. Upload once through a checksum-verifying adapter.
5. Record the `storage_object`, derivative, provenance event, and intended publication in VIS.
6. Change one site manifest or asset resolver in a draft PR.
7. Run local gates, one Vercel preview, visual QA, accessibility, and performance checks.
8. Promote only the coherent release. Keep the old URL in the manifest until rollback risk has passed.

R2 production delivery requires a custom domain on a Cloudflare zone in the same account. `r2.dev` is never a production path. No custom-domain mapping is assumed by this architecture; names such as `media.arcanea.ai`, `assets.frankx.ai`, or Starlight CDN variants remain proposals until the correct zone, DNS ownership, cache policy, and rollback path are verified.

### Estate-specific sequence

| Application | Current evidence | Next safe move |
| --- | --- | --- |
| FrankX website | Large static asset estate and mature Blob utilities; duplicate local clones target the same Vercel project | Reconcile the canonical clone first, then migrate one high-value collection via its existing adapter and a VIS manifest |
| Arcanea AI app | Existing R2/Blob/Supabase tier contract and Drive document ingestion | Reconcile bucket/domain configuration with the new shared topology; keep UGC in Supabase; pilot one approved non-UGC collection |
| Starlight Intelligence System | Existing Vercel project and a GitHub Action that may duplicate native deployment | Select one deploy path before any asset URL PR; then pilot approved shared renditions |
| GenCreator | Small static estate, no existing remote-media dependency | Keep static files until a real usage or dynamic-upload need justifies a provider adapter |
| Local-only academy/community/ocean apps | No deployed remote-media contract | Do not inherit production DAM wiring yet |
| Rova, Vibeclubs, Arcanea Studio, academy | Small or moderate local estates with mixed Supabase/MDX patterns | Index in VIS now; add provider wiring only per product need and clean worktree |

“Verso Blob” has no verified provider, dependency, or API in the canonical estate. It is treated as unresolved terminology, likely a reference to Vercel Blob, and receives no architecture binding until a concrete product is identified.

## Critical identity and premium review queue

The first one-time high-intelligence review is intentionally small and high leverage:

1. FrankX logo, wordmark, favicon/app icons, and default Open Graph master.
2. Arcanea official identity, favicon/app icons, and mascot/guardian applications.
3. GenCreator identity plus app and social suite.
4. Starlight logo, favicon/app icons, and default social/Open Graph master.
5. Brand-specific homepage heroes, flagship product covers, proof media, and highest-reach social templates.

Deterministic checks run first: dimensions, alpha, color profile, file size, duplicate checksum, filename, source/provenance, and usage. Then contact sheets group only critical assets for multimodal review, which is more token-efficient than evaluating thousands of images individually. The maker and reviewer must differ. Assets scoring below 22 restart, 22–25 iterate, and 26–30 may ship after actual-export inspection.

Rendered or 3D logo images are applications, not vector identity masters. Each brand needs a vector-first master set, monochrome and inverse variants, clear-space/minimum-size rules, favicon/app exports, social/OG templates, and a provenance record.

## Cost, performance, and lifecycle

- R2 Standard is used because its free tier applies to Standard. The current pre-migration upper-bound estimate is about 13.55 GiB across local logical assets and Drive metadata before cross-system deduplication; actual R2 billable storage remains unknown until a governed manifest and checksum reconciliation are complete.
- Hash-first planning prevents duplicate uploads and duplicate storage costs.
- Vercel Blob is not used as a central archive; that avoids duplicate copies and app coupling.
- Public images should be pre-sized and cache-immutable. Do not use Workers image transformation as an unbounded dynamic variant factory.
- Workflow objects receive lifecycle rules after an authenticated API/CLI path is configured and tested: `tmp/` at seven days and the governed workflow namespace after review, normally by 90 days.
- Masters are not automatically expired. Renditions remain while referenced by an active manifest or publication.
- GitHub Actions and Vercel builds follow draft-first PRs, local gates, one deploy path, concurrency cancellation, path filters, and one build per coherent change set.
- No migration deletes source files. Deduplication savings are reported as candidates and require a separate backup/restore proof plus human deletion approval.

## Rollout phases

### Phase 0 — complete

- Inventory local canonical asset locations and Drive metadata.
- Establish the Drive folder contract.
- Verify R2 account state.
- Create and verify the three private EU Standard buckets.
- Audit canonical applications, Blob/R2 patterns, and duplicate deployment risks.

### Phase 1 — current

- Land the policy, schema, and plan-only VIS command.
- Generate the first complete classification packet from the current VIS database.
- Resolve brand, rights, provenance, and premium-review queues without uploading binaries.
- Restrict risky Drive shares.

### Phase 2 — controlled pilot

- Configure a least-privilege R2 credential outside Git.
- Apply and verify workflow lifecycle rules.
- Pilot one approved brand collection with checksum preflight and post-upload verification.
- Record provider objects and provenance in VIS.
- Wire one clean site lane through a draft PR and preview.

### Phase 3 — estate rollout

- Batch by brand and usage, not by folder size.
- Reconcile the duplicate FrankX clones and every dirty application lane before writes.
- Process the C940 inventory through the same hash-first VIS scan when the machine is online.
- Add verified custom-domain delivery for shared R2 renditions.
- Migrate only assets with measurable delivery, cost, governance, or collaboration value.

### Phase 4 — steady state

- New assets enter Drive or an app-local upload boundary, receive VIS identity and provenance, then pass rights/quality gates.
- Agents consume governed manifests or `visual://` references.
- Periodic reports find missing rights, unused public copies, stale workflow objects, duplicate checksums, broken URLs, and assets with no current publication.
- Provider migrations remain reversible because sites resolve provider locations through VIS-backed manifests.

## Command examples

Read-only plan to stdout:

```powershell
node scripts/plan-dam-rollout.mjs --db C:\path\to\data\vis.sqlite
```

Brand-scoped plan:

```powershell
node scripts/plan-dam-rollout.mjs --db C:\path\to\data\vis.sqlite --brand arcanea --limit 200
```

Token-efficient critical review queue (identity first, capped per brand):

```powershell
node scripts/plan-dam-rollout.mjs --db C:\path\to\data\vis.sqlite --review-queue --per-brand 12 --limit 48
```

Explicit local manifest write (still no provider write):

```powershell
node scripts/plan-dam-rollout.mjs --db C:\path\to\data\vis.sqlite --out C:\safe\review\dam-plan.json --write-plan
```

The command fails closed if `--execute` is supplied.
