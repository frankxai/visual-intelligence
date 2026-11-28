---
name: visual-canon-retrieval
description: Retrieve historical brand marks, identity families and exact owned character art before producing new visuals.
---

# Visual canon retrieval — ChatGPT / Perplexity / Codex adapter

Use the existing VIS catalog, not a new character database. This is a portable workflow contract, **not a deployed Perplexity integration**.

## Portfolio experience review

Load the [Frontier Experience Constitution](https://github.com/Starlight-Intelligence/starlight-design-intelligence/blob/e25fab4c5a0dac2ea8c7b91e9397972f5af4b454/portfolio/frontier-experience-constitution.md) when this adapter runs outside a repository checkout. Attach the resolved source revision to the existing retrieval receipt.

## Brand identity recovery

For established marks, retrieve VIS asset/version records and original bytes before a new treatment. Use the [local archive comparator](../../scripts/search-brand-archive.py) on authorized raster roots. Supply the reviewed ONNX Model Zoo SqueezeNet 1.1-7 file and its pinned SHA-256, plus an output path; `--vectors` persists numeric descriptors and `--ocr` enables local Tesseract. Python dependencies are Pillow, NumPy and OpenCV DNN. Keep the report and artwork private. Byte and decoded-pixel matches are measured relations. Nearest neighbors require a visual review to distinguish crop/export, material variation, shared family and separate concept. Rerun visual checks on native-size artwork and on reduced proofs.

Bind each retained asset to its source, rights and independent founder decision. Use the owning logo-system reference checker before generation. For identity-only work, continue with the owning brand sources; the character-specific checklist below applies to character work.

## Before producing anything

1. Read `docs/character-canon/source-map.v1.json`. Identify brand, role, lineage, intended placement and requested exact identity.
2. Query existing VIS `get_asset_sources`, `search_assets`, `get_asset`, and `get_asset_preview` **only if the actual authenticated gateway is configured and available**. The gateway is currently locally tested, not production-deployed; never claim a successful call without a receipt.
3. Resolve the original Mini Me cast from the private `mini-me-storyboard` index and bundled references, when authorized. Run the documented hash resolver. A public GitHub retrieval contract is not an image master.
4. For Starlight Queen use the exact Space master and Figma folios; for Perplexity's role crew use the existing Drive sheet and poses. Check image bytes, dimensions and hashes before a continuity generation.
5. Separate `character_id`, `functional_role_id`, `runtime_agent_id`, `model_provider`, `model_id`, `source_asset_id` and `edition_id`.
6. Record whether the exact rendition is candidate, selected development, founder-approved or published. Do not inherit approval across variants or brands.
7. Build exact technical labels and diagrams in HTML/SVG; illustrative image generation is limited to character/scene artwork, with approved reference assets and logged prompts.
8. Evaluate identity anchors at 32/64/160px, mobile crop, grayscale, factual/source accuracy, rights, contrast and artifacts. Keep the existing 26/30 infographic gate as an additional editorial check.
9. Save new draft outputs to the existing Drive `04_Projects`; only owner-approved exact versions to `05_Approved`. Register asset identity, provenance, source locations and approval receipts in VIS. Archive R2 only after read-back checksum verification.
10. Return a handoff with immutable source URI, hash verification result, approval scope, rights, output URI, QA result, and blockers.

## Safe degradation

If VIS or private skill is unavailable, use exact source links as a **reference shortlist**, do not generate a canon replacement, and state the missing integration. Perplexity must not silently invent or rename characters. Do not copy private image bytes into public GitHub or use vendor logos as owned mascots.

## Output receipt

```json
{"character_id":null,"lineage":null,"source_uri":null,"source_sha256":null,"hash_verified":false,"approval":"unverified","rights":"unknown","output_uri":null,"qa_score":null,"published":false}
```

## Required runtime preflight

On the VIS host mount the reviewed estate implementation read-only and set `VIS_ESTATE_ROOT` to its absolute path. Set `VIS_FOLIO_ROOT` to the private installed character bundle for internal folio reviews. The stdio tool is `visual.identity.resolve`. For clients without this MCP connection, pipe the same request to `node bin/vis-identity.mjs`; on the operator host the same API is available at `GET /api/identity/resolve` with query parameters. ChatGPT Work, Claude Code, Gemini, Antigravity and OpenCode must record which adapter actually responded. A disconnected client returns unresolved.

    {"identity_id":"custom.nilo","variant":"reference-sheet","intended_use":"identity reference","channel":"internal","required_approval":"identity"}

Record identity ID and variant alongside asset ID, version, and digest. Three characters can share a sheet. Resolve each character and attach every required anchor before drafting. A new scene needs a separate human comparison against the named character. Composite the exact verified logo file in website, deck, editorial, newsletter and social layouts. Verify the actual compositor input bytes immediately before use. Retry with the saved version and measured input digest. A nonzero CLI exit, unresolved receipt or missing field blocks the identity slot. Export and public release require separate scoped decisions.

## Character resolver (name or alias to identity)

Before an identity slot is drafted, resolve the character by name or alias with `visual.character.resolve` (MCP) or `node bin/vis-character.mjs --name "<name>"`. Set `VIS_CHARACTER_MANIFEST` to the authorised harvest manifest and, optionally, `VIS_CHARACTER_CACHE` to a local content-addressed cache directory. Use only `positive_references`. `rejected_lineages` (including Arcanea Fire and Unity v1/v2) are never positive references. `original` means recovered bytes only. Rights and approval stay `unknown` (vendor guests: `pending`, unofficial). Any `ambiguous`, `not_found`, `unresolved`, missing or conflicting result blocks identity-continuity generation. See `docs/CHARACTER_RESOLVER.md`.
