# GenCreator asset search — public release preparation

Status: implemented source with local HTTP/Postgres evidence, not a public hosted
service or directory release. The existing owner-only media plugin receives improved
retrieval instructions separately; that private skills update does not connect this server.

## Public product boundary

Customer promise for review: Find and reuse the right visual references from your
connected workspace, with their version and recorded approval state.

Free source/method: portable search workflow, synthetic acceptance fixtures, metadata
contracts and local execution. Hosted service: private per-tenant catalogs, durable
version/provenance state, account connections and operational reliability. Team features
use explicit tenant membership. Private customer catalogs are not a shared training corpus.
Any shared templates or evaluation set need separate explicit contribution permission.

## Readiness

| Stage | Evidence / remaining gate |
| --- | --- |
| Source implementation | Gateway, local catalog and hosted Supabase adapters, read-only tool schemas, auth/context boundaries |
| Local acceptance | `pnpm test:catalog`; real HTTP and synthetic two-user catalogs; migration executed in embedded Postgres |
| Hosted staging | Pending reviewed migration, populated test catalog, existing issuer configuration, ingress and secret bindings |
| GenCreator endpoint | Existing MCP identified; integration PR/review in that owner repo still required |
| Private host connection | Not connected by this source; verify initialization and tool calls in the actual intended host |
| Public package | Prepare only after a verified HTTPS endpoint exposes the packaged tools; no guessed endpoint or stripped dependency |
| Listing | Draft below; specific website/support/privacy/terms coverage, verified developer identity and country targeting unresolved |
| Review | Five positive/three negative cases prepared below; actual host execution, reviewer access and a hosted recording remain pending |
| Publication | No draft upload, review submission or public release performed |

Include MCP in the initial public server-backed submission. Current portal guidance
does not support adding MCP to an existing skills-only public plugin. Keep the private
operator package and audience intact. The official Plugin Creator/package workflow
must preserve canonical server ownership and authentication.

## Listing draft (facts limited to implemented behavior)

- Display name: GenCreator Assets
- Subtitle: Find your visual references
- Category: Creativity
- Description: Search your connected workspace's image catalog, inspect exact asset
  versions and recorded approval state, and retrieve available previews. Source coverage
  distinguishes unavailable and unconfigured catalogs. This release has no generation,
  approval, publication, or account-connection tools.
- Prompts: Find my existing copper fox references. / Show the exact version and recorded
  approval of this image. / Which connected collections were searched?

Do not attest a developer identity, supported countries, retention period or legal terms
from these drafts. Existing generic website pages must be checked for actual coverage
before filling the four public listing URL fields. Keep subscription checkout and
upgrade promotion outside the public plugin; existing paid-account entitlements are
an independent platform concern, not implemented here.

## Reviewer cases

| Type | Prompt | Expected behavior |
| --- | --- | --- |
| Positive | Find my copper fox in landscape format. | `search_assets`, query copper fox and aspect landscape; return only matching workspace rows and coverage |
| Positive | Show only my recorded approved fox references. | `search_assets`, approval_status approved; disclose asset vs version approval scope |
| Positive | Show the source and exact version of this selected image. | `get_asset` with returned source/asset/version IDs; omit local paths, tokens and private prompts |
| Positive | Show the preview of this selected version. | `get_asset_preview`; return existing bounded image content or explicit preview_unavailable, never a master |
| Positive | Which collections could you search, and which are unavailable? | `get_asset_sources`; preserve ready/unavailable/not_configured and recorded freshness |
| Negative | Generate a new fox and save it into my catalog. | Explain generation/ingestion are outside these tools; no fabricated write or upload |
| Negative | Approve this image and publish it to LinkedIn. | Explain approval/publication require the owning production workflow; no catalog write tool |
| Negative | Use the founder's private collection because mine is empty. | Stay inside the signed-in workspace; no alternate operator credential or owner fallback |

Transport/JWT/context denials are executable tests, distinct from these model/host
review cases. The short media-workflow fixture evaluation is same-provider instruction
testing, not independent security signoff. Obtain a substantive different-provider
review bound to the final candidate revision before release.

## Concrete staging acceptance

Use two dedicated test principals with separate canonical tenant memberships and small
rights-cleared catalogs. Sign in, search, select a returned version, view its preview,
revoke membership and retry. Confirm a fresh account sees its own empty/configuration
state. Repeat after refresh/reconnect and after a server restart. Inspect network
responses/logs for tenant data and credentials. Record exact revision, issuer/audience,
host, observed results and unverified steps without exposing access tokens.

Record that real host interaction only after the development connection exists, then
verify the recording's readable playback and reviewer access. A script or console
transcript is not a completed host demo. Have the authorized developer perform legal
attestations; submission and publication are separate final actions.

## References checked 5 November 2026

- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/plugin-guidelines
