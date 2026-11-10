# Mini Me / Starlight Visual Canon — cross-platform reconciliation
Status: **research receipt / proposed integration, not founder-approved**  
Observed: 2026-11-10. Owner: Visual Intelligence OS (VIS). Scope: ChatGPT Space, Perplexity Infographic Designer, Drive, Figma, Starlight Living Design.

## Decision

Do **not** merge the Starlight Queen, its ten house conductors, the earlier Mini Frank companions, and Perplexity's five role robots into a single mascot identity. These are distinct visual lineages. Preserve their original asset IDs and sources; connect them through VIS relationships and a consistent presentation grammar, not appearance substitution.

**Canonical boundaries**
- `frankxai/visual-intelligence`: asset identity, provenance, scoped approvals, placement relationships and retrieval; not an independent replacement character bible.
- `Starlight-Intelligence/starlight-design-intelligence`: character identity contracts, lineage, agent/team visualization, and `playbooks/character-canon-retrieval.md`.
- `frankxai/agentic-ops`: policies and release gates, not the source of image bytes.
- ChatGPT Space **Starlight Visual Studio**: selection and coordination surface, not authoritative registry or full original archive.
- Google Drive **Infographic Designer**: editorial working files, references, poses and explicitly approved exports; not the universal source of approval.
- Figma: editable character and design compositions, not image-hash authority.
- Perplexity Infographic Designer: producer/consumer of versioned manifests and approved assets, not owner of the identity registry.

## Observed source selection

| Class | Exact existing artifact | Status / action |
| --- | --- | --- |
| Starlight Queen | [Queen character desk](https://chatgpt.com/space/page_d2f7772a2d5c81919b6846c37e5120c3) | Identity study with hash-recorded source; **founder selection pending**, do not promote |
| Starlight house conductors | [Ten-house Figma atlas](https://www.figma.com/design/skl1Tjgu8iS7rwg5FZFTNg?node-id=4-2) | Ten documented portraits/folios; identity and product-usage approvals separate |
| Queen website candidate | [Site PR #290](https://github.com/frankxai/starlightintelligence.ai/pull/290) | Candidate/preview only; do not equate with live release |
| Mini Frank and companions | [Character canon retrieval contract](https://github.com/Starlight-Intelligence/starlight-design-intelligence/blob/main/playbooks/character-canon-retrieval.md) | Calls for private `mini-me-storyboard` index + bundled actual image hashes; **not loaded in this audit** |
| Perplexity Infographic Designer | [Drive working folder](https://drive.google.com/drive/folders/1nXZI86unWEpTXoohTgJntxwsRfwzJVtp) | Existing folder system and art studies; do not reset |
| Perplexity original five-bot lineup | [crew-sheet-v1.png](https://drive.google.com/file/d/1Cs3ket19jwtFfpN-QttyGYIXFeTLq9--/view) | Source file exists; **not founder-approved**, do not rename to Nilo/Brio/etc |
| Perplexity role bot poses | [poses folder](https://drive.google.com/drive/folders/1IOGxivcXPGVrB9NAlnSHasUMkHsFHGVu) | Five role poses: coder, gatekeeper, librarian, retry, engine; compare to lineup |
| Perplexity style proposals | [three-direction sample sheet](https://drive.google.com/file/d/1IzYlfoX5AA0Z9Da7EfRTO1WLK7a6Y7BJ/view) and [CSS v0.2](https://drive.google.com/file/d/11yEgLeLJYJHHJ7hZPyvLPwftNdZsc-YE/view) | Clean light / Deep night / Robot Crew are candidates |
| Perplexity approved outputs | [05_Approved](https://drive.google.com/drive/folders/1_-4hvHKyv4tx9-pVUsOE3hYTgnrG6Ua4) | **Empty on 2026-11-10**, do not imply approval |
| Visual Atlas | [Space operating cockpit](https://chatgpt.com/space/page_6ae2c9c5a72081918d751bc40a4d684f) | Existing audit and PR #63 with evidence gates |
| Infographic official partner logos | [Logo sources and restrictions](https://drive.google.com/file/d/1RYcfWFT5-ZEMmIvKK0_sOE-TNFCaq8H8/view) | Third-party artwork; retain as official vendor marks, never owned mascots |

## Perplexity crew observed in Drive README

- **Coder** — mint cube/antenna — agent/OpenCode role
- **Gatekeeper** — indigo capsule/scanner — authentication and rate limits
- **Librarian** — yellow barrel/drawers — caching
- **Retry** — coral ball/spring — retries and fallback
- **Engine** — graphite/ember vents — Workers AI/model role

These are task-illustration **role mascots**, not the same entities as the Mini Me cast, Starlight Queen's house agents, or provider brands. Keep separate IDs. Match individual source pixels and complete licensing before cross-brand adaptation.

## Proposed canonical reconciliation schema

An implementation SHOULD map without replacing the existing VIS schema:

```json
{
  "identity_id": "existing-stable-id-or-pending",
  "lineage": "starlight-house | mini-me-original | infographic-role-crew | vendor-official | arcanea-ip",
  "role_id": "nullable-functional-role",
  "source": {"provider": "space|drive|figma|github|private-skill", "uri": "exact", "revision": null},
  "master": {"sha256": null, "mime": null, "width": null, "height": null},
  "review": {"status": "candidate", "scope": null, "approval_ref": null},
  "rights": {"status": "unknown", "scope": null},
  "relationships": [{"type": "portrays|derives-from|edition-of|used-in", "target_id": "existing-id"}],
  "placements": []
}
```

Null means unverified. Never create a second competing identity database. Use existing `.vis.provenance.json` and adapters, plus versioned extension only if required. Exact hashes, sources and revision-specific approval are mandatory.

## First implementation queue

1. Recover the authorized private `mini-me-storyboard/references/character-canon-index.json`, `character-registry.json`, and referenced real image bytes; verify source hashes before using them. The public retrieval playbook contains no private image bytes.
2. Inspect actual Drive crew-sheet PNG and five poses visually. Compare shapes against 3 proposed style directions and founder-selected examples in Figma/Space. Do not infer approval.
3. Import **references, not copies** into VIS staging manifests: identity, source URI, alias conflicts, rights, exact versions and approval state.
4. Produce a comparison board with named original lineages and 2–3 scene archetypes (technical editorial, small role-bot scene, porcelain cinematic). Do not synthesize a one-look-for-every-brand identity.
5. Add a portable version-pinned `VIS/character-canon retrieval` skill/contract for Perplexity and ChatGPT, which refuses unverified assets and records an intake/retrieval receipt.
6. Run review, exact hash and visual QA. Only founder-approved exact versions go in `05_Approved`. Publication is a separate gated event.

## Operational cautions

The Space previously reported an R2 binary fidelity failure (70-byte test PNG became 83 bytes). Do not claim an archived asset until actual byte-for-byte readback passes. Existing private R2 and publication gate [VIS #41](https://github.com/frankxai/visual-intelligence/issues/41) applies. [VIS intake PR #63](https://github.com/frankxai/visual-intelligence/pull/63) was previously draft; inspect live state before using it. Do not publish, transfer private image bytes into a public repo, or overwrite selected artwork.

This document records a bounded source audit, not an implementation or approval receipt.
