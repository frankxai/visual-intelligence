# Brand placement strategy

Status: source-grounded recommendations for image selection within existing
products. No website, component, source asset or live social post was changed.
This document does not authorize a homepage redesign or replace a brand contract.

## Authority and current evidence

Use the active product's instruction/brand/canon contracts first, current source
and live behavior as implementation evidence, and VIS exports as discovery aids.
The August `data/brand-visual-dna.json` is a historical registry. It describes
GenCreator as dark glass/cyan and Starlight as a cosmic HUD; those descriptions
conflict with current local contracts. Do not use them as automatic routing rules.

Public homepages were read on 2026-10-16. This was text/source inspection, not a
desktop/mobile rendered visual review. Local source revisions and brand files were
inspected separately; no live deployment-to-commit mapping was verified.

| Brand | Preserve | Proposed visual emphasis | Boundaries |
| --- | --- | --- | --- |
| FrankX | The living studio: architecture, music, books, products, creative work and human presence | Precise, technically warm, authored; specific artwork for each body of work | Preserve homepage breadth and existing components. Arcanea mythology stays on its own branded content surfaces. No generic funnel replacement |
| Arcanea | Connected world creation, persistent lore/characters/rules, sovereignty and canon | Coherent world scenes, character identity and creator-owned artifacts inside restrained product UI | Mythic content does not justify fantasy ornament on every control. Candidate images are not named canon characters without a verified identity |
| GenCreator | Territory B: warm paper/ink, Instrument Serif/Sans, one spot red, human authorship and inspectable artifacts | An authored publication/workbench; source-to-draft-to-review-to-export is visible | No dark glass/cyan reset, generated logo, generic creator desk or fictional product screenshot |
| Starlight | Real, inspectable work and bounded agent/system behavior | Actual mission receipts, system briefs and explicit human decisions | Separate live site evidence from the declared applied `.ai` product contract. No invented deployments, telemetry, customer results or autonomous capability |

Mood is an editorial brief, not an identity inferred from color. Define the feeling
along with the material, light, composition, density, subject and narrative job.
For example, quiet technical authority needs readable evidence and controlled focal
hierarchy; a noisy metallic render alone does not produce it.

## FrankX: place images within the protected studio

Observed page jobs and source: `app/page.tsx` uses
`components/home/HomePageElite.tsx`, including portfolio routing, architecture,
music, creative systems, design experiments, books/library, articles and FRANK-Ω.
The current featured music release is governed by `data/homepage-featured-release.ts`.

| Placement | Image decision | What makes it work | Preservation/review |
| --- | --- | --- | --- |
| First viewport | Keep the current composition and human/studio identity while reviewing any candidate in context | Headline/action stay clear; visual supports the existing breadth | Image investigation only. A section/structural change requires the homepage preservation process |
| AI Architecture section | Review the existing architecture-atelier artwork before replacements; use real diagrams beside technical explanation | A technical reader can connect the image to the system described | Preserve its component, destination and typography; verify crop and alt text |
| Music Lab/featured release | Use the reviewed release cover and associated track identity | Artwork is evidence of actual authored music | Never automatically swap to the newest Suno item; no audible autoplay |
| Creative Systems Lab | A worldbuilding scene can illustrate this explicitly creative section | Fantasy imagery has a named contextual job | Preserve the boundary between a creative experiment and FrankX technical/product proof |
| Design Lab | Curate a related series with deliberate variation in scale/light/subject | The series shows a study or experiment | Avoid a random wall of equally loud images; retain provenance per piece |
| Books/library/articles | Use the actual book cover or article-specific art | Reader recognizes the specific work before reading metadata | Do not replace a work's cover with unrelated impressive art |

Current source candidates include `public/images/home/ai-architecture-atelier-v2.webp`,
`public/images/home/music-lab-studio-v2.webp`, and the reviewed release cover path.
Their presence in source does not establish a new visual review or current live
approval. Preserve them as comparison baselines.

FrankX's `HOMEPAGE-PRESERVATION-CONTRACT.md` governs section changes: current
desktop/mobile captures, preservation matrix, exactly three reviewed directions
and explicit direction approval precede section-level/structural implementation.
This plan keeps those decisions pending and does not rewrite the page's jobs.

## Arcanea: world content with a usable creation layer

