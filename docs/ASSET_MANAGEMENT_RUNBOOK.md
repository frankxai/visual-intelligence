# Visual Asset Management & Multi-Cloud Distribution Runbook

**Visual Intelligence OS (VIS 3.0)**  
*Canonical Control Plane: `C:/Users/frank/starlight/repos/visual-intelligence`*

---

## 1. System Architecture

VIS indexes scattered images, videos, audio stems, prompts, and website usage edges into a unified local SQLite asset graph (`data/vis.sqlite`), then provides dry-run-first pipelines to route approved assets to their optimal cloud/on-chain destination.

```
                              LOCAL ASSET GRAPH (vis.sqlite)
                                            │
         ┌──────────────────────────────────┼──────────────────────────────────┐
         ▼                                  ▼                                  ▼
┌──────────────────┐               ┌──────────────────┐               ┌──────────────────┐
│   VERCEL BLOB    │               │  CLOUDFLARE R2   │               │   IPFS / WEB3    │
│  (Web Edge CDN)  │               │(Media Master/CDN)│               │  (Immutable IP)  │
├──────────────────┤               ├──────────────────┤               ├──────────────────┤
│ • frankx.ai UI   │               │ • Full archive   │               │ • Arcanea NFTs   │
│ • Next.js blog   │               │ • Video masters  │               │ • Story Protocol │
│ • Active avatars │               │ • Canvas (9:16)  │               │ • Lore canon art │
│ • Fast dynamic OG│               │ • Zero egress fee│               │ • Trait metadata │
└──────────────────┘               └──────────────────┘               └──────────────────┘
```

---

## 2. Safe Estate Scanning (Phone Link Protection)

> [!WARNING]
> **Windows Phone Link Search Safety Rule:**  
> NEVER run broad or recursive searches from `C:\`, `C:\Users\frank`, or `$HOME`. Broad scans traverse virtual phone folders and trigger massive automatic downloads over cellular/WiFi.

Always scan through the pre-configured whitelisted `frank-estate` scan profile:

```powershell
cd C:\Users\frank\starlight\repos\visual-intelligence

# 1. Inspect environment & database health
node bin/vis.mjs doctor

# 2. Dry-run scan across whitelisted repos and vault roots
node bin/vis.mjs scan-profile frank-estate

# 3. Execute index into data/vis.sqlite
node bin/vis.mjs scan-profile frank-estate --execute

# 4. Crawl website route references
node bin/vis.mjs usage --usage-root "C:\Users\frank\starlight\repos\frankx.ai-vercel-website"
```

---

## 3. Brand Classification & Approval Gates

Assets are automatically classified into one of the 10 Estate Brand Units:

| Operating Unit ID | Brand | Destination Priority | Asset Criteria |
| :--- | :--- | :--- | :--- |
| `frankx-demand` | **FrankX** | `vercel-blob` $\rightarrow$ `cloudflare-r2` | Blog heroes, portraits, product cards, exact code diagrams |
| `arcanea-product-ip` | **Arcanea** | `ipfs-nft` $\rightarrow$ `cloudflare-r2` | Guardians, Godbeasts, 10 Gates, Spellbound, character sheets |
| `starlight-substrate` | **Starlight** | `cloudflare-r2` $\rightarrow$ `vercel-blob` | Architecture topologies, agent swarm maps, civic intelligence |
| `music-intelligence` | **Music IS** | `cloudflare-r2` (`music-releases`) | 1:1 Album covers (3000px), 9:16 Spotify Canvas, audio stems |
| `anime-legends` | **AnimeLegends** | `cloudflare-r2` $\rightarrow$ `ipfs-nft` | Mascots, sigils, anime-mythic media IP |

### Quality & Rights Gates
Before an asset is eligible for cloud or on-chain hosting, it must pass:
1. **Brand Guardian:** Complies with brand visual tokens (e.g. no generic AI dashboard aesthetics, exact overlays for charts/numbers).
2. **Conversion & Reach:** Correct aspect ratio (16:9 for hero, 1200x630 for OG, 9:16 for Canvas), clear focal hierarchy.
3. **Rights & Provenance:** Has prompt sidecar and rights set to `generated-owned` or `owned`.

```powershell
# Review and approve a batch of assets
node bin/vis.mjs review-assets <asset_id_1> <asset_id_2> `
  --rights-status generated-owned `
  --approval-status approved `
  --reason "Brand guardian and quality review passed"
```

---

## 4. Multi-Cloud Upload Workflows

### A. Vercel Blob (`upload-blob`)
Syncs approved website assets to edge storage for Next.js applications.

```powershell
# 1. Preview upload manifest (Dry-run)
node bin/vis.mjs plan-upload --target vercel-blob --brand frankx

# 2. Execute upload to Vercel Blob
node bin/vis.mjs upload-blob --brand frankx --collection "website-ready" --execute
```
*Required Environment Variable:* `BLOB_READ_WRITE_TOKEN`

### B. Cloudflare R2 (`upload-r2`)
Lossless master archive and zero-egress CDN delivery.

```powershell
# 1. Preview upload manifest for master archive
node bin/vis.mjs plan-upload --target cloudflare-r2 --bucket media-masters

# 2. Execute sync to Cloudflare R2
node bin/vis.mjs upload-r2 --bucket media-masters --approval approved --execute
```
*Required Environment Variables:* `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`

### C. IPFS & Web3 NFT Pinning (`upload-ipfs`)
Generates ERC-721 / Metaplex metadata packets and pins assets to IPFS.

```powershell
# 1. Preview token metadata and trait bundles
node bin/vis.mjs plan-upload --target ipfs --collection arcanea-guardians

# 2. Execute IPFS pinning
node bin/vis.mjs upload-ipfs --collection arcanea-guardians --execute
```
*Required Environment Variable:* `PINATA_JWT`

---

## 5. Storage Status & Visual Cockpit

Check estate synchronization metrics at any time:

```powershell
# View multi-cloud sync breakdown in terminal
node bin/vis.mjs storage-stats

# Launch the visual PWA cockpit dashboard
node bin/vis.mjs serve-dashboard --port 3766
```
Open `http://localhost:3766/data/vis-dashboard.html` in your browser.

---

## 6. Agent Operating Contract (Preventing Future Asset Scatter)

When any agent (Antigravity, Claude Code, Codex, Grok) generates an image or video:

1. **Pre-Check:** Query the visual registry (`vis.mjs search "<topic>"`) to reuse existing approved visuals.
2. **Sidecar Generation:** Write `<filename>.vis.provenance.json` alongside the generated media.
3. **Register:** Run `node bin/vis.mjs scan --diff` to ingest into `vis.sqlite`.
