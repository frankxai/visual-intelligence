import test from 'node:test'
import assert from 'node:assert/strict'
import { scanUsageOnly } from '../core/vis-core.mjs'

test('usage scan refuses to delete page links unless replaceUsage is set', () => {
  assert.throws(() => scanUsageOnly({ root: 'C:/missing-vis-root' }), /Refusing to delete usage edges/)
})

test('a full index drops links a page no longer has, and keeps linker references', async () => {
  const fs = (await import('fs')).default
  const os = (await import('os')).default
  const path = (await import('path')).default
  const { indexProject, openVisDatabase } = await import('../core/vis-core.mjs')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-usage-refresh-'))
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2mVxwAAAABJRU5ErkJggg==', 'base64')
  fs.mkdirSync(path.join(root, 'public', 'images'), { recursive: true })
  fs.writeFileSync(path.join(root, 'public', 'images', 'hero.png'), png)
  fs.mkdirSync(path.join(root, 'app'), { recursive: true })
  const page = path.join(root, 'app', 'page.tsx')
  fs.writeFileSync(page, '<img src="/images/hero.png" />')
  fs.writeFileSync(path.join(root, 'app', 'old.tsx'), '<img src="/images/hero.png" />')
  indexProject({ root })
  const count = () => {
    const db = openVisDatabase(root)
    try { return db.prepare('SELECT COUNT(*) AS c FROM asset_usage').get().c } finally { db.close() }
  }
  assert.equal(count(), 2)

  const db = openVisDatabase(root)
  const asset = db.prepare('SELECT asset_id FROM asset').get().asset_id
  db.prepare("INSERT INTO asset_usage (usage_id, asset_id, version_id, source_file, route, usage_context, reference_text, detected_at) VALUES ('manual', ?, NULL, 'elsewhere/site.tsx', '/x', 'reference', '/images/hero.png', 'now')").run(asset)
  db.close()

  fs.writeFileSync(page, '<p>no image any more</p>')
  fs.rmSync(path.join(root, 'app', 'old.tsx'))
  indexProject({ root })
  const db2 = openVisDatabase(root)
  try {
    const rows = db2.prepare('SELECT usage_id, usage_context FROM asset_usage').all()
    assert.deepEqual(rows.map(r => r.usage_id), ['manual'], 'removed and deleted-file links are gone; the linker reference stays')
  } finally { db2.close() }
})
