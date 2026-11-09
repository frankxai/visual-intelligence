# Workspace asset search

Implemented, locally tested; not deployed. Tracking: [VIS #65](https://github.com/frankxai/visual-intelligence/issues/65).

The creator's job is to recover the right existing visual reference, inspect its exact
version, and reuse it with its recorded provenance. GenCreator remains the public
product and MCP entry point. This module projects existing VIS records; it does not
replace the local library, the CreatorPack, or the platform identity registry.

## Run the complete local acceptance exercise

Use Node >=22.13 and the committed pnpm lockfile:

```sh
pnpm install --frozen-lockfile
pnpm test:catalog
```

This starts real loopback HTTP servers with generated test signing keys, creates
two existing-format VIS SQLite catalogs, initializes MCP, lists and calls tools,
retrieves a small measured PNG preview, and exercises denials. The Postgres migration
is executed in PGlite against synthetic platform tenants/roles. No production
database, R2 bucket or private creator collection is changed. Test tokens and keys
are temporary; nothing authenticates a real customer.

## Implemented tools

| Tool | Result |
| --- | --- |
| `search_assets` | Bounded metadata matches, brand/character/status/aspect filters, identities, coverage and timestamps |
| `get_asset` | Exact version or latest observed version, recorded rights/approval scope, bounded provenance |
| `get_asset_preview` | Existing local thumbnail/preview only, bound to the selected version and enrolled rendition root |
| `get_asset_sources` | Ready, unavailable and unconfigured sources, with recorded index coverage |

No tool changes rights, approves, publishes, scans, connects an account or changes a
workspace. Search is metadata/full text; semantic image similarity is not implemented.
Local legacy approval is explicitly asset-record scoped. Hosted approval is version
scoped and requires its recorded approver and timestamp. Neither is a new human approval.

## Platform path for each user

The gateway verifies the configured issuer's JWT signature, issuer, resource audience,
expiry, issue time and read scope. It resolves the subject through the existing
`principals`, active `tenant_memberships`, and active `tenants` tables on every request.
The tool arguments never contain a tenant, a database path, a credential or a provider
URL. A workspace header selects an existing membership; it cannot grant membership.
New users and teams use the same registry rather than inheriting the founder's catalog.

The hosted adapter discovers sources under the authorized tenant, then includes
`workspace_id` and `source_id` on each query. The migration requires the existing
canonical tenant table. Direct `anon` and `authenticated` table/view reads are denied;
the existing owning service uses its server-side database credential. RLS is enabled
with no permissive client policy. The service credential belongs only in the existing
secret manager/runtime environment, never the package, browser, config JSON or logs.

Apply `migrations/20261105_vis_catalog.sql` to an approved staging database only after
review. It preserves VIS `asset_id`/`version_id`, enforces tenant-qualified foreign keys,
and prevents changing version content in place. It has not been applied to production.
Catalog ingest/sync is a separate write capability; this slice does not populate rows.

## Deployable gateway configuration

`VIS_GATEWAY_CONFIG` names an operator-private JSON file. It contains an `auth` object
with concrete, verified HTTPS `issuer`, `resource` and `jwksUrl` values. It may contain
one `platform` object: the existing Supabase origin, configured `identityProvider`, and
`serviceKeyEnv` naming the already-provisioned server environment variable. Do not put
its value in JSON. Verify the issuer's OAuth/resource-audience flow; a standard login
token for a different audience is intentionally rejected.

For a bounded local beta instead, enroll `workspaces` with an `id`, a list of verified
issuer `subjects`, and `sources` containing `id`, absolute operator `indexPath`, and
absolute `renditionsDir`. These are private operator paths, never tool inputs. Missing
source paths mean not configured; there is no default owner catalog. The CLI re-reads
local memberships per request for revocation; change source enrollment through restart.

```sh
VIS_GATEWAY_CONFIG=/path/to/private-config.json pnpm catalog:serve
```

It binds loopback by default. For a hosted deployment use the existing reviewed ingress,
TLS/client-auth, issuer and secret manager; do not expose a laptop port directly. The
gateway supplies protected-resource metadata and two negotiated MCP protocol versions
(`2025-11-25`, `2025-06-18`), bounded bodies/previews, origin checks and per-principal
rate limits. Distributed abuse controls and actual issuer revocation/rotation behavior
still require staging verification. No OAuth issuer is created by this source.

## GenCreator integration

Inspection of `frankxai/gencreator.ai` confirmed an existing `app/api/mcp/route.ts`,
`requireManagedContext` in `lib/api/managed.ts`, and managed tool registry. Preserve
those as the customer entry point. A server-side integration can construct this catalog
access object after `requireManagedContext`, bind `actorId`/`workspaceId` and its verified
read scope, and dispatch these four tools through that existing endpoint. Keep private
results out of public MCP cache scopes. This PR does not change or deploy that private repo.

The platform tenant registry and GenCreator's current private-alpha actor/workspace
model must be mapped explicitly before production. Do not equate arbitrary actor IDs
with canonical tenant UUIDs. The unavailable generated `registry/projections/AGENT_BRIEF.md`
was not substituted with invented policy; the accepted media-fabric-v3 decision remains
the retrieved storage authority.

## Known release boundaries

Supabase metadata/membership has adapter tests plus executed schema checks; live
Supabase/JWKS/OAuth calls have not been exercised. Hosted R2 previews are deliberately
unavailable until an authorized rendition resolver is enrolled. Existing local
previews are exercised. Library and Cloudinary connections are not silently imported
or mirrored. No background ingestion, billing, analytics collection or publication is
installed. See [public release preparation](release/PUBLIC_RELEASE.md).
