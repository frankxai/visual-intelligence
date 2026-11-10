# Visual asset estate — Figma/Drive/VIS division and design review operating model

**Decision (2026-11-10):** Figma is **not** the DAM. Keep the current [Identity Source Map](https://www.figma.com/design/m2wi20fAoCgFOKGXkJJGAm?node-id=20-89) and [Queen/house character folios](https://www.figma.com/design/skl1Tjgu8iS7rwg5FZFTNg?node-id=0-1) as two focused design files. Do not copy all full-resolution art or every agent into a monolithic Figma file.

## Actual Figma state inspected

- Identity file: pages `01 Product screens`, `02 Responsive`, `03 Components`, `04 Character studio`, `05 Decisions and handoff`, `06 Identity & Sprite Source Map`. Page 04 contains conceptual Queen, Pip, Rook and Vela portraits. Page 06 already contains six identity-family cards, an eight-official-Codex plus five-procedural-skins source board, and an eleven-upload gallery with unfilled bitmap placeholders.
- Queen file: one `01 Character folios` page, working studies for Queen, Chartwright, Ignis, Lyra, Ember and other house conductors. These are design proposals, not an inventory of every actual running agent.
- New [Figma estate navigation board](https://www.figma.com/design/m2wi20fAoCgFOKGXkJJGAm?node-id=40-89) created with **six working source-linked cards** (Queen folios, Queen convergence, Mini Me, pet editions, specialists, Perplexity), plus ownership/release boundaries. Screenshot inspected for readable typography and complete layout. Existing character boards untouched.

## Canonical roles

| Layer | Authority | Store |
|---|---|---|
| VIS | stable asset/version IDs, SHA-256, rights, approvals, lineage, placements | VIS catalog; GitHub code/policies |
| Private master storage | original full-resolution bytes, versions, private rejected art | existing R2 private archive after hash-readback; Drive original masters for human operations |
| Figma | editable layouts, components, identity comparisons, approved preview renditions, handoff annotations | two existing focused files; no universal binary dump |
| Notion | identity registry, decision/approval log, owner, review workflow | existing Identity & Sprite Atlas and character proposal gallery |
| ChatGPT Space | recovered historical source references, review and continuity context | existing Visual Studio |
| Perplexity | infographic design, evidence and QA; consumes curated VIS references | existing teammate Drive 04 Projects, 07 Brand Library |

## Minimum agent-facing manifest

`asset_id`, `identity_id`, `edition_id`, `source_uri`, `source_sha256`, `measured_dimensions`, `rights_scope`, `review_status`, `approval_ref`, `preview_uri`, `figma_node_id`, `drive_file_id`, `r2_readback_receipt`, `source_type` and `runtime_agent_id` (nullable). Null means not verified; never infer.

## Highest-quality source selection policy

1. Choose **source-verified original bytes**, not an image in a Figma thumbnail or an AI-generated lookalike.
2. Prefer **older production-ready pet masters** where they have validated state maps and QA over newer resized candidate sheets; compare visual fidelity and version metadata, never blindly overwrite.
3. Queen face selection is **not finished**: compare Q00 full-size master, Queen folios, Pearl Sovereign, Academy Sovereign, Human Architect, Living Starlight and Perplexity's latest original concepts. Pearl is recommended candidate only.
4. Record independent expression/profile/64px tests, pet motion, transparency and brand continuity. One version-specific owner approval; publication is separate.
5. Keep rejected/retired artwork privately searchable for negative lessons, but exclude its image bytes from default generation references.
6. Keep vendor-owned Codex and Claude characters separate from first-party Mini Me, Queen and pet forms. Similar names are not lineage evidence.

## Blocking integration tests

- The [prepared Drive master folder](https://drive.google.com/drive/folders/1SX8XrCJiSzZlDG39-z5-uxUjDUrYh-O9) was **empty** on 2026-11-10. ChatGPT Library source files were preserved, but the Google Drive upload connector rejected their file references. No original Drive binary transfer verified.
- The Figma eleven-source gallery contains metadata and **unfilled image slots**. The Figma tool generated one-time binary upload URLs but the chat tool cannot POST raw bytes. Do not claim the previews are populated.
- Cloudflare `vis-media` Worker and media buckets exist, but no verified authenticated hosted VIS MCP with source access and tenant isolation has been demonstrated.
- The Perplexity teammate has a [source kit](https://docs.google.com/document/d/1Kc7PTD86IrPccLldczzVKMyRJmdYuFwjaIdUdNPFJdU/edit), but its actual ingestion/skill adoption is not verified through the read-only browser. Its source work and botanical art direction should be independently compared, not reset.

## Safe completion sequence

A. Retrieve actual Q00 and new Queen source images, score with exact pixels and prior approved/reference studies.
B. In a POST-capable authenticated session, upload original PNGs to the **existing** Drive master folder, read back bytes and compare SHA-256; archive to existing R2 only after security/human gates.
C. Generate *small verified derivatives* for Figma cards and fill existing preview placeholders. Maintain immutable master hashes in VIS.
D. Verify hosted VIS read-only MCP (issuer/JWKS, tenant isolation, source readiness and exact preview) and connect ChatGPT/Claude/Perplexity where supported. Fallback to versioned read-only source packets.
E. Approve the exact Queen master and selected character editions only after owner review, then publish a versioned brand/agent reference pack.

**No duplicate DAM, automatic production merge, unverified release or new provider spending.**
