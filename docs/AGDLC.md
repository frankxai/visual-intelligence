# Agentic Development Lifecycle For VIS

## Loop

1. Research standards and integration docs.
2. Define data contract and safety gates.
3. Implement the smallest durable vertical slice.
4. Scan real assets.
5. Inspect dashboard and MCP outputs.
6. Critic pass: design, security, data integrity, agent usability.
7. Iterate and record evidence.

## Agent Contract

Agents should use VIS by URI:

```text
visual://asset/{asset_id}
```

When generating or editing media, agents should write `<asset-name>.vis.provenance.json`:

```json
{
  "schema_version": "1.0.0",
  "generation": {
    "provider": "openai",
    "model": "gpt-image-1",
    "prompt": "Exact prompt",
    "negative_prompt": "Optional",
    "seed": "Optional",
    "settings": {},
    "output_paths": []
  },
  "agent": {
    "coding_agent": "codex|claude|grok|other",
    "repo": "Repository",
    "thread_ref": "Thread or task reference",
    "session_ref": "Optional session reference",
    "metadata": {}
  },
  "skill": {
    "name": "Skill name",
    "metadata": {}
  }
}
```

If the sidecar cannot be written yet, use:

```powershell
node bin\vis.mjs record-generation <asset> --prompt "..." --model gpt-image-1 --provider openai --agent codex --skill imagegen
```

Through MCP, use `record_generation_provenance`. Writes require `VIS_ENABLE_WRITES=1` and `execute: true`.

## Quality Gates

- Security scan before unfamiliar installs/builds.
- `vis scan` after media changes.
- `vis dashboard` for visual inspection.
- MCP smoke test before wiring agents.
- Rights status before public use.
- Human approval before write/publish/mint/delete.

## Design Gate

VIS UI follows the Starlight operational brand:

- Dense but calm dashboard.
- Real assets visible in the first view.
- No decorative effects that hide the work.
- Reduced-motion compatible.
- Copy and trace actions must be obvious and stable.

## Productization Track

- Free: scanner, dashboard export, MCP read tools.
- Pro local: desktop/Tauri wrapper, richer evals, derivative generation, adapters.
- Paid audit: scan a client's repo/assets and deliver readiness report.
- Hosted/team: only after internal use proves the workflow.
