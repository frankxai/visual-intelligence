import sharp from 'sharp'
import { test, expect } from '@playwright/test'
import { fixture } from '../fixtures/review-workspace.mjs'

test('signed review desk renders real VIS renditions, changes reference and overlays without viewport overflow', async ({
  page,
}, info) => {
  const desk = await fixture()
  try {
    await page.goto(desk.url)
    await expect(page.locator('#title')).toHaveText('Phase contours · candidate')
    await page.locator('#reference').selectOption(desk.reference)
    await expect.poll(() => page.locator('#referenceImage').evaluate((el) => el.naturalWidth)).toBe(760)
    await expect(page.locator('#eligibility')).toHaveText('Use blocked · rights unknown')
    await expect(page.locator('#comparisonLabel')).toContainText('rights unknown')
    await expect(page.locator('#history')).toContainText('second crest')
    await expect(page.locator('#submit')).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    const before = await page.locator('#plates').screenshot()
    await page.getByRole('button', { name: 'Overlay' }).click()
    await expect(page.locator('#mix')).toBeVisible()
    await page.locator('#opacity').focus()
    await page.keyboard.press('ArrowRight')
    expect(await page.locator('#opacity').inputValue()).toBe('51')
    await expect(page.locator('#referencePlate')).toHaveCSS('opacity', '0.51')
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
    await page.evaluate(() => window.scrollTo(0, 0))
    const after = await page.locator('#plates').screenshot()
    const decode = (image) => sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const [original, restored] = await Promise.all([decode(before), decode(after)])
    expect(restored.info).toEqual(original.info)
    // Chromium re-composites the rounded bottom corners after blending.
    let changed = 0
    for (let i = 0; i < original.data.length; i += 3) {
      if ([0, 1, 2].some((k) => Math.abs(original.data[i + k] - restored.data[i + k]) > 5)) changed++
    }
    expect(changed / (original.info.width * original.info.height)).toBeLessThan(0.0001)
    await page.screenshot({ path: info.outputPath('review-desk.png'), fullPage: true })
    for (const [action, state] of [
      ['archive', 'archived'],
      ['restore', 'candidate'],
    ]) {
      const response = await page.request.get(
        desk.url + 'api/review/scope/' + desk.candidate + '?action=' + action,
      )
      const envelope = desk.signScope(await response.json())
      await page
        .locator('#signed')
        .setInputFiles({
          name: 'signed.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(envelope)),
        })
      await page.getByRole('button', { name: 'Record signed decision' }).click()
      await expect(page.locator('#state')).toContainText(
        state + ' · revision ' + (action === 'archive' ? 2 : 3),
      )
    }
  } finally {
    await desk.close()
  }
})
