# Eagle Parity And Media OS Roadmap

Date: 2026-07-03

This roadmap turns "make VIS as useful as Eagle, but agentic and provenance-native" into buildable product work. It is a capability benchmark, not a plan to copy Eagle's UI, brand, file formats, or proprietary implementation.

## Current Recommendation

Buy Eagle for the current two-laptop designer workflow, and use Google Photos/Drive for phone capture and cloud sync. Keep VIS as the local-first intelligence layer that sees across Eagle, Drive, repo assets, website usage, social/NFT outputs, and Music IS proof folders.

Do not build a full Eagle replacement first. Build the things Eagle, Google Photos, Drive, and Immich do not solve for Frank:

- Provenance from prompt, model, skill, coding agent, thread, and repo.
- `visual://` asset identity and Codex/Claude/Grok curation packets.
- Website route usage, social publication records, NFT/Web3 readiness, rights, approval, and evaluation history.
- Music IS handoff for songs, stems, cover art, Canvas, lyrics, credits, and release gates.
- Product intelligence: what asset performed, where it was published, why it was chosen, and what agents should do next.

## Source Anchors

- Eagle home and feature positioning: https://en.eagle.cool/
- Eagle one-time purchase store: https://en.eagle.cool/store
- Eagle sync docs: https://en.eagle.cool/support/desktop/sync
- Eagle Google Drive sync support: https://en.eagle.cool/support/article/how-to-sync-eagle-library-using-google-drive
- Eagle MCP / Skill announcement: https://en.eagle.cool/blog/post/eagle-plugin-mcp-skill
- Eagle Plugin API item/folder/tag docs: https://developer.eagle.cool/plugin-api/api/item, https://developer.eagle.cool/plugin-api/api/folder, https://developer.eagle.cool/plugin-api/api/tag
- Eagle Web API V2 docs: https://developer.eagle.cool/web-api
- Eagle 5 teaser: https://en.eagle.cool/blog/post/eagle5-teaser
- Immich home: https://immich.app/
- Immich GitHub feature matrix and AGPL license: https://github.com/immich-app/immich

## Capability Matrix

| Capability | Eagle Position | VIS Now | VIS Next | Build / Use |
| --- | --- | --- | --- | --- |
| Fast visual library | Mature desktop grid, previews, folders, tags, filters | Static dashboard grid with filters and detail drawer | PWA/desktop cockpit with persistent state, virtual grid, batch actions | Use Eagle now; build VIS for agentic cockpit |
| Capture/import | Browser extension and desktop imports | Scanner indexes files already on disk | Watch folders, Drive/Eagle import manifests, mobile inbox scan | Use Eagle/Drive first |
| Folders/tags/notes | Core strength | Category/tag inference plus VIS annotations for notes, ratings, color labels, custom tags, and collections | Eagle metadata adapter for folders, tags, notes, source URLs | Adapter, not clone |
| Smart collections | Strong filters/smart folders | Static cockpit smart collections plus saved searches | Saved queries, review boards, inboxes, PWA persistence | Build VIS-specific views |
| Duplicate check | Built-in | SHA-256 duplicate groups | Visual similarity and cross-location merge review | Build graph + optional model adapter |
| AI organization | Eagle AI Search/Action/MCP announced | Rule-based tags, MCP search/trace/packets | Agent run sidecars, semantic search, eval loops, curation packets | Build VIS intelligence; interop with Eagle MCP |
| Local privacy | On-prem library | Local SQLite and ignored runtime data | Path allowlists, redaction, encrypted backups | Build |
| Sync | Eagle recommends third-party sync such as Drive/Dropbox/OneDrive | Local paths only | Drive/OneDrive provider IDs and sync health | Use cloud sync; build metadata awareness |
| Mobile backup | Not Eagle's main role | None | Google Photos/Drive mobile inbox; optional Immich later | Use Google Photos/Drive now; Immich optional |
| Video/audio | Eagle supports broad media library use | VIS indexes image/video/audio | Music producer views, waveforms later, release packets now | Build music intelligence, not DAW |
| Website usage | Not primary | Route usage scanning | Route suitability, derivative generation, PR packet | Build |
| Social publishing | Not primary | Publication records and packets | Postiz adapter and metric import | Use Postiz |
| NFT/Web3 | Not primary | NFT readiness report | Traits, IPFS/R2 locations, rights gates, collection builder | Build reports; use thirdweb/IPFS |
| MCP for agents | Eagle has MCP/Skill direction | VIS has read-first MCP | Expanded tools, write gates, Claude/Codex install checks | Build and interop |

## Product Shape

