# Cross-chat Visual Memory and Negative Taste Dataset

Status: proposed engineering contract; source documents discovered in ChatGPT Library on 2026-11-10. **No bulk chat export or image ingestion has occurred.**

## Recovered real evidence

- `Mini-Me-Source-of-Truth-2026-10-09.md` in ChatGPT Library: revision `2026-10-09.4`, 27 identity records, 24 bundled reference images and 18 brand-direction entries; the document reports prior hash verification. This audit did **not** independently rehash those images.
- `Mini-Me-Creative-Reset-2026-10-23.md`: later 14 October correction retains Mini Frank, Nilo, Brio and Riff as an owned ensemble, **withdraws** the earlier Codex/Claude/OpenClaw character assignments. `host.frank`, `custom.nilo`, `custom.brio`, `custom.riff` remain distinct from provider guests.
- `starlight-crew-reference-selection-v1.json`: preferred composition `61171.png`, SHA-256 `fbc92639d098da7e002651c0b431869d128d523c22582a55cadcbd7bc109030f` recorded, but **pending founder approval** and identity QA. Do not use this as a final approved master.
- `FrankX-Image-Review-2026-10-23.html`: existing ~10MB review workbench with rejected/retired assets and review statuses. This is a negative-reference candidate, not a list of globally banned visual properties.
- Existing source pack names: `Mini-Me-Brand-Directions-Pack-2026-10-09.zip`, `Mini-Me-Character-Production-Pack-2026-10-09.zip`, `Mini-Me-Character-Atlas-2026-10-09.html`. Resolve exact files/bytes from authorized Library or private skill before any archive claim.
- ChatGPT saved reference images list returned **zero** on 2026-11-10. This is a separate feature and does not mean ChatGPT Library or other asset stores are empty.

## Source ingestion scope

Sources: ChatGPT Library, selected conversation exports and Images saved originals, existing Drive Creative Vault and Perplexity 03_Characters/04_Projects, Figma, Claude exports where authorized, owned GitHub artwork, R2 and Cloudinary locations. **No universal API for every historical consumer chat image is assumed.** Ingest incrementally with source-specific cursors and explicit consented exports. Preserve original prompts, edits, references and feedback only when exposed.

## Data contract (extend VIS, do not create a parallel DAM)

An asset may have multiple source locations, immutable versions, derivatives and placement links. Record:

- `asset_id`, `version_id`, `content_sha256`, measured MIME/dimensions, byte storage receipt
- source provider, original source ID, chat/message pointer if known, private context sidecar URI
- character identity ID, design family, edition, role; provider/model/harness **separate**
- prompt text and ordered edits when available; provenance confidence; unknown model/seed = null
- review events: human/agent, rubric revision, date, exact version, reason codes and scope
- approval and publication events as **independent**, version-scoped, auditable records
- rights and license state, source/derivative relationships and usage edges
- optional embeddings, perceptual hashes, quality dimensions and taste annotations

## Review state is not storage state

`discovered -> bytes_verified -> archived` is a storage pipeline. Independently, `unreviewed | shortlisted | selected-development | approved-for-scope | rejected-for-scope | retired` is a review decision. Never use a single status to encode both. A rejected artwork remains in a **private negative-reference collection**, searchable for analysis but excluded from default generation reference packs, customer access and public publishing. Retired art is preserved for history, not promoted by model suggestions.

## Negative feedback should be actionable

Store structured reason codes, e.g. `identity-drift`, `wrong-face`, `wrong-silhouette`, `generic-ai-aesthetic`, `text-artifacts`, `bad-anatomy`, `poor-composition`, `mobile-crop-failure`, `brand-mismatch`, `rights-unclear`. Preserve the owner's original language and context. Never infer a permanent universal aesthetic rule from one rejection; feedback scope is brand, use case, character, and exact edition.

## Agent retrieval contract

For Claude Designer, Perplexity, ChatGPT, Codex or future agents:

1. Authenticate to the same VIS tenant and query `get_asset_sources`.
2. Resolve the character via `search_assets` then `get_asset` and `get_asset_preview`, with explicit version and status.
3. Retrieve a **positive reference pack** of selected/approved exact masters and a **negative lesson pack** containing short reason-coded descriptions. Negative image bytes require explicit elevated review scope; never inject rejected images as generation reference by default.
4. Return a design packet with source hashes, brand/design contracts, positive invariants, negative constraints, prompt, review criteria, and publication gate.
5. Save every new generated result as a new candidate/version; record its prompt, model if exposed, cost if observed, and user feedback. Do not overwrite original masters.

Current VIS hosted MCP read operations are locally tested but **not deployed**. A proposed future `get_taste_profile` and `get_negative_examples` endpoint is not implemented. Until then, use authorized, curated read-only JSON packets and explicit links.

## Quality and privacy

Store private originals and review workbenches in private Drive/R2, not public GitHub. GitHub carries schemas, code, prompts, policies and safe manifest projections. Do not train or fine-tune external models on the owner's images or personal chats without explicit opt-in. Test tenant isolation, revoked access, negative-example exclusion, and exact-version approval before exposing customer-facing endpoints.

## First pilot

Take 12 exact assets: 4 accepted or owner-preferred, 4 candidate, 4 rejected/retired. Recover actual image bytes and original comments; record hashes and context; score independently for identity consistency and layout; build a versioned retrieval packet for a single R003 redesign. Compare with a no-memory baseline and record whether identity drift, rework and time-to-usable-output improve. Never invent performance metrics.
