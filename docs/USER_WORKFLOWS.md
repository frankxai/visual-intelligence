# Visual Intelligence OS User Workflows

## Solo Founder Daily Flow

1. Run `vis scan --media-root <folder>` on new or changed media.
2. Run `vis dashboard`.
3. Open the dashboard and search by character, brand, product, campaign, route, or tag.
4. Select an asset.
5. Copy local path, `visual://` URI, or Codex packet.
6. Ask an agent to place, evolve, publish, or evaluate the asset.
7. Record usage or publication as a dry-run first, then execute only after human approval.

## Website Flow

1. Choose an approved asset.
2. Inspect dimensions, rights, and usage history.
3. Copy a curation packet.
4. Ask Codex to place it on a route or generate a derivative.
5. Scan again to detect the route usage edge.
6. Record live URL after deployment verification.

## Social Flow

1. Choose asset, video, audio, or release art.
2. Create social variant outside VIS or through a future derivative command.
3. Export a Postiz/manual upload packet.
4. Record platform, caption, campaign, URL, date, and metrics.

## Generation Flow

1. Agent creates media.
2. Agent writes sidecar JSON/Markdown with prompt, negative prompt, model, settings, skill, agent, repo, and thread/session references.
3. `vis scan` links sidecars to assets.
4. Quality eval is recorded.
5. Asset is approved/rejected.

## NFT / Web3 Flow

1. Search collection assets by category, tag, or folder.
2. Run `vis nft-report`.
3. Review rights, duplicates, dimensions, metadata, and readiness.
4. Export IPFS/R2/thirdweb manifest in a later adapter phase.
5. Human approves mint/drop configuration before any wallet or contract action.

## Archive / Backup Flow

1. Originals remain local.
2. Approved masters get planned R2 storage objects.
3. Production derivatives get planned Cloudinary records.
4. Drive/OneDrive imports preserve provider IDs.
5. VIS records locations instead of hiding where truth lives.

