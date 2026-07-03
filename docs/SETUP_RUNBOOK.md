# VIS Estate Setup Runbook

Date: 2026-07-03

Purpose: make two laptops and two phones work as one creative media estate without losing provenance, rights, prompts, or agent context.

## Target Stack

- Phones: Google Photos for camera backup; Google Drive mobile app for intentional creative uploads.
- Cloud vault: Google Drive `Starlight Creative Vault`.
- Laptops: Google Drive for desktop, Eagle, VIS CLI/dashboard/MCP, local repos.
- Agent layer: Claude/Codex/Grok use VIS MCP and `visual://` URIs.
- Product layer: VIS tracks provenance, usage, rights, publication, and next action.

## Folder Structure

```text
Google Drive / Starlight Creative Vault
  00_INBOX_MOBILE
  01_Eagle_Library
  02_APPROVED_MASTERS
  03_WEBSITE_ASSETS
  04_SOCIAL_EXPORTS
  05_NFT_COLLECTIONS
  06_MUSIC_RELEASES
  07_PROMPTS_AND_PROVENANCE
  08_AGENT_OUTPUTS
  99_ARCHIVE
```

## Laptop 1 Setup

1. Install Google Drive for desktop.
2. Sign in to the correct Google account.
3. Configure the creative vault as locally available/mirrored where Eagle and VIS need reliable file paths.
4. Buy/install Eagle.
5. Create or move the Eagle library to:

```text
Google Drive\Starlight Creative Vault\01_Eagle_Library
```

6. Install Eagle browser extension.
7. In VIS repo, run:

```powershell
cd C:\Users\frank\starlight\repos\visual-intelligence
npm install
npm run doctor
npm run lint
npm test
node bin\vis.mjs profiles
node bin\vis.mjs scan-profile frank-estate
node bin\vis.mjs eagle --library "<Google Drive>\Starlight Creative Vault\01_Eagle_Library"
node bin\vis.mjs scan --media-root "C:\Users\frank\starlight\repos" --json
node bin\vis.mjs scan --media-root "<Google Drive>\Starlight Creative Vault" --json
node bin\vis.mjs dashboard --limit 3000
```

8. Install Claude MCP:

```powershell
claude mcp add vis-mcp `
  -e VIS_ROOT="C:\Users\frank\starlight\repos\visual-intelligence" `
  -e VIS_ALLOWED_ROOTS="C:\Users\frank\starlight\repos;<Google Drive>\Starlight Creative Vault" `
  -- node "C:\Users\frank\starlight\repos\visual-intelligence\mcp\vis-mcp-server.mjs"
```

9. Verify:

```powershell
claude mcp get vis-mcp
node bin\vis.mjs search eagle --limit 3
node bin\vis.mjs doctor --json
```

Use the `MCP allowlist from existing roots` line from `node bin\vis.mjs scan-profile frank-estate` when installing VIS MCP on each laptop. Add `--execute` only after the dry-run roots look correct.

Use `node bin\vis.mjs eagle --library "<Eagle library path>" --execute` only after the Eagle dry-run shows the expected item count, folders, tags, and sample paths.

## Laptop 2 Setup

1. Install Google Drive for desktop and sign in to the same account.
2. Make the same creative vault locally available.
3. Install Eagle and activate the same license if it remains within license terms.
4. Open the synced Eagle library only after Drive sync is complete.
5. Pull the VIS branch and run the same doctor/lint/test/scan/dashboard/MCP checks.
6. Confirm a selected `visual://asset/...` packet resolves to a valid local path on laptop 2.

## Phone Setup

1. Enable Google Photos backup for camera roll.
2. Install Google Drive app.
3. Create shortcuts/favorites for:
   - `00_INBOX_MOBILE`
   - `04_SOCIAL_EXPORTS`
   - `06_MUSIC_RELEASES`
4. When a phone asset is product-relevant, share/export it into `00_INBOX_MOBILE`.
5. Weekly, curate `00_INBOX_MOBILE` into Eagle/VIS-approved folders from a laptop.

## Daily Workflow

1. Capture on phone, browser, generation tool, or repo.
2. Save raw capture to Drive inbox or Eagle.
3. Run VIS scan when enough new assets exist.
4. In dashboard, inspect, score, approve/reject, and create a Codex packet.
5. Ask an agent to use/evolve/publish with the packet.
6. Record publication or usage back into VIS.

## Sync Rules

- Do not actively edit the same Eagle library on both laptops at once.
- Wait for Google Drive sync to finish before switching laptops.
- Keep originals in Drive/Eagle/local repos; keep VIS generated data ignored.
- Treat Google Photos as phone backup, not product source of truth.
- Treat Eagle as curated browsing, not provenance source of truth.
- Treat VIS as intelligence/provenance/agent source of truth.

## Acceptance Checklist

- [ ] Eagle installed and activated on both laptops.
- [ ] Google Drive for desktop installed and vault locally available on both laptops.
- [ ] Phone 1 and phone 2 backup to Google Photos.
- [ ] Phone 1 and phone 2 can upload selected assets to Drive inbox.
- [ ] VIS `doctor` passes on both laptops.
- [ ] VIS dashboard opens on both laptops.
- [ ] Claude MCP `vis-mcp` connected on both laptops.
- [ ] Same asset can be searched, traced, and packeted on both laptops.
- [ ] Generated `data/` files remain ignored by Git.
