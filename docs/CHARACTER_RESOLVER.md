# Character resolver

Read-only resolver from a character name or alias to an immutable identity ID, with sha256 editions, positive references, rejected lineages, source locators, and missing or conflicting references (issue #91). It sets no rights or approval, writes no R2, and publishes nothing (issue #41 gates).

## Configuration

| Variable | Purpose |
| --- | --- |
| `VIS_CHARACTER_MANIFEST` | Path to the authorised harvest manifest (JSON array, an object with `rows`, `records` or `items`, or JSONL; the harvest manifest uses `items` beside metadata keys). Never committed. |
| `VIS_CHARACTER_CACHE` | Optional directory for the content-addressed cache (`<aa>/<sha256>`). `core/character-cache.mjs` `ensureCached` fetches only on a miss and verifies the hash before storing. |

Manifest fields: `identity_name, aliases, stable_id, edition, file_name, sha256, width, height, drive_file_id, status (original|proposal|rejected|not accessible), family, depicted_characters, duplicate_sha256_group, source_type`. Optional locators `figma_node_id` and `r2_key` are passed through when present. The repo ships only a synthetic fixture, `tests/fixtures/character-manifest.synthetic.json`.

## Rules

- `original` is recovered bytes only, never rights or canon approval. `rights` and `approval` are always `unknown`; manifest values are ignored.
- Rows in Arcanea Fire or Unity v1/v2 lineages are `rejected_lineages`, whatever their status. A sha256 shared with a rejected lineage is withheld from positives and reported as a conflict.
  Lineage text (family, edition, identity name, stable id and file name, joined) goes through `normaliseLineageText`, which splits camelCase boundaries, lowercases, turns every run of non-alphanumeric characters into one space and trims. Token patterns such as `arcanea fire` and `unity v1`/`v2` are then matched on word boundaries, so separator forms (`.`, `/`, `_`, `-`, parentheses, camelCase) are covered by one rule and near-miss words like `Firefly` or `v10` stay positive.
- Matching is exact on normalized name or alias. Near-identical aliases (one edit apart) are reported as `confusable_alias_not_merged` and never merged. An alias shared by two identities returns `ambiguous`.
- Vendor guests (Clawd, Claude, Codex pets, GitHub Mona) resolve with `class: "vendor-guest"`, `unofficial: true`, `rights: "pending"`.
- Exit code 3 and a non-`resolved` status block the identity slot.

## CLI example

```
VIS_CHARACTER_MANIFEST=tests/fixtures/character-manifest.synthetic.json \
  node bin/vis-character.mjs --name "Tfx"
```

Returns `status: "resolved"`, `identity_id: "test.char.fox"`, `matched_alias: "Tfx"`, one positive reference (edition `v1`, with `sha256` and `locators.drive_file_id`), two rejected lineages, and one `not_accessible` missing reference.

## MCP example

```
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"visual.character.resolve","arguments":{"name":"Test Fox"}}}' \
  | VIS_CHARACTER_MANIFEST=tests/fixtures/character-manifest.synthetic.json node mcp/vis-mcp-server.mjs
```

The tool is listed by `tools/list` as `visual.character.resolve`.
