import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import { indexProject, openVisDatabase } from '../../core/vis-core.mjs'
import { serveDashboard } from '../../web/vis-dashboard.mjs'

// Deliberately synthetic diagrams. Never load a workstation index or media root.
const test = base.extend({
  desk: async ({}, use) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-browser-sample-'))
    const images = path.join(root, 'public', 'images')
    fs.mkdirSync(images, { recursive: true })
    let served
    try {
      for (const [name, color] of [['copper-study', '#bf704a'], ['blue-study', '#5487a8'], ['green-study', '#63866b'], ['missing-study', '#888888']]) {
        fs.writeFileSync(path.join(images, name + '.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#17202a"/><circle cx="400" cy="260" r="170" fill="${color}"/><text x="40" y="550" fill="white" font-size="28">Synthetic sample: ${name}</text></svg>`)
      }
      indexProject({ root })
      const db = openVisDatabase(root)
      const assets = db.prepare('SELECT asset_id, primary_path FROM asset').all()
      const idFor = name => assets.find(a => a.primary_path.includes(name)).asset_id
      const copper = idFor('copper-study')
      const blue = idFor('blue-study')
      const missing = idFor('missing-study')
      const ts = '2026-10-01T00:00:00Z'
      db.prepare('INSERT INTO prompt (prompt_id, asset_id, prompt_text, created_at) VALUES (?, ?, ?, ?)').run('sample-prompt', copper, 'A synthetic copper circle for interface testing.', ts)
      db.prepare('INSERT INTO prompt (prompt_id, asset_id, prompt_text, created_at) VALUES (?, ?, ?, ?)').run('blank-prompt', blue, '   ', ts)
      db.prepare(`INSERT INTO publication (publication_id, asset_id, platform, status, url, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run('planned-only', copper, 'website', 'planned', 'https://example.invalid/planned-only', ts)
      db.close()
      fs.unlinkSync(path.join(images, 'missing-study.svg'))
      served = await serveDashboard(root, { port: 0, limit: 10, readOnly: true, verifyLocations: true })
      await use({ url: served.url, copper, blue, missing })
    } finally {
      if (served) await new Promise(resolve => served.server.close(resolve))
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
})

test.afterEach(async ({ page }, info) => {
  const file = info.outputPath('interface.png')
  await page.screenshot({ path: file })
  await info.attach('Interface', { path: file, contentType: 'image/png' })
})

test('contact sheet loads without runtime errors or horizontal overflow', async ({ page, desk }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(desk.url)
  await expect(page.locator('#grid .asset')).toHaveCount(4)
  await expect(page.locator('#catalogueFreshness')).toContainText('Read-only snapshot')
  await expect(page.locator(`.asset-open[data-id="${desk.copper}"] img`)).toHaveJSProperty('naturalWidth', 800)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const firstAsset = await page.locator('#grid .asset').first().boundingBox()
  expect(firstAsset.y).toBeLessThan(page.viewportSize().height - 80)
  expect(errors).toEqual([])
})

test('evidence filters and multiword search export the matching inventory', async ({ page, desk }) => {
  await page.goto(desk.url)
  const filters = page.getByRole('group', {name:'Filter by recorded evidence'})
  await filters.getByRole('button', { name: /Prompt gaps/ }).click()
  await expect(page.locator('#grid .asset')).toHaveCount(3)
  await filters.getByRole('button', { name: /File present/ }).click()
  await expect(page.locator('#grid .asset')).toHaveCount(3)
  await filters.getByRole('button', { name: /All in snapshot/ }).click()
  await page.locator('#search').fill('copper study')
  await expect(page.locator('#grid .asset')).toHaveCount(1)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download inventory', exact: true }).click()
  const download = await downloadEvent
  const inventory = JSON.parse(fs.readFileSync(await download.path(), 'utf8'))
  expect(inventory.assets).toHaveLength(1)
  expect(inventory.assets[0].asset_id).toBe(desk.copper)
  expect(inventory.assets[0].publication_records).toBe(1)
  expect(inventory.caveat).toContain('planned')
})

test('keyboard review keeps focus in the inspector and preserves native copy', async ({ page, desk }, info) => {
  await page.goto(desk.url)
  const opener = page.locator(`.asset-open[data-id="${desk.copper}"]`)
  await opener.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#closeDrawer')).toBeFocused()
  await expect(page.locator('.shell')).toHaveJSProperty('inert', true)
  expect(await page.locator('#drawer').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s')
  await page.keyboard.press('Shift+Tab')
  expect(await page.locator('#drawer').evaluate(el => el.contains(document.activeElement))).toBe(true)
  const copyPreserved = await page.locator('#closeDrawer').evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', {key:'c', ctrlKey:true, bubbles:true, cancelable:true})))
  expect(copyPreserved).toBe(true)
  await page.keyboard.press('a')
  await expect(page.locator('#btnApprove')).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(opener).toBeFocused()
  await expect(page.locator('#drawer')).toHaveJSProperty('inert', true)
  await expect(page.locator('.shell')).toHaveJSProperty('inert', false)
  if (info.project.name === 'reduced-motion') {
    await opener.click()
    expect(await page.locator('#drawer').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s')
  }
})

test('missing previews and rapid reversal leave the inspector usable', async ({ page, desk }, info) => {
  await page.goto(desk.url)
  const opener = page.locator(`.asset-open[data-id="${desk.missing}"]`)
  if (info.project.use.hasTouch) await opener.tap()
  else await opener.click()
  await expect(page.locator('#drawer .media-unavailable')).toBeVisible()
  await expect(page.locator('#drawer .media-unavailable')).toContainText('Preview unavailable')
  await expect(page.locator('#drawerBody')).toContainText('missing')
  await page.keyboard.press('Escape')
  const opening = await page.evaluate(async id => {
    const tile = document.querySelector('.asset-open[data-id="' + id + '"]')
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
    tile.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))
    tile.click()
    await frame()
    await frame()
    const drawer = document.getElementById('drawer')
    const duration = getComputedStyle(drawer).transitionDuration
    const transitioning = drawer.getAnimations().some(animation => animation.playState === 'running')
    document.getElementById('closeDrawer').click()
    await frame()
    tile.click()
    return {duration, transitioning}
  }, desk.copper)
  if (info.project.name === 'reduced-motion') {
    expect(opening.duration).toBe('0s')
    expect(opening.transitioning).toBe(false)
  } else {
    expect(parseFloat(opening.duration)).toBeGreaterThan(0)
    expect(opening.transitioning).toBe(true)
  }
  await expect(page.locator('#drawer')).toHaveAttribute('aria-hidden', 'false')
  await expect(page.locator('#drawer')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await expect(page.locator('#closeDrawer')).toBeFocused()
  await expect(page.locator('.shell')).toHaveJSProperty('inert', true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
