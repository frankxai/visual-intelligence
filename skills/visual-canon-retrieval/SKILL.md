---
name: visual-canon-retrieval
description: Retrieve exact owned character art before creating cross-platform infographics or Mini Me stories.
---

# Visual canon retrieval — ChatGPT / Perplexity / Codex adapter

Use the existing VIS catalog, not a new character database. This is a portable workflow contract, **not a deployed Perplexity integration**.

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
