# VIS DAM — agent access, MCP contracts and rollout

**State:** implementation blueprint grounded in `platform/README.md` and `docs/CHATGPT_ASSET_INTAKE.md`; not a deployed service. Updated 2026-11-10.

## Ownership and boundaries

- **VIS** owns canonical asset/version IDs, source references, SHA-256, rights, scoped approval, provenance, locations, relationships, placements and publication receipts.
- **Starlight Living Design** owns character design/identity contracts and visual ancestry. No second DAM.
- **GenCreator** owns customer-facing application and MCP entrypoint, reusing its existing managed context and `app/api/mcp/route.ts`.
- **Cloudflare R2** is the proposed private original-byte archive, not a public browsing API. Keep source hashes and readback verification.
- **Google Drive** is the human-friendly inbox, editorial project workspace, review and explicitly approved exports; **Figma** retains editable design sources; **ChatGPT Space** is a curation desk.
- **Vercel Blob / approved product repository** serves published derivatives; record exact version and verified route. Cloudinary remains optional, not an assumed source.
- **Perplexity Infographic Designer** produces projects and consumes exact VIS references; its Drive `99_System` is a mirror of its own rules and logs, not VIS authority.

## Current implemented capabilities versus missing work

| Surface | Confirmed in repository | Missing before production |
| --- | --- | --- |
| VIS CLI | scan, metadata sidecars, trace/packets, usage and derivative planning | Enroll actual founder image roots, collect coverage receipts |
| VIS catalog MCP | `search_assets`, `get_asset`, `get_asset_preview`, `get_asset_sources`; locally tested | Approved hosted ingress, JWT issuer/JWKS/resource audience, tenant binding, real Supabase staging tests, source enrollment, preview resolver |
| VIS Postgres | migration `migrations/20261105_vis_catalog.sql` tested synthetically | Reviewed staging migration; actual tenant mapping and sync |
| ChatGPT / mobile intake | proposal and read-only coverage audit | Authenticated image+context upload with resumability, deduplication, receipts |
| Drive / R2 | identified folders and private archive policy | Actual binary ingestion with source/readback SHA-256 and retry |
| Perplexity | existing teammate, 5-bot crew, R003 four PNGs + HTML + source/QA | Verified visual review, retrieval skill installation, authenticated VIS MCP connectivity |
| GenCreator | existing managed MCP route | Bind verified VIS catalog tools to managed context without cross-tenant leakage |

## Minimal MCP tool set

**Read-only beta — existing exact tool names**
- `get_asset_sources()`: source readiness, timestamps and coverage. Must be called first.
- `search_assets({query,brand,character,approval_status,aspect,limit})`: scoped metadata search; no claim of visual similarity.
- `get_asset({asset_id,version_id})`: source, rights, scoped approval and lineage; exact schema from current server.
- `get_asset_preview({asset_id,version_id})`: short-lived authorized preview or local enrolled rendition. Hosted R2 preview remains unavailable until configured.

**Proposed future write operations — NOT IMPLEMENTED**
- `submit_asset_intake`: image+private context packet; returns idempotent job and hash receipt.
- `register_derivative`: parent version + recipe + output hash; no automatic approval.
- `submit_review`: QA evidence and recommendation; no promotion.
- `approve_asset_version`: privileged, explicit human confirmation, rights scope and exact hash.
- `prepare_publication` / `record_publication`: separate gated proposal and verified release receipt.
- `get_asset_usage`: exact repository routes, revisions and live URLs, with freshness.

Never expose administrative write tools to general creative agents; no tool should take arbitrary R2 bucket, tenant ID, private URL, database path or secret from model text.

## Agent permission matrix

| Agent | Read scope | Write scope | Explicitly denied |
| --- | --- | --- | --- |
| ChatGPT Visual Director | scoped VIS read, Drive/Figma/Space source | draft brief, feedback, review request | approval/publication without human |
| Perplexity Infographic Designer | approved/reference-scoped VIS read + sources | own Drive `04_Projects` draft, HTML/SVG, source and QA files | rewriting canon, `05_Approved` promotion, direct R2 |
| Codex / Claude Code | scoped VIS read, repository files | PRs and candidate asset manifests | production deploy, private archive exfiltration |
| Starlight Queen / conductor | scoped VIS read + task artifacts | bounded work orders and proposed selections | rights grants, financial/billing changes |
| GenCreator customer workspace | tenant-scoped VIS read | customer-owned drafts through app controls | founder private collections |
| Archivist / ingestion worker | service identity, approved source scopes | original-byte intake and readback checks | approval or public publication |
| Human owner / reviewer | reviewed exact versions and rights | version-scoped approval via privileged UI | implied approval from folder names |

## Rollout gates

**Gate 0 — Source coverage:** inventory Drive 03_Characters and 04_Projects, Space image references, Figma atlas and private Mini Me skill. Create exact source and SHA receipts. No placeholder hashes.

**Gate 1 — Read-only local demo:** `pnpm install --frozen-lockfile && pnpm test:catalog`, then enroll a small authorized VIS catalog and call four MCP tools from a local client. Record real outputs and failure paths.

**Gate 2 — Hosted staging:** approved ingress and OAuth resource/JWKS, scoped Supabase migration, tenant isolation, revocation, denial tests, logs and rate limits. No prod writes.

**Gate 3 — Intake:** one selected original and context sidecar through Drive/mobile, SHA-256 dedup, R2 readback. Mark archived only after hash equality.

**Gate 4 — Perplexity:** connect to the actual authenticated hosted MCP if supported; otherwise give the teammate a read-only, versioned source packet from VIS and keep its existing Drive workflows. Test `get_asset_sources` and an exact preview. Never fake connectivity.

**Gate 5 — Distribution:** connect GenCreator's existing managed MCP endpoint; validate scoped rights, preview and approved derivative use in ChatGPT/Codex/Claude. Record actual deployment/publication evidence.

## One mission, one receipt

```yaml
mission: visual-canon-r003-review
owner: infographic-designer
source_folder: https://drive.google.com/drive/folders/1IxijvLqIC3iFP5M-ksqE_BTYM8LOXfum
source_asset_ids: []
source_hashes_verified: false
mcp_connection_status: not_verified
rights_status: pending
approval_status: candidate
outputs_expected: [four_pngs, editable_html, sources_md, qa_md, independent_review]
publish: false
cost_cap: 0
```

## Acceptance bar

A successful first demo shows the same exact image version in VIS, ChatGPT and Perplexity, with matching source/hash, rights and approval status. A missing connector must return `unavailable`, not a fabricated asset. At least one original is hash-verified in storage; one candidate is rejected from publishing; one approved rendition is delivered only after actual owner approval. Source and publication receipts must be inspectable.
