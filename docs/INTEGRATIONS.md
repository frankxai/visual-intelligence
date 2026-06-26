# Visual Intelligence OS Integrations

## Current

- SQLite: local source of truth.
- JSON registry: compatibility export.
- MCP: agent access.
- HTML dashboard: local visual cockpit.

## Planned Adapter Pattern

Adapters should not become source of truth. They should read VIS records, produce dry-run manifests, and only write after explicit human approval.

## R2

Use for approved masters and sovereign backups. Store `storage_object` records with provider, bucket, key, checksum, status, and URL.

## Cloudinary

Use for production delivery, transformations, DAM workflows, and CDN URLs. Start with `vis cloudinary-manifest`; upload later through a gated adapter.

## Postiz

Use for social scheduling/publishing. VIS should produce curation packets and record publication URLs/metrics after posting.

## Google Drive / OneDrive

Use for import/sync metadata. Store provider IDs and links in `asset_location` or `storage_object`; avoid copying credentials or treating Drive as primary truth.

## Vercel

Use route verification for website usage after deployment. VIS stores route usage and live URL publication records.

## IPFS / thirdweb

Use for NFT metadata and storage exports. VIS creates readiness reports and manifests; minting remains human-gated.

## C2PA / IPTC / ExifTool

Use for embedded metadata where feasible. VIS ledger remains the operational source because many platforms strip metadata.

