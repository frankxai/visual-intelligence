# VIS Open Source Tech Radar

Date: 2026-06-26

This radar documents what VIS can build on, what should stay adapter-only, and what should not be copied into the MIT core. It is not legal advice. Before vendoring code, shipping binaries, or offering hosted redistribution, re-check the exact upstream license and attribution requirements from the linked official source.

## License Posture

- VIS core stays MIT and local-first.
- Prefer MIT, Apache-2.0, BSD, ISC, SQLite public domain, and standards-based integrations for code that may enter core packages.
- Keep AGPL, GPL, BSL, source-available, proprietary, and uncertain-license projects outside core as optional adapters, CLIs, API integrations, or product inspiration.
- Credit upstreams in docs and product UI when their APIs, SDKs, or workflows materially shape VIS.
- Do not copy UI, icons, proprietary datasets, model outputs, or license-restricted code from competitor products.

## Adopt Into Core Or First-Party Packages

| Layer | Candidate | License posture | VIS stance | Source |
| --- | --- | --- | --- | --- |
| Runtime | Node.js `node:sqlite` | Node.js project license; modern Node required | Use for local SQLite without adding native database dependencies | https://nodejs.org/api/sqlite.html |
| Database | SQLite | Public domain | Use as local source of truth | https://www.sqlite.org/copyright.html |
| Web app | Next.js | MIT | Use for Phase 3 dashboard/PWA when moving beyond static HTML | https://github.com/vercel/next.js |
| Desktop shell | Tauri | Apache-2.0/MIT family | Use after PWA proves daily value | https://github.com/tauri-apps/tauri |
| Upload UI | Uppy | MIT | Use for import/ingest workflows | https://github.com/transloadit/uppy |
| Dataset QA | FiftyOne | Apache-2.0 | Study/adapt concepts for visual dataset review and model evals | https://github.com/voxel51/fiftyone |
| Data lineage | OpenLineage | Apache-2.0 | Borrow event/lineage concepts for provenance events | https://github.com/OpenLineage/OpenLineage |
| Data versioning | DVC | Apache-2.0 | Optional adapter for large generated datasets and training sets | https://github.com/iterative/dvc |
| Analytics DB | DuckDB | MIT | Optional local analytics/query sidecar for large reports | https://github.com/duckdb/duckdb |
| Headless CMS | Payload | MIT | Strong candidate for hosted/team metadata and approval workflows | https://github.com/payloadcms/payload |
| Web3 contracts | OpenZeppelin Contracts | MIT | Use audited primitives through Web3 adapters, not custom minting code | https://github.com/OpenZeppelin/openzeppelin-contracts |
| Web3 client | viem | MIT | Candidate for read/report flows if direct chain reads are needed | https://github.com/wevm/viem |

## Adapter-Only Or External Tooling

| Layer | Candidate | License/commercial note | VIS stance | Source |
| --- | --- | --- | --- | --- |
| Photo library | Immich | AGPL-3.0 | Optional local/self-host adapter or inspiration; do not embed server code in VIS core | https://github.com/immich-app/immich |
| Photo library | PhotoPrism | AGPL-3.0 | Optional import/reference adapter; do not copy code into VIS core | https://github.com/photoprism/photoprism |
| Metadata | ExifTool | Perl Artistic/GPL dual license | Use as optional external CLI; do not bundle without license review | https://exiftool.org/ |
| Metadata | Exiv2 | GPL-family project | Adapter-only or separate process; avoid linking into MIT core | https://github.com/Exiv2/exiv2 |
| Content credentials | C2PA/c2patool | Open tooling, exact component license must be rechecked | Optional CLI adapter for manifests and verification | https://github.com/contentauth/c2patool |
| Standards | IPTC Photo Metadata | Open standard, not a code dependency | Map fields for creator, copyright, licensing, source, caption, and instructions | https://iptc.org/standards/photo-metadata/iptc-standard/ |
| Standards | C2PA specification | Open standard, not a code dependency | Treat C2PA claims as evidence alongside VIS ledger events | https://spec.c2pa.org/specifications/specifications/2.2/index.html |
| DAM/CDN | Cloudinary Assets | Commercial SaaS | Adapter for production delivery and transformations | https://cloudinary.com/documentation/digital_asset_management_overview |
| Object storage | Cloudflare R2 | Commercial cloud service | Adapter for approved masters and low-egress storage | https://developers.cloudflare.com/r2/ |
| Social publishing | Postiz | Open-source product with MCP; license must be checked before embedding | External scheduler/MCP/API adapter; VIS records publications and metrics | https://docs.postiz.com/mcp/introduction |
| Cloud files | Google Drive API | Google API terms | Import/sync provider IDs and metadata, not source of truth | https://developers.google.com/workspace/drive/api/guides/about-files |
| Cloud files | Microsoft Graph driveItem | Microsoft API terms | Import/sync provider IDs and metadata, not source of truth | https://learn.microsoft.com/en-us/graph/api/resources/driveitem |
| NFT tooling | thirdweb | SDK/product terms must be checked per package | Adapter for drop setup/export only; minting remains human-gated | https://github.com/thirdweb-dev |
| IPFS | Kubo/IPFS | Open-source project; verify exact component before bundling | Adapter for CID/export flows; no forced storage provider | https://github.com/ipfs/kubo |

## Avoid As Core Dependency For Now

| Candidate | Reason | VIS posture | Source |
| --- | --- | --- | --- |
| Directus | Source-available/commercial constraints changed across versions | Use only as external system adapter if a user already runs it | https://github.com/directus/directus |
| Pimcore | GPL/commercial DAM/PIM stack | Integration target only; do not build VIS on it | https://github.com/pimcore/pimcore |
| n8n | Source-available license model | Useful automation integration, not core dependency | https://github.com/n8n-io/n8n |
| MinIO server | AGPL-3.0 server license | Use S3/R2 APIs directly; do not bundle MinIO server | https://github.com/minio/minio |
| Eagle.cool | Proprietary desktop app | Product inspiration and optional manual workflow, not dependency | https://eagle.cool/ |

## What VIS Should Build Itself

- Repo-aware asset graph: locations, route usage, generated derivatives, prompt sidecars, and publication edges.
- Agentic provenance ledger: model, prompt, negative prompt, seed/settings, agent, skill, repo, thread/session, output path, evaluation.
- MCP surface: `visual://` resources, curation packets, search/trace/map/score tools, and human-gated write tools.
- Visual curator: approval state, rights state, quality score, brand/taste score, next action, and audit trails.
- Cross-system map: local paths, website routes, social URLs, R2 keys, Cloudinary IDs, Drive/OneDrive provider IDs, IPFS CIDs, NFT metadata rows.

## What VIS Should Not Build First

- Full camera roll backup and mobile sync.
- Generic enterprise DAM permissions.
- Social scheduler.
- CDN/image transformation engine.
- Wallet, contract deployment, or minting stack.
- Native mobile app before PWA and desktop usage prove demand.

## Credit And Compliance Workflow

1. Add every adopted library, CLI, API, and standard to this radar before implementation.
2. Store exact package name, version, license, source URL, and attribution note in a future `THIRD_PARTY_NOTICES.md`.
3. Keep adapter credentials outside Git.
4. Run a license scan before any hosted/team release.
5. Keep copyleft and source-available tools out of the distributed core unless the business explicitly accepts those obligations.
