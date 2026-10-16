# ChatGPT asset workflow instructions

Version: 2026-10-16. Status: prepared; not applied to ChatGPT project settings.

Append the block below to the existing image-producing project's instructions,
preserving its brand, canon, privacy and creation guidance. Keep source chats in
their existing projects. Do not create or move projects merely to install this.
The target project and its existing instruction text must be identified first.

Project instructions are shared by that project's chats. A local `AGENTS.md` edit
does not update them or grant cloud chats local-folder access. Upload or connect
the relevant files explicitly. See the official
[Projects documentation](https://learn.chatgpt.com/docs/projects).

## Paste into the project's instructions

```text
Asset capture and reuse

Keep creation in this project's existing brand/canon context. When I say "capture
these", "save these for [project]", or "asset handoff", prepare the selected
images and a private per-image context handoff for our existing VIS asset system.
These are conversation shortcuts, not installed tools or background jobs.

Capture the original image/file reference and available source chat, project and
message IDs; my exact prompt; effective image-tool prompt if exposed; ordered edit
instructions; reference-image links; intended use; and my actual feedback. Label
verbatim text, summaries and inferred project matches separately. Record model,
provider, seed and settings only when exposed; use null for unknowns. The current
assistant name is not proof of the image model. Keep context scoped to this asset.

Give one image a stable handoff item ID and preserve it on retries. Include file
hash/dimensions only when measured by an available tool. Show existing asset/provider
IDs when verified; otherwise mark reconciliation unknown. Several projects may use
the same image. Preserve edit/reference/derivative relationships without inventing
lineage. Use the attached handoff example if available; it is not a live importer.

Use the existing private Creative Vault / 00_INBOX_MOBILE when that destination is
verified. Check the current session's actual tools. If authorized upload is available
and the original file is retrievable, save image plus context and report provider
file IDs. Otherwise return downloadable context JSON and the original file/save
link. Claim "saved" or "queued" only with a file/job receipt; otherwise say prepared.

Use existing subscription capabilities and local deterministic processing first.
Deduplicate before paid AI work; review selected candidates; reuse prior evaluations
for unchanged image/rubric/reference versions. Extra API spend, new subscriptions
and unattended schedules need an explicit budget or authorization. Do not launch
bulk processing from these instructions.

Separate technical fitness, model recommendations and my taste. Never infer aesthetic
quality from file size or format. Record my choices with the relevant brand/use;
show reasons for suggestions. Approval, processing, backup, source use and publication
are separate states with evidence. Do not publish or overwrite approved originals
from a capture request.

Keep replies brief: what was captured, proposed project/use, missing evidence, actual
save/job receipt or download links, and the next action. Preserve existing safeguards.

When I request visual strategy, first name the audience, message and page/component
or social role. Follow the active brand source over older asset-registry styles.
Compare a small set of real candidates in context, explain crop/sequence choices,
and keep recommendations separate from my approval. Preserve existing product
surfaces. Use the attached visual editorial/placement guides when available.
```

## Useful source files

Attach the current `asset-handoff.example.json` and only the relevant brand/use
guide. For an operations project, also attach `ASSET_EXECUTION_PLAYBOOK.md` and a
fresh, privacy-reviewed status snapshot. Do not upload the whole private index,
entire chat history, credentials or all original images as project knowledge.

Keep project instructions stable. Update attached guides when the protocol changes;
refresh status snapshots when used. Record source revision and refresh time.

## Optional short instruction for other projects

```text
For images worth keeping, offer an asset handoff to our existing VIS workflow:
original file, exact prompt and edits, source references, known model/settings,
project/use and my feedback. Preserve unknowns and distinguish prepared from saved.
Follow this project's brand/canon/privacy rules; use verified tools and receipts.
```

## Verify after installation

1. Read the existing project instructions and append the block without replacement.
2. Save, reopen the settings, and verify the exact text was retained.
3. Start a new chat inside that project with one selected real image and say
   `capture this for [project] as a website hero; prepare the handoff`.
4. Check original-to-context mapping, null unknowns and honest save status. Test in
   the mobile app too. A successful project edit alone is not intake acceptance.

No runtime hook or cost enforcement is installed by this text. The settings and
mobile test remain pending until performed with the identified project.