The observed live page describes connected world creation. Its portals name world
graphs, canon, godbeasts, sagas, cinema and agent workflows. Local source routes
`apps/web/app/page.tsx` to `apps/web/app/v3/v3-content.tsx`; that relationship does
not establish that the inspected local revision is the live deployment.

| Placement | Image decision | Narrative job | Gate |
| --- | --- | --- | --- |
| Homepage world/portal scene | One coherent establishing scene or current working-product view, depending on the existing slot | Give the creator a place to enter and a clear action | The creation control remains usable on mobile; no art obscures it |
| World/realm card | A scene specific to that world, with a tested small crop | Establish geography, material and mood | Verify canonical/staging status and avoid invented world identity |
| Character/godbeast card | A consistent reference-backed portrait, silhouette and detail crop | Make the same character recognizable across uses | Name, identity, bonded relationship and approved design require canon evidence |
| Creation/proof section | A real connected artifact or world graph with readable excerpts | Show what persists and what the creator can use | Label concept illustrations and previews honestly |
| Saga/cinema/social | A short sequence of establishing shot, subject, detail and creative choice | Build anticipation and continuity across pieces | Preserve source lineage; no accidental renaming or identity drift |

The four inspected fantasy downloads are candidates for a world/character study,
not an assigned Arcanea collection. Their prompts, exact model and edit lineage
are unknown. Do not identify a depicted character as a named Guardian from visual
resemblance. A wide establishing composition can suit a scene slot while a portrait
of related subject matter suits a character story; those are separate decisions.

`.arcanea/lore/CANON_LOCKED.md` is the identity authority. Other taste documents
and current icon/component declarations contain historical disagreements. Resolve
their exact scope with the owning lane before implementation; no token/icon
migration is authorized here.

## GenCreator: the creator's work is the visual subject

Current local `design.md`, `taste.md` and
`docs/brand/GENCREATOR_BRAND_SOCIAL_SYSTEM.md` govern the expression. The homepage
source has an actual `ArtifactProof` instrument and signature sequence. Keep its
real interaction and exports rather than substituting a rendered marketing screen.

| Placement | Image/object decision | Narrative job | Gate |
| --- | --- | --- | --- |
| First viewport | Preserve the working source-to-artifact instrument | Let a visitor inspect and try the actual transformation | No decorative hero render over the product |
| Signature sequence | Real source excerpt, artifact, review marks and approved export | Show where authorship changes the release | Exact text and UI states rendered deterministically |
| Creator case/edition | A source-owned work sample with a deliberate editorial crop | Demonstrate a recognizable point of view | Rights/consent and source attribution recorded |
| Feature/detail explanation | A legible crop of a real capability or an authored diagram | Clarify one mechanism | Do not imply a configured/provider capability that is absent |
| Social carousel | One source, one decision, inspectable proof and a route back to the artifact | Tell a complete authored story | Paper/ink, one spot red, readable crops; human publication gate |

Generated fantasy art can appear as a creator's properly sourced example inside a
case study when relevant. It does not become GenCreator's universal hero identity.
The creator's work may be colorful; the product's warm-paper/ink expression remains
consistent. Avoid recoloring source artwork just to match the interface palette.

## Starlight: evidence and useful participation

The inspected live `.ai` page emphasizes a saved mission, Memory Studio and useful
work. The declared local `starlightintelligence.ai` product contract proposes an
applied system-brief front door. Reconcile deployment ownership/revision before
changing either. Do not silently replace one with the other from this strategy.

| Placement | Image/object decision | Narrative job | Gate |
| --- | --- | --- | --- |
| First viewport/proof | Actual mission or brief output with sources and limitations | Make the method inspectable | Product/mission evidence takes priority over decorative node clouds |
| How it works | Deterministic workflow/authority/evidence diagram | Explain responsibility and next decision | Real states and truthful labels; no simulated live telemetry |
| Vision/about | Clearly labeled concept environment or real founder work | Convey the setting and values | A concept garden is not a physical campus or customer result |
| Social proof story | Source excerpt, reviewer decision, resulting artifact and limit | Show a useful contribution | Exact source, credits and route; no invented performance figures |

## Granular component rules

- Hero: one message, one focal subject and a readable next action. Evaluate the
  actual composition with text; a standalone image rating is insufficient.
- Repeated cards: crop for recognition at the rendered size; keep a consistent
  art-direction family without turning every card into the same generic template.
- Product proof: real UI/data/exports, with private material redacted. Generated
  artwork never supplies factual numbers, testimonial portraits or interface text.
