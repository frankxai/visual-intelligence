# FrankX Historical Visual Review — Verified Extraction Receipt

Extracted 2026-11-10 from the authorized ChatGPT Library file `FrankX-Image-Review-2026-10-23.html` (10,392,617 bytes).

- **Original file SHA-256:** `77257e65a8d8abbf203dea902dea1341c9bbe82b23535eaf3700db475130f50c`
- **Extraction:** BeautifulSoup HTML `article[data-state]` parsing, **166 entries**.
- **Record states:** archive-study 74; retire-from-active-shelf 48; shortlist 19; needs-scene-review 11; reference-only 7; guest-restricted 4; rebuild-layout 3.
- **Extracted fields:** index, title, original review state, accompanying review text, legacy asset ID, embedded-image presence, available JSON source record.
- **Local extraction artifact:** `FrankX_historical_visual_review_inventory_2026-11-10.json`, 90,509 bytes. This file is a conversation artifact, **not yet uploaded to private VIS/R2/Drive**.
- **Source image bytes:** the HTML embeds images. These were **not** published to GitHub or copied into the registry; individual embedded-image hashes and rights are not independently verified by this extraction.
- **Review semantics:** `retire-from-active-shelf` is a prior exclusion from active creative reuse, not a universal negative style label; `reference-only` does not authorize publication; `guest-restricted` is distinct from owned mascots. `shortlist` does not mean founder-approved.

Examples:
- `Mini-Frank-Character-Model-Sheet.png` and `Mini-Frank-Cast-Model-Sheet.png`: reference-only identity anchors.
- `codex-official.webp`, `github-mona.png`, `github-copilot.png`, `github-ducky.png`: guest-restricted.
- `core-comparison.png`: retired due to withdrawn provider-equivalence claims.
- `external-character-studies.png`: retired because invented vendor-metaphor lineup must not be treated as official mascots.

## Next actual ingestion

1. Transfer the extracted **private** JSON and original HTML into the authorized private media vault using an authenticated upload adapter. Keep source ID and hash.
2. Import review records into VIS as **historical review evidence** with scoped decisions, not as new asset approvals.
3. Resolve each record's embedded image bytes and exact source identity. Deduplicate by measured SHA-256; preserve legacy IDs and all source locations.
4. Generate a bounded sample of 12 actual image previews for visual verification: reference-only, shortlist, retired, archive-study. Compare source bytes and record visual feedback.
5. Expose `get_taste_profile` and `get_negative_examples` only after tenant-scoped rights and exclusion tests; existing four read-only MCP tools remain unchanged.

## Cross-agent rule

Claude Designer, Perplexity, ChatGPT and Codex must retrieve **positive canon references** and **negative review lessons** separately. Never put retired or guest-restricted image bytes into a default generation reference pack. Keep rejected images privately searchable for critique and quality regression tests.
