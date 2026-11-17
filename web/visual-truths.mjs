import { readFileSync } from 'node:fs'

const read = name => JSON.parse(readFileSync(new URL(`../docs/character-canon/${name}`, import.meta.url), 'utf8'))
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

// A read-only projection of existing records, never another approval or asset store.
export function visualTruthGroups(curation = read('character-curation.v1.json')) {
  const groups = [
    ['Original cast and source studies', a => a.asset_id.startsWith('mini-') || a.editorial_bucket === 'supporting_reference'],
    ['Twenty specialist sources and their editions', a => /^SL-C\d/.test(a.asset_id)],
    ['Living Collective scenes', a => a.asset_id.startsWith('SL-ECO-')],
    ['Material families and look development', a => a.asset_id.startsWith('SL-B') || a.asset_id.startsWith('lookdev.')],
    ['Brand-separated characters and directions', a => a.editorial_bucket === 'brand_separated_reference'],
    ['Crew explorations held for review', a => a.asset_id.startsWith('SL-CREW-')],
    ['Vendor references', a => a.editorial_bucket === 'vendor_reference_only'],
  ]
  const result = groups.map(([title]) => ({ title, assets: [] }))
  const other = { title: 'Other sources awaiting classification', assets: [] }
  for (const asset of curation.asset_decisions) {
    const index = groups.findIndex(([, accepts]) => accepts(asset))
    ;(index < 0 ? other : result[index]).assets.push(asset)
  }
  return other.assets.length ? [...result, other] : result
}

export function renderVisualTruths(curation = read('character-curation.v1.json'), receipt = read('figma-ingestion-2026-11-12.json')) {
  const file = /^[a-zA-Z0-9]+$/.test(receipt.figma_file_key || '') ? receipt.figma_file_key : null
  const groups = visualTruthGroups(curation)
  const rows = assets => assets.map(a => {
    const node = /^\d+:\d+$/.test(a.figma_image_node_id || '') ? a.figma_image_node_id.replace(':', '-') : null
    const source = file && node ? `<a href="https://www.figma.com/design/${file}?node-id=${node}" target="_blank" rel="noopener noreferrer">Open source artwork</a>` : 'Source link unavailable'
    return `<li><strong>${escape(a.asset_id)}</strong><span>${escape(a.source_state)} · ${escape(a.editorial_bucket)}</span><p>${escape(a.reason)}</p>${source}<details><summary>Recorded digest and intended use</summary><code>${escape(a.sha256 || 'Unknown')}</code><p>${escape((a.recommended_for || []).join('; '))}</p><p>Avoid: ${escape((a.avoid_for || []).join('; '))}</p></details></li>`
  }).join('')
  return `<section class="visual-truths" id="visual-truths" aria-labelledby="visualTruthsTitle">
    <details><summary id="visualTruthsTitle">Visual truths <span>${curation.asset_decisions.length} source records · full cast and lineage</span></summary>
    <p>Mini Frank, Nilo, Brio and Riff belong alongside the wider character ecosystem. Explore the original sources before selecting an edition for a product.</p>
    <p class="truth-boundary">Source review only. Artwork previews are not loaded here. Recorded hashes are historical evidence, not a fresh verification. Proposed roles, identity approval, rights and live use remain separate.</p>
    <p>Queen studies: <a href="https://www.figma.com/design/skl1Tjgu8iS7rwg5FZFTNg?node-id=3-20" target="_blank" rel="noopener noreferrer">open the separate folio</a>. Moss / memory, Luma / design, Sable / research and Morel / capture remain proposed assignments.</p>
    <div class="truth-groups">${groups.map(g => `<details><summary>${escape(g.title)} <span>${g.assets.length}</span></summary><ul>${rows(g.assets)}</ul></details>`).join('')}</div>
    <p>Next review: exact edition → source bytes → rights and owner selection → rendered placement → deployment receipt. A character never implies a running agent.</p>
    </details>
  </section>`
}

export const visualTruthStyles = `
.visual-truths{margin:0 0 24px;border-block:1px solid var(--border);padding:18px 0;scroll-margin-top:24px}
.visual-truths summary{cursor:pointer;min-height:44px;padding:10px 4px;font-weight:600}
.visual-truths summary span{color:var(--muted);font-size:12px;font-weight:400;margin-left:8px}
.visual-truths p{color:var(--muted);line-height:1.6;max-width:85ch;margin:8px 0 16px}
.visual-truths a,.truth-nav{color:var(--accent);text-underline-offset:4px}
.truth-nav{display:block;padding:12px 0}
.visual-truths a:focus-visible,.visual-truths summary:focus-visible,.truth-nav:focus-visible{outline:2px solid var(--accent);outline-offset:4px}
.truth-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px}
.truth-groups>details{border-top:1px solid var(--border);min-width:0}
.truth-groups ul{list-style:none;padding:0;margin:0}
.truth-groups li{border-top:1px solid var(--border);padding:16px 4px;overflow-wrap:anywhere}
.truth-groups li>strong,.truth-groups li>span{display:block}
.truth-groups li>span{color:var(--muted);font-size:12px;margin-top:6px}
.truth-groups code{font-size:11px;overflow-wrap:anywhere}
@media(max-width:720px){.truth-groups{grid-template-columns:1fr}.visual-truths>details>summary span{display:block;margin:6px 0}}
`