VIS should become a media intelligence OS, not only a visual DAM. The short product name can stay **VIS** because the buyer promise is visual intelligence, but the internal domain model should say **media asset** everywhere it matters.

Recommended naming:

- Product: Visual Intelligence OS, short **VIS**.
- Technical object: `asset`, with `media_type` image/video/audio and `media_role`.
- Music-specific lane: Music IS remains canonical; VIS provides discovery, provenance, packet handoff, and cross-publishing traceability.
- Future public category: "AI-native media asset intelligence for creators and agentic teams."

## Eagle-Inspired Milestones

### E0: Buy And Bridge

- Buy Eagle once.
- Install on both laptops.
- Put the Eagle library under the Drive creative vault.
- Install browser extension.
- Point VIS scanner at Eagle library, Drive vault, repo estate, and Music IS proof folders.
- Do not write to Eagle from VIS until metadata format and backup behavior are documented.

### E1: VIS Cockpit Parity Slice

- Smart collections for inbox, rights, prompt gaps, website usage, orphans, duplicates, music, video, NFT/Web3, website-ready, social-ready.
- Source and folder navigation.
- Batch packet copy.
- Audio preview and Music IS packet.
- Website/social action packets.
- Local curation memory for notes, tags, ratings, color labels, collections, and saved searches.
- Local similarity review groups exposed in CLI, MCP, dashboard queue, and smart collection.
- Dry-run-first batch curation so selected assets can be tagged, rated, colored, moved into collections, or queued for review without accidental writes.
- Human-gated rights and approval review so website, social, NFT, and Music IS handoffs cannot quietly treat unknown assets as publishable.

### E2: Eagle Adapter

- Read Eagle library metadata safely through `vis eagle --library <path>` or the `import_eagle_library` MCP tool; execute with `--execute` only after dry-run review.
- Map Eagle folders, tags, notes, source URLs, and local assets into VIS locations, annotations, collections, and provenance.
- Keep Eagle optional.
- Avoid copying Eagle proprietary code or mimicking trade dress.
- Future write/edit operations should use Eagle's official Plugin/Web API rather than direct `metadata.json` edits.

### E3: Agentic Advantage

- Every generated asset has sidecar provenance.
- MCP can trace asset to prompt, model, agent, skill, repo, website route, social post, NFT collection, and Music IS proof folder.
- Agents can request curation packets and record dry-run publication manifests.

### E4: Product Beta

- Package VIS as a scanner + local dashboard + MCP.
- Offer paid audit/report and pro local app.
- Hosted/team option only after Frank's daily workflow is stable.

## Immich Role

Immich is strongest as a self-hosted Google Photos-like backup and browsing system for photos/videos. It is useful later if Frank wants sovereignty over camera roll backup and photo search, but it adds server maintenance and AGPL/commercial-license considerations if code is absorbed into a product.

Use Immich as an optional adapter or inspiration source. Do not base VIS product code on Immich unless the license and product distribution model are intentionally designed for it.

## Music Producer Role

VIS should index and trace music assets, but Music IS remains release truth.

VIS owns:

- Audio file discovery.
- Cover art and Canvas linking.
- Prompt/provenance sidecars.
- Website/social/NFT usage traceability.
- Agent curation packets.

Music IS owns:

- Artist/persona canon.
- Release metadata.
- Lyrics, credits, AI disclosure, rights, label status.
- A&R review and release gates.
- Distribution checklist and post-release performance loop.

## Product Risks

| Risk | Decision |
| --- | --- |
| Building Eagle clone slows down revenue | Use Eagle now; build VIS agentic/provenance layers. |
| Copying proprietary UX creates legal/product weakness | Benchmark capabilities only; create original cockpit. |
| Immich server work distracts from creator asset OS | Keep Immich optional until mobile sovereignty becomes urgent. |
| Music workflows get flattened | Preserve Music IS as canonical. |
| Sync conflicts corrupt Eagle library | One active Eagle writer at a time; Drive sync complete before laptop switch. |
| VIS leaks private paths | Keep MCP allowlists and local-only runtime; no public export by default. |

## Success Criteria

- Frank can find an asset in Eagle or VIS, copy a VIS packet, hand it to Codex/Claude, and record where it is used.
- The same image/audio/video across repos, Drive, Eagle, and Music IS resolves to one logical asset with multiple locations.
- Agents can trace prompt, model, skill, run, local path, website route, social post, and publication status without guessing.
- The cockpit exposes daily review queues: rights, prompt gaps, orphans, duplicates, music release assets, website-ready, and social-ready.
- VIS becomes more valuable with every asset decision because it remembers provenance and outcomes.
