import { test, expect } from '@playwright/test'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { openLibraryDatabase } from '../../core/vis-library.mjs'
import { loadConfig } from '../../core/vis-core.mjs'
import { ingestReviewAsset, initializeReviewWorkspace } from '../../core/vis-review-intake.mjs'
import { applyReviewDecision, initializeReviewLedger, readReview } from '../../core/vis-review.mjs'
import { serveLibrary } from '../../web/vis-library-server.mjs'

const tenant = 'regression-fixture'
let dir, server, url, candidate, reference, privateKey
function instruction(record, revision, action, comment) {
  const now = Math.floor(Date.now()/1000)
  const claims = {protocol:'vis.review/1', audience:record.audience, tenant, actor:'Fixture reviewer', kid:'fixture', asset_id:record.asset_id,
    version:record.version, sha256:record.sha256, revision, action, comment, destination:'', iat:now, exp:now+300, nonce:randomUUID()}
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return {action, comment, destination:'', token:payload + '.' + sign(null,Buffer.from(payload),privateKey).toString('base64url')}
}
// Two generated calibration plates. Offset contours and a duplex swatch make
// the overlay behavior visible without loading private or branded artwork.
async function plate(offset) {
  let contours = ''
  for (let band=0; band<46; band++) {
    const points = Array.from({length:185}, (_,i) => {
      const x=i*3, y=band*4.7+24 + 28*Math.sin(x/87+band*.04+offset) + 16*Math.cos(x/55-band*.06)
      return x.toFixed(1)+','+y.toFixed(1)
    })
    contours += '<polyline points="'+points.join(' ')+'" stroke="'+(band<16?'#bec4a1':band<32?'#80bba7':'#589b9e')+'"/>'
  }
  return sharp(Buffer.from('<svg width="540" height="320" xmlns="http://www.w3.org/2000/svg"><rect width="540" height="320" fill="#173039"/><g fill="none" stroke-width="1.5">'+contours+'</g><g fill="#bbc6bf"><rect x="20" y="286" width="80" height="3"/><rect x="20" y="279" width="2" height="13"/><rect x="98" y="279" width="2" height="13"/></g></svg>')).png().toBuffer()
}
test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-review-browser-'))
  const storageDir = path.join(dir, 'originals')
  fs.mkdirSync(storageDir)
  fs.writeFileSync(path.join(dir,'vis.config.json'), JSON.stringify({indexPath:'data/vis.sqlite',library:{renditionsDir:'data/renditions'}}))
  const db = openLibraryDatabase(dir,loadConfig(dir))
  const keys = generateKeyPairSync('ed25519')
  privateKey = keys.privateKey
  const reviewContext = {tenant,reviewers:{fixture:{kind:'human',actor:'Fixture reviewer',scopes:['comment','delete','recover'],
    publicKey:keys.publicKey.export({type:'spki',format:'pem'})}}}
  try {
    initializeReviewWorkspace(db,tenant)
    initializeReviewLedger(db,reviewContext)
    async function enroll(n, parents) {
      const bytes = await plate(n*.25)
      return ingestReviewAsset(db,{tenant,storageDir,root:dir,actor:'Fixture producer',bytes,manifest:{
        kind:'diagram',source_uri:'urn:fixture:contours:'+n,source_version:'1',title:'Synthetic contour plate '+(n?'B':'A'),
        brand:'Fixture',maker:'Fixture producer',mime_type:'image/png',sha256:createHash('sha256').update(bytes).digest('hex'),parents,
      }})
    }
    reference = await enroll(0,[])
    const {asset_id,version,sha256} = reference
    candidate = await enroll(1,[{asset_id,version,sha256}])
    candidate=readReview(db,reviewContext,candidate.asset_id)
    applyReviewDecision(db, reviewContext, candidate.asset_id, instruction(candidate,0,'comment','Compare the phase shift across the upper contour bands.'))
  } finally {db.close()}
  const oldFlag=process.env.VIS_REVIEW_WORKBENCH
  try {
    process.env.VIS_REVIEW_WORKBENCH='1'
    ;({server,url}=await serveLibrary(dir,{port:0,reviewContext}))
  } finally {
    if (oldFlag===undefined) delete process.env.VIS_REVIEW_WORKBENCH
    else process.env.VIS_REVIEW_WORKBENCH=oldFlag
  }
})
test.afterAll(async () => {
  if (server) await new Promise(resolve=>server.close(resolve))
  if (dir) fs.rmSync(dir,{recursive:true,force:true})
})

test('reviews enrolled renditions, overlays the exact parent, and requires signed recovery',async ({page},info) => {
  await page.goto(url)
  await expect(page.locator('#candidate-caption')).toHaveText('Synthetic contour plate B')
  await expect(page.locator('#reference-caption')).toHaveText('Synthetic contour plate A')
  await expect(page.locator('#reference-image')).toBeVisible()
  await expect(page.locator('#candidate-image')).toBeVisible()
  await expect(page.locator('#events')).toContainText('Compare the phase shift')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const pairedPixels = await page.locator('#stage').screenshot()
  await page.screenshot({path:info.outputPath('comparison.png'),fullPage:true})
  await page.getByRole('button',{name:'Overlay',exact:true}).click()
  await expect(page.locator('#ghost')).toBeVisible()
  await page.locator('#opacity').focus()
  await page.keyboard.press('End')
  await expect(page.locator('#percent')).toHaveText('100%')
  await expect(page.locator('#ghost')).toHaveCSS('opacity','1')
  const referencePixels = await page.locator('#stage.overlaid .canvas').last().screenshot()
  await page.locator('#opacity').fill('0')
  const candidatePixels = await page.locator('#stage.overlaid .canvas').last().screenshot()
  expect(referencePixels.equals(candidatePixels)).toBe(false)
  await page.locator('#opacity').fill('50')
  await page.screenshot({path:info.outputPath('overlay.png'),fullPage:true})
  await page.getByRole('button',{name:'Side by side'}).click()
  expect((await page.locator('#stage').screenshot()).equals(pairedPixels)).toBe(true)
  expect((await page.request.post(url+'api/asset/'+candidate.asset_id+'/rights',{data:{rights:'owned'}})).status()).toBe(404)
  expect((await page.request.get(url+'api/asset/'+candidate.asset_id)).status()).toBe(404)
  const note=instruction(candidate,1,'delete','Synthetic quarantine for recovery verification.')
  expect((await page.request.post(url+'api/review/'+candidate.asset_id+'/decision',{data:note})).status()).toBe(403)
  async function record(payload) {
    await page.locator('#open-decision').click()
    await page.locator('#action').selectOption(payload.action)
    await page.locator('#token').fill(payload.token)
    await page.locator('#submit-decision').click()
    await expect(page.locator('#decision')).toBeHidden()
  }
  await record(note)
  await expect(page.locator('#status')).toHaveText('Quarantined')
  await record(instruction(candidate,2,'recover','Recovered the exact original in the synthetic test.'))
  await expect(page.locator('#status')).toHaveText('Candidate')
  await expect(page.locator('#events')).toContainText('Recovered the exact original')
})
