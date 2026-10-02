# Visual Intelligence OS Research

Date: 2026-06-26

VIS should build the unique agentic layer and adapt the mature infrastructure that already exists.

For license posture and GitHub-by-GitHub adoption stance, see `docs/OPEN_SOURCE_TECH_RADAR.md`.

## Anchors

- Model Context Protocol: use MCP resources and tools for agent access to assets, provenance, and curation packets. See https://modelcontextprotocol.io/docs/getting-started/intro.
- Cloudflare R2: use as sovereign object storage and low-egress archival/approved-master storage. See https://developers.cloudflare.com/r2/.
- Cloudinary Assets: use for production DAM/CDN delivery, transformations, and asset delivery workflows. See https://cloudinary.com/documentation/digital_asset_management_overview.
- IPTC Photo Metadata: use as an interoperable metadata layer for captions, creator, copyright, licensing, and source details. See https://iptc.org/standards/photo-metadata/iptc-standard/.
- C2PA: use as provenance evidence for content credentials where supported, while assuming platforms may strip metadata. See https://spec.c2pa.org/specifications/specifications/2.2/index.html.
- Google Drive API: use provider file IDs and metadata for import/sync links rather than replacing Drive. See https://developers.google.com/workspace/drive/api/guides/about-files.
- Microsoft Graph driveItem: use provider IDs and drive item metadata for OneDrive import/sync links. See https://learn.microsoft.com/en-us/graph/api/resources/driveitem.
- Postiz MCP: use as a publishing/scheduling adapter instead of building a social scheduler first. See https://docs.postiz.com/mcp/introduction.

## Build

- Repo-aware media graph.
- Prompt and generation provenance.
- Agent run and skill run capture.
- MCP resources and curation packets.
- Website route usage map.
- Social/publication ledger.
- NFT collection readiness reports.
- Visual quality and brand taste evaluation loop.

## Buy Or Adapt

- R2 for storage.
- Cloudinary for CDN/DAM delivery.
- Postiz for social publishing.
- Drive/OneDrive for cloud-file references.
- Immich/PhotoPrism/Eagle-style tools for personal browsing where useful.
- C2PA/IPTC/ExifTool-compatible metadata for embedded evidence.
- IPFS/thirdweb/manifold-style tooling for Web3 drops.

## License Rule

The VIS core should stay MIT-compatible. Permissive libraries can be considered for first-party packages; AGPL/GPL/BSL/source-available/proprietary systems should remain optional adapters, external services, or inspiration unless Frank explicitly accepts the obligations.

## Avoid Building First

- Full photo backup and mobile camera roll sync.
- Enterprise DAM permissions.
- Social scheduler.
- Image transformation CDN.
- Wallet, contract, and minting stack.
- Native mobile app.

## Opportunity

The market has asset libraries, DAMs, photo apps, NFT tooling, and social schedulers. VIS can win by connecting:

- Local folders and repos.
- Prompts and generation events.
- Coding agents and MCP.
- Website routes and social publications.
- Brand/taste scoring.
- Web3 metadata readiness.

The product thesis is an intelligence layer across existing systems, not a replacement for every system.
