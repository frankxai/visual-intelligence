# VIS — Visual Intelligence System

**Agentic visual asset management for creators who ship.**

VIS scans, tags, audits, and manages every image across your sites — so you never lose track of assets, ship placeholder images, or duplicate heroes again.

---

## The Problem

Creators using AI image generation (Midjourney, DALL-E, Gemini, Suno covers) accumulate hundreds of images with no systematic management:

- Images scatter across 30+ directories with no searchable index
- Placeholder SVGs ship on flagship pages because nobody noticed
- Blog posts show the same hero image twice (frontmatter + body)
- 7-9MB raw AI outputs bloat your build
- 80%+ of generated images go unused — orphaned assets nobody references

**VIS fixes this with a 6-layer system:**

```
Layer 1: Registry ──── Auto-tagged, searchable image index
Layer 2: Auditor ───── Placeholder, duplicate, orphan, size detection
Layer 3: Brand DNA ─── Canonical visual standards enforcement
Layer 4: Sitemap Map ─ Every page → its images → coverage status
Layer 5: Council ───── 3-perspective quality review before deploy
Layer 6: CLI ────────── vis scan / vis audit / vis report
```

## Quick Start

```bash
# Clone into your project
git clone https://github.com/frankxai/visual-intelligence.git .vis

# Or copy the scripts directly
cp .vis/bin/vis.mjs scripts/
cp .vis/vis.config.json .
cp .vis/templates/brand-visual-dna.json data/

# Initialize
node scripts/vis.mjs init

# Scan all images
node scripts/vis.mjs scan

# Run health audit
node scripts/vis.mjs audit

# Full report
node scripts/vis.mjs report
```

### As an ACOS Plugin

If you use [ACOS](https://frankx.ai/acos) (Agentic Creator OS for Claude Code):

```bash
# Copy the skill
cp -r .vis/.claude/skills/vis/ .claude/skills/vis/

# Copy commands
cp .vis/.claude/commands/vis-*.md .claude/commands/

# Copy scripts
cp .vis/scripts/*.mjs scripts/

# The skill auto-activates on: "image", "visual", "audit", "registry"
# Commands: /vis-scan, /vis-audit, /vis-report
```

## Case Study: FrankX.ai

Built from real need. FrankX.ai had 408 images across 37 directories and 268 pages.

**Before VIS:**
| Metric | Value |
|--------|-------|
| Health Score | 1/100 |
| Placeholder images on flagship posts | 2 |
| Blog posts with duplicate hero | 3 |
| Orphaned images (unreferenced) | 333 (82%) |
| Oversized images (>2MB) | 12 |
| Searchable index | None |

**After VIS:**
| Metric | Value |
|--------|-------|
| Health Score | 51/100 → improving |
| Placeholders replaced | All but 1 (data file reference) |
| Duplicate heroes fixed | All 3 |
| Images indexed with tags | 413 |
| Pages mapped to images | 268 |
| Automated audit | One command |

## Commands

| Command | Description |
|---------|-------------|
| `vis init` | Initialize VIS in your project |
| `vis scan` | Rebuild image registry with auto-tags |
| `vis scan --diff` | Only add new/changed images |
| `vis audit` | Run health audit with score |
| `vis audit --json` | JSON output for CI/CD pipelines |
| `vis report` | Full visual intelligence report |

## Data Files

VIS creates and maintains these JSON files (all git-friendly):

| File | Purpose |
|------|---------|
| `data/visual-registry.json` | Every image tagged with mood, theme, suitability |
| `data/brand-visual-dna.json` | Your brand's visual standards |
| `data/sitemap-image-map.json` | Page-to-image coverage map |
| `vis.config.json` | Configuration |

## Health Score

The audit produces a score from 0-100:

- **90-100**: EXCELLENT — no action needed
- **70-89**: GOOD — minor issues
- **50-69**: NEEDS ATTENTION — several issues to fix
- **0-49**: CRITICAL — immediate action required

**Scoring:** HIGH issues (placeholders) cost 15 points each. MEDIUM (duplicates) cost 5. LOW (oversized) cost 2.

## Configuration

`vis.config.json`:

```json
{
  "imagesDir": "public/images",
  "registryPath": "data/visual-registry.json",
  "maxFileSizeKB": 2000,
  "placeholderImages": ["blog-hero-aurora.svg", "placeholder.png"],
  "skipSuffixes": ["_thumb.jpeg"]
}
```

## Auto-Tags

VIS auto-detects tags from filenames and directories:

| Pattern | Tag |
|---------|-----|
| `music`, `suno`, `audio` | `music` |
| `ai`, `agent`, `claude` | `ai` |
| `hero` | `hero` |
| `diagram`, `architecture` | `technical` |
| `nature`, `forest`, `garden` | `nature` |
| `brand`, `logo` | `brand` |

## Quality Council

VIS includes a 3-perspective review system (defined in `brand-visual-dna.json`):

1. **Brand Guardian** — Does this match your visual DNA?
2. **Conversion Optimizer** — Does this drive user action?
3. **Accessibility Auditor** — Is this inclusive and accessible?

## Requirements

- Node.js 18+
- Works with any web framework (Next.js, Astro, Remix, static sites)
- Zero cloud dependencies
- Optional: `sharp` for image optimization

## Roadmap

- [ ] AI-powered auto-tagging (color extraction via node-vibrant)
- [ ] Perceptual hash duplicate detection (sharp-phash)
- [ ] n8n workflow templates for automated weekly audits
- [ ] Slack/Discord notifications for council review
- [ ] Image optimization pipeline (WebP/AVIF conversion)
- [ ] Multi-site registry sync
- [ ] CI/CD integration (GitHub Actions)

## License

MIT — [Frank Riemer](https://frankx.ai)

## Links

- [Blog: How I Built VIS](https://frankx.ai/blog/visual-intelligence-system-ai-image-management)
- [Research Hub](https://frankx.ai/research/visual-intelligence)
- [ACOS](https://frankx.ai/acos) — The creator OS that includes VIS
