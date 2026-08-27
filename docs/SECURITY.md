# Visual Intelligence OS Security

## Defaults

- Local-first storage.
- SQLite and JSON exports are written under `data/`.
- MCP is read-only by default.
- Write-like MCP tools return dry-runs unless `VIS_ENABLE_WRITES=1` and `execute: true`.
- Paths outside the VIS allowlist are redacted by the MCP server.

## Allowlist

The MCP server allows:

- `VIS_ROOT`
- `VIS_ALLOWED_ROOTS` entries separated by the OS path delimiter
- `allowedRoots` from `vis.config.json`

Do not include personal folders, private memory folders, wallet folders, or cloud sync roots unless intentionally indexing them.

## Never Auto-Publish

These actions require explicit human approval:

- Social posting.
- Minting or wallet actions.
- Paid cloud uploads.
- Public publishing.
- File deletion.
- Production deployment.

## Secrets

- Do not store secrets in SQLite, JSON exports, or sidecars.
- Do not index `.env`, private keys, recovery keys, or wallet files.
- Keep credentials in the existing Starlight secret system or provider CLIs.

## Metadata Trust

C2PA/IPTC/XMP metadata is evidence, not truth. Platforms may strip metadata. VIS keeps an independent provenance ledger.

## Rights Status

Every public asset should use one of:

- `owned`
- `generated-owned`
- `licensed`
- `unknown`
- `blocked`
- `needs-review`

Assets with `unknown`, `blocked`, or `needs-review` should not be shipped publicly without review.

