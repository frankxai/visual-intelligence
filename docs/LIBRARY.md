# VIS library

A local library over folders you declare once. It files new images, makes a thumb and a preview, and keeps rights at `unknown` until a person changes them. Agents can search it and propose changes. A person accepts proposals, sets rights, and publishes.

Plan and gates: `C:\Users\frank\.agent-harness\plans\library-and-storage-2026-09\`.

## Declare the roots

`vis.config.json`:

```json
"library": {
  "roots": [
    { "label": "brand-assets", "path": "%USERPROFILE%/brand-assets", "exclude": ["receipts"] },
    { "label": "inbox", "path": "%USERPROFILE%/_inbox" }
  ],
  "renditionsDir": "data/renditions",
  "receiptsDir": "%USERPROFILE%/brand-assets/receipts/library",
  "limit": 50,
  "minFreeDiskGB": 35
}
```

Nothing outside `roots` is walked. Folders named in `exclude`, plus the usual private folders (`.git`, `node_modules`, and similar), are skipped.

## Commands

| Command | What it does |
|---|---|
| `vis library ingest` | Dry run: lists what would be filed |
| `vis library ingest --execute [--limit n]` | Hashes new or changed files, writes a 320 px WebP thumb, a 1600 px WebP preview, and a ThumbHash, sets rights to `unknown`, and writes a receipt. Unchanged files (same size and mtime) are skipped |
| `vis library watch --execute` | Keeps filing new files as they land |
| `vis library serve` | Opens the operator screen at http://127.0.0.1:4323 |
| `vis library list` / `show <asset>` | Reads the record |
| `vis library suggest --execute` | Runs the built-in proposer. It suggests a set from the folder, two levels deep |
| `vis library propose <asset> --kind rank\|set\|tags\|rights ... --execute` | Files a proposal |
| `vis library decide <proposal> accept\|dismiss --execute` | Decides a proposal. The CLI counts as a person |
| `vis library stats` | Accept and dismiss history per rule |

An ingest run stops early if free disk falls below `minFreeDiskGB` or if new renditions exceed `maxNewRenditionBytes` (300 MB by default). It never uploads, never calls a vision model, and never deletes a file.

## What an asset is

- **Identity:** the SHA-256 of the bytes. Two paths with the same bytes are one asset with two locations.
- **Renditions:** the thumb, the preview, and the ThumbHash. The screen and the MCP never serve the master file.
- **Rights:** `unknown` until a person sets them. The publish gate refuses `unknown`, `needs-review`, and `blocked`.
- **Proposals:** rank, set, tags, or rights. Accepting one never publishes anything.
- **Learning:** every accept and dismiss is an event. A rule that is dismissed in at least 80% of five or more decisions is muted, and the proposer skips it.

## Operator screen

It binds to `127.0.0.1` only. Writes need the `X-VIS-Operator: 1` header and a same-origin request. The grid is virtualized, and only rows near the viewport exist in the page. The rights dot is the only color on a tile: amber for `unknown` or `needs-review`, green for `owned`, `generated-owned`, or `licensed`, and red for `blocked`.

## MCP

The server is `mcp/vis-mcp-server.mjs`. It uses the same functions as the screen.

| Tool | Default | Needs |
|---|---|---|
| `library_search`, `library_get_asset`, `library_list_proposals` | open | none |
| `library_ingest`, `library_propose`, `library_decide_proposal` | dry run | `VIS_ENABLE_WRITES=1` and `execute: true` |
| Accept a rights proposal, or `review_assets` with a rights change | refused | `VIS_ENABLE_RIGHTS=1` as well |
| `record_publication` with `execute: true` | refused | `VIS_ENABLE_PUBLISH=1` |

`VIS_ENABLE_RIGHTS` and `VIS_ENABLE_PUBLISH` are human gates. A person turns them on for one session.

Register it once per assistant, read-only:

```bash
# Claude Code
claude mcp add vis --scope user -e VIS_ROOT=C:/Users/frank/visual-intelligence -- node C:/Users/frank/visual-intelligence/mcp/vis-mcp-server.mjs
# Codex (~/.codex/config.toml)
# [mcp_servers.vis]
# command = "node"
# args = ["C:/Users/frank/visual-intelligence/mcp/vis-mcp-server.mjs"]
# env = { VIS_ROOT = "C:/Users/frank/visual-intelligence" }
```

Grok uses the same command and environment in `~/.grok/config.toml`. ChatGPT needs a hosted HTTPS MCP with OAuth. That is a later step, and this server is not that host.
