# ChatGPT screenshot evidence → VIS private R2

Scope: VIS #15 and human gate #41. A private evidence intake adapter, not a new asset database or public delivery system.

## Workflow

One PNG screenshot file (or a URL on the narrowly allowlisted Cloudinary/Firecrawl screenshot host) is inspected, hashed and mapped to the existing VIS content-addressed master key. The default is a dry run. Approval and rights remain unknown; no publication or public URL is granted.

Dry-run command:

    node scripts/chatgpt-evidence-intake.mjs --file /private/evidence.png --source-page https://www.frankx.ai/ --brand frankx --capture-date 2026-10-28

Approved private archival upload, only after the VIS #41 human gate and a reachable authenticated VIS media Worker are established:

    VIS_ENABLE_PUBLISH=1 node scripts/chatgpt-evidence-intake.mjs --file /private/evidence.png --source-page https://www.frankx.ai/ --brand frankx --capture-date 2026-10-28 --execute --out /private/receipt.json

The operator supplies VIS_MEDIA_WORKER_URL, VIS_MEDIA_ADMIN_TOKEN and VIS_MEDIA_PREVIEW_SIGNING_KEY through their existing secret manager. Never place those values in Git, CLI flags, chat or this document. The existing vis-media Worker is private and its public subdomain is disabled. Do not enable a public route to make the test pass.

The code uses the existing core/vis-storage.mjs adapter, not an alternate R2 client. It re-downloads and SHA-256-verifies every master before claiming private_archive_verified, including deduplicated uploads. No rights claim, canonical registry insertion or approved rendition happens automatically. VIS scan and normal review must happen separately.

## Test and security boundaries

    node --check scripts/chatgpt-evidence-intake.mjs
    node --test tests/chatgpt-evidence-intake.test.mjs

The fixtures cover URL allowlisting, redirects, byte limits, PNG dimensions, dry-run behavior, masked signed URL queries, gated writes and corrupted readback. These are unit tests with a mocked adapter; they are not a live R2 upload receipt.

Cloudflare management connector binary transport was measured on 2026-10-29 to mutate a 70-byte test PNG into 83 stored bytes while returning success. The test object was deleted. Do not use the management connector as a binary-upload fallback until a byte-identical retest passes. It can still store JSON manifests.

This slice deliberately does not modify the shared VIS database, publication policy, or existing media Worker routes. Existing issue #41 remains authoritative for human approvals.
