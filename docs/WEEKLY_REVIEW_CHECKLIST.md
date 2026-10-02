# VIS Weekly Review Checklist

Use this every week to keep VIS useful as an internal OS and honest as a product.

## Estate Health

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `node bin\vis.mjs doctor`
- [ ] `node bin\vis.mjs scan-profile frank-estate --json`
- [ ] `node bin\vis.mjs dashboard --limit 3000`
- [ ] Confirm `data/` output remains ignored by Git.

## Device And Inbox

- [ ] Laptop 1 can open Drive, Eagle, VIS dashboard, and Claude MCP.
- [ ] Laptop 2 can open Drive, Eagle, VIS dashboard, and Claude MCP.
- [ ] Phone 1 backs up to Google Photos and can upload selected assets to Drive.
- [ ] Phone 2 backs up to Google Photos and can upload selected assets to Drive.
- [ ] `00_INBOX_MOBILE` is curated or intentionally left with dated notes.
- [ ] Eagle inbox is curated into useful folders/tags.

## Asset Intelligence

- [ ] Review duplicate groups.
- [ ] Review orphan assets.
- [ ] Review unknown, blocked, or needs-review rights.
- [ ] Review prompt/provenance gaps for generated media.
- [ ] Review website/social/NFT/music usage records.
- [ ] Create curation packets for assets that agents should use next.

## Product Work

- [ ] Move one GitHub issue into `status:in-progress`.
- [ ] Close or update completed issue tasks.
- [ ] Update `docs/VIS_TASK_REGISTRY.json` if scope changed.
- [ ] Run `npm run tasks:dry-run`.
- [ ] Run `npm run tasks:sync -- --execute` after reviewing the dry-run.
- [ ] Update `docs/PROJECT_BOARD.md` if priorities changed.

## Risks And Decisions

- [ ] Any sync conflict in Drive or Eagle?
- [ ] Any personal/private asset exposure risk?
- [ ] Any adapter credential or terms risk?
- [ ] Any human-gated purchase, upload, post, mint, or paid cloud action waiting?
- [ ] Any product positioning learning from Eagle, Immich, Cloudinary, or creator workflows?

## Weekly Output

- [ ] One short GitHub issue comment or commit note with health-check results.
- [ ] One product decision or next experiment.
- [ ] One clean next action for Frank.
