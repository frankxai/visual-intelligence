# Visual truths and the central site

Decision, 17 November 2026: make the existing VIS interface the internal entry point for character sources, editions and placement review. Keep First Light as its editable product/character design workspace. The public Starlight site should show selected, useful applications of the cast, while private review stays authenticated. This is one asset system with different views, not another DAM or a new brand.

## What is established

- The 12 November Figma receipt covers 121 source assets and 34 filled character components. This update reads those records; it does not rehash the original image bytes.
- The recovered set includes the Mini Frank/Nilo/Brio/Riff anchors, twenty original specialists, twenty V2 sheets, thirty Living Collective scenes, family directions, held crew studies, look development and brand-separated Anime Legends sources. Queen retains a separate folio and unresolved edition selection.
- The selected First Light file exposes 19 pages, including original archive, character curation, foundations, activation proposals and application kit. None was marked ready for development in the observed page UI. Page existence is not visual acceptance.
- Cloudflare inventory confirms `starlight-media-private`, `starlight-media-archive` and `starlight-media-public`. No object inventory, master hash verification or bucket write was performed.
- Vercel's `starlight-first-light-staging` project reports `live: false`, `latestDeployment: null` and no domains. It is an empty staging project, not a functioning central website. A project-name search for `visual` returned no projects in the queried scope; this is not proof that no VIS deployment exists elsewhere.

## Interface composition

The estate configuration opts in with `characterSourceReview: "frank-estate"`; unrelated VIS projects omit this fixed estate projection. The current change adds a first-level “Visual truths” link and an expandable, read-only source view above the existing asset library. It derives seven collections directly from the current curation records, exposes exact Figma source links and recorded digests, and keeps unknown preview/approval states visible. It neither embeds private originals nor turns proposed roles into runtime identities.

The next visual iteration should replace the link-only rows with authenticated genuine thumbnails and side-by-side editions once the existing catalog gateway supplies them. Use a compact contact sheet and a persistent inspector. The primary actions are **inspect source**, **compare editions**, **propose placement** and **review changes**. A reviewer should reach the original, proposed site crop and current live use without switching registries.

Public site navigation should connect the product demonstration, characters at work and usable kits. Each character appears beside a real user task and output. Mini Frank is the founder/editorial host; the broader specialist family remains available for deliberate selection. Do not make the home page a twenty-character directory. Keep a dedicated full-cast exploration view, with identity and role proposal labels, separate from the first task.

## Ownership and layers

| Layer | Existing owner | Required connection |
|---|---|---|
| Original binaries | Private R2 media lake; Drive recovery/intake | Exact object/version and measured digest; no bucket-name guess or silent migration |
| Asset, rendition, rights, provenance | VIS; hosted metadata through the accepted Supabase adapter | Existing asset/version IDs and scoped access; preserve local offline catalog |
| Identity and visual rules | Original source sheets; design-intelligence brand packs | Character, edition, role proposal and brand recorded separately |
| Editable design | First Light and separate Queen Figma folios | Actual node-to-source references; preserve exploration/history |
| Site components | Owning product GitHub repository | Exact route/component/rendition reference and desktop/mobile crop |
| Delivery | Vercel deployment and image delivery | Commit → deployment → domain → tested route; prior Blob renditions remain valid |
| Learning and change impact | VIS feedback/placement records and existing GitHub issues | Trace a correction to affected placements; retain rejects outside default selection |

The accepted media-fabric v3 decision in VIS AGENTS.md governs storage. The design-intelligence content-asset playbook still describes an older Blob-first default. Do not migrate on that older guidance. Its useful content-to-screen relationship model can still be consumed without changing binary ownership.

## Bounded execution sequence

| Order | Deliverable | Owner and completion evidence |
|---|---|---|
| 1 | Full source discovery in existing VIS UI | This PR under #77; record grouping, safe links and unchanged source states verified by tests |
| 2 | Authenticated thumbnail and edition comparison | Existing #68/#69/#76; one real master and preview read back with digest, tenant denial and lineage preserved |
| 3 | One First Light product slice | Owning Starlight product repo; source-linked Figma frame, actual component, three relevant candidates, quiet mode and two viewport captures |
| 4 | Protected staging | Existing Vercel project; exact commit/deployment and authenticated route evidence, without exposing the private catalog |
| 5 | Public selected application | Exact-version rights/selection, independent visual review, actual domain checks and rollback receipt |
| 6 | Expand by demonstrated utility | Add casts/roles only against a concrete learning, research, creation or community task; measure completed tasks and reuse |

Do not create duplicate trackers: #77 owns source/Figma continuity; #76 owns private source intake; #68 owns hosted gateway proof; agentic-ops #585 owns cinematic continuity. PR #80 adds capture provenance and PR #81 proposes the Flow lifecycle/cockpit. Consume their accepted records after review, rather than replacing this interface or treating proposed R2 endpoints, quality scores or staged placement maps as production receipts. #81 currently contains a default `starlight-media-lake` bucket and workers.dev URL not established by this inventory; resolve against actual configuration before execution.

## Acceptance and limits

A meaningful release proves one source → exact edition → useful on-site task → recorded placement. A QA score cannot establish rights, identity approval or successful deployment. This change does not approve identities, assign agent capabilities, upload originals, launch processing jobs, edit Figma artwork or deploy a website. The link-only review UI is an interim source-navigation improvement, not the final visual gallery.