- Backgrounds: low visual density behind reading; provide static/no-image fallback
  and verify actual contrast at each crop.
- Avatars: fixed identity, appropriate consent/reference and recognizable silhouette.
  Do not use different character variants interchangeably without identity review.
- Editorial/OG: exact title/credit rendered in code/design tooling; image composition
  and text hierarchy remain separate. Platform-specific crop inspection is required.
- Motion: name the explanatory purpose. Preserve a useful first frame, complete
  reduced-motion state, stable image dimensions and interruptible controls.

## Decide per placement, then compose the whole page

For each slot, write what the visitor should understand, feel and do. Establish
rights/canon/truth/approval gates before comparing candidates. On inspected images,
compare subject/proof fit, brand fit, focal hierarchy, crop flexibility, detail
quality, distinction from neighboring sections and technical delivery fitness.
Keep the reasons and uncertainty visible. No weighted score can grant publication.

Shortlist a few real choices including the existing asset where relevant. Review
desktop/mobile crop proofs and one contextual composition before selection. Page
rhythm matters: a strong hero does not require every later section to use equally
dramatic art. Alternate establishing images, detail, product proof and quiet text
where they serve the existing page's narrative.

Store brand, route, component/slot, asset/version, source hash, focal point, desktop/
mobile crop, alt-text purpose, proof/rights/approval state, selected/rejected reasons,
reviewer, source revision and verified publication separately. The accompanying
`templates/brand-placement-briefs.json` is an initial set of unselected slot briefs.
It is neither a second asset catalog nor an executable decision/ranking engine.

## One source, different social stories

| Brand | Source | Example sequence | Useful next route |
| --- | --- | --- | --- |
| FrankX | A real build, field note or music release | What I attempted → artifact/detail → constraint or decision → usable method | The matching article, repo, instrument or release |
| Arcanea | One approved world/character creation | Establish the place → reveal subject → show detail → explain a canon/creative choice | That world, story or creation surface |
| GenCreator | An owned source and reviewed artifact | Source → editorial choice → proof/review → signed/exported object | The artifact or working creator instrument |
| Starlight | One inspectable mission/system brief | Question → evidence → agent/human boundary → result and limitation | The actual mission or brief workflow |

These are editorial briefs, not scheduled posts. Adapt the first frame, length,
caption and crop to the channel; preserve the same source lineage and campaign ID.
For GenCreator, use its channel contract's working 4:5 carousel and 9:16 motion
formats, then inspect platform chrome and readable text. These are production
choices, not claims about every platform's current upload limits or reach algorithm.

Avoid counting every resize as a new story. A good sequence reveals different
information. Public posting, founder voice, account access and scheduling follow
the existing content-operations/human gates. Nothing is auto-published by this plan.

## First execution slice

1. FrankX: compare its existing architecture artwork in context and prepare one
   source-grounded social explanation of the same work; preserve the homepage.
2. Arcanea: resolve one real source chat/context packet and canon identity before
   selecting world/portrait images from the downloaded candidates.
3. GenCreator: export a real artifact and use it for one proof detail and one
   editorial social sequence under Territory B.
4. Starlight: reconcile live/source ownership and use one actual mission/brief
   receipt for both a web proof and a social case.

This is an ordered proposal, not four parallel deployments. Each needs an owned
lane, actual assets, review and the applicable approval. The site checkouts were
on foreign branches; Arcanea and GenCreator also had dirty work. No writes were
made there. Source and text inspection do not replace rendered visual QA.

## Sources inspected

- [FrankX homepage](https://www.frankx.ai/) and its local `AGENTS.md`, `design.md`,
  `taste.md`, homepage preservation contract, active homepage and release source.
- [Arcanea homepage](https://www.arcanea.ai/) and its local entry/source, `TASTE.md`
  and `.arcanea/lore/CANON_LOCKED.md`.
- [GenCreator homepage](https://gencreator.ai/) and its local `AGENTS.md`,
  `CLAUDE.md`, identity brief, design/taste, social contract and homepage source.
- [Starlight homepage](https://starlightintelligence.ai/) and the local `.ai`
  product brief, page spec and scene brief. Live-to-local mapping remains unverified.
- Existing content-operations team specification and Premium Web OS asset rules.

Private source hashes and revision/ownership observations belong in session evidence.
Do not copy stale registry claims into public brand contracts to make them agree.
