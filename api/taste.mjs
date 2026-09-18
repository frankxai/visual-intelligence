/**
 * Vercel Serverless Function: Taste Directives Endpoint
 * Returns active aesthetic doctrines, approved patterns, and defect tags to avoid.
 */

const FOUNDATIONAL_DOCTRINES = [
  {
    subject: "Playfair Display & Source Serif 4 accents",
    doctrine: "Playfair Display (--font-serif) for editorial accents/quotes, Source Serif 4 for long-form. Body is Inter, display is Poppins. Max 3 families per surface. Display weight on h1/h2, one font-serif italic accent line. All-caps is near-banned.",
    tags: ["typography", "serif", "playfair", "anti-caps", "premium"],
    brand: "frankx",
    category: "typography",
    polarity: "positive"
  },
  {
    subject: "Fewer words, more weight",
    doctrine: "Hero section <= 10 words. One core idea per section. Never stack marketing adjectives. Ban AI cliches: 'delve', 'tapestry', 'testament', 'beacon', 'unleash', 'supercharge', 'game-changer'.",
    tags: ["copy", "anti-slop", "editorial", "clarity"],
    brand: "frankx",
    category: "copy",
    polarity: "positive"
  },
  {
    subject: "Quiet gradients with subtle grain overlay",
    doctrine: "Gradients must remain quiet (2-3 stops, one hue family, NEVER generic purple-to-blue diagonal). Fine noise grain at 3-7% opacity over gradient and hero image fields. Starlight Liquid glass translucency, depth, and blur.",
    tags: ["visual", "gradients", "grain", "liquid-glass", "surfaces"],
    brand: "frankx",
    category: "visual",
    polarity: "positive"
  },
  {
    subject: "Tech vs Soul color spectrum separation",
    doctrine: "Strict separation between FrankX Tech (emerald #10b981 / cyan #06b6d4 for systems, AI architecture, audits) and FrankX Soul (amber #f59e0b / gold #fbbf24 for editorial, soulbook, consciousness).",
    tags: ["brand", "color-palette", "frankx-tech", "frankx-soul"],
    brand: "frankx",
    category: "visual",
    polarity: "positive"
  },
  {
    subject: "Cosmic Mythos & 10 Gates Elegance",
    doctrine: "Arcanea visual aesthetic is sacred, crystalline, cosmic, and mythic. Vector/SVG first for sigils, symbols, and glyphs. Avoid generic bubblegum anime tropes or oversaturated fantasy tropes. Follow CANON_LOCKED.md palette and frequencies.",
    tags: ["arcanea", "10-gates", "mythic", "crystalline", "canon"],
    brand: "arcanea",
    category: "visual",
    polarity: "positive"
  },
  {
    subject: "Native Antigravity, Nano Banana, Veo first; Higgsfield Banned",
    doctrine: "STRICT MANDATE: Never use Higgsfield MCP or skills. Prioritize Antigravity native generate_image, NanoBanana (nb-image / nb-generate.mjs), and Veo pipelines. Every single image generation must produce a companion .vis.provenance.json sidecar and append to image-generation-ledger.jsonl.",
    tags: ["workflow", "tools", "antigravity", "nanobanana", "provenance", "zero-orphans"],
    brand: "estate",
    category: "workflow",
    polarity: "positive"
  },
  {
    subject: "AI Slop Text & Fake UI Charts",
    doctrine: "Never accept AI-generated hallucinations for text, metrics, graphs, or UI components within an image. Use AI generation for pure artistic background, lighting, and textures; always layer deterministic code (HTML/SVG/Satori/Tailwind) for precise typography, numbers, and UI elements.",
    tags: ["anti-slop", "hybrid-render", "precision", "typography", "ui"],
    brand: "estate",
    category: "visual",
    polarity: "negative"
  }
]

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')

  if (req.method === 'OPTIONS') return res.status(204).end()

  const brand = (req.query.brand || '').toLowerCase()
  const polarity = (req.query.polarity || '').toLowerCase()
  const category = (req.query.category || '').toLowerCase()

  let filtered = FOUNDATIONAL_DOCTRINES
  if (brand) filtered = filtered.filter(d => d.brand === brand || d.brand === 'estate')
  if (polarity) filtered = filtered.filter(d => d.polarity === polarity)
  if (category) filtered = filtered.filter(d => d.category === category)

  const positive = filtered.filter(d => d.polarity === 'positive')
  const negative = filtered.filter(d => d.polarity === 'negative')

  return res.status(200).json({
    ok: true,
    total: filtered.length,
    positive_doctrines: positive,
    negative_doctrines: negative,
    defects_to_avoid: [
      'plastic-skin',
      'hallucinated-text',
      'blurry',
      'bad-hands',
      'generic-slop',
      'composition-off',
      'oversaturated-colors'
    ],
  })
}
