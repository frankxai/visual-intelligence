# VIS — Visual Intelligence Audit

A GitHub Action that runs automated visual health checks on your image assets. Detects placeholders, duplicates, orphaned files, and oversized images — then posts a scored report as a PR comment.

## What it checks

| Check | Severity | Description |
|-------|----------|-------------|
| Placeholders | HIGH | Detects generic placeholder images (`placeholder.png`, `default-hero.png`, etc.) |
| Duplicate heroes | MEDIUM | Finds MDX blog posts where the frontmatter hero image is repeated in the body |
| Oversized files | LOW | Flags images exceeding the configurable size threshold |
| Orphaned images | INFO | Identifies images not referenced in any content or code file |

## Scoring

The health score starts at 100 and deducts points per issue:

- HIGH: -15 points each
- MEDIUM: -5 points each
- LOW: -2 points each
- INFO: tracked but does not affect score

| Score | Rating |
|-------|--------|
| 90-100 | EXCELLENT |
| 70-89 | GOOD |
| 50-69 | NEEDS ATTENTION |
| 0-49 | CRITICAL |

## Usage

Add this workflow to your repo:

```yaml
# .github/workflows/visual-audit.yml
name: Visual Health
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: frankxai/visual-intelligence@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          min-score: 50
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `images-dir` | `public/images` | Path to your images directory (relative to repo root) |
| `max-file-size-kb` | `2000` | Maximum allowed image file size in KB |
| `min-score` | `50` | Minimum health score to pass (0-100). Action fails if score is below this. |
| `comment-on-pr` | `true` | Post audit results as a PR comment |

## Outputs

| Output | Description |
|--------|-------------|
| `score` | Visual health score (0-100) |
| `issues-count` | Total number of issues found |
| `high-count` | Number of HIGH severity issues |

### Using outputs in subsequent steps

```yaml
- uses: frankxai/visual-intelligence@v1
  id: vis
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    min-score: 0  # Don't fail, just report

- run: echo "Visual health score is ${{ steps.vis.outputs.score }}"
```

## Examples

### Strict mode — fail under 80

```yaml
- uses: frankxai/visual-intelligence@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    min-score: 80
```

### Custom images directory

```yaml
- uses: frankxai/visual-intelligence@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    images-dir: assets/img
    max-file-size-kb: 1000
```

### Report only — no failure

```yaml
- uses: frankxai/visual-intelligence@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    min-score: 0
    comment-on-pr: true
```

## How it works

The action is fully self-contained — no dependencies to install. It:

1. Walks your images directory and catalogs every image file (PNG, JPG, JPEG, WebP, GIF, SVG, AVIF)
2. Scans content directories (`content/`, `src/`, `app/`, `pages/`, `components/`, `lib/`, `data/`) for image references
3. Runs four audit checks against the catalog
4. Calculates a weighted health score
5. Posts a formatted PR comment with the results (if enabled)
6. Exits with code 1 if the score is below the threshold

## License

MIT
