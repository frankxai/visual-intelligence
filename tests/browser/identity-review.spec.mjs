import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serveLibrary } from '../../web/vis-library-server.mjs'

test('a reviewer must verify the original and candidate before approving a placement', async ({page},info) => {
  const root=fs.mkdtempSync(join(tmpdir(),'vis-review-browser-'))
  fs.writeFileSync(join(root,'vis.config.json'),'{}')
  const {server,url}=await serveLibrary(root,{port:0})
  try {
    const project='https://aaaaaaaaaaaaaaaaaaaa.supabase.co'
    const original=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="teal"/></svg>')
    const digest=createHash('sha256').update(original).digest('hex')
    let id='1', action='request_revision'
    await page.route('**/api/identity/reviewer-config',r=>r.fulfill({json:{project,key:'sb_publishable_fixture'}}))
    await page.route(project+'/rest/v1/rpc/*',async route=>{
      const req=route.request()
      if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS'}})
      const headers={'access-control-allow-origin':'*'}
      if(req.url().endsWith('vis_review_history')) {
        return route.fulfill({headers,json:[{decision_id:id,identity_id:'qa-shape',brand:'qa',variant:'circle',intended_use:'test placement',channel:'internal',version_id:'v2',master_version:'v1',sha256:digest,parent_sha256:digest,rights_basis:'test fixture',action,reviewer:'fixture-reviewer',evidence_ref:'QA-1',recorded_at:'2026-11-01',expires_at:'2027-01-01'}]})
      }
      const body=req.postDataJSON()
      expect(body).toEqual({placement:'1',choice:'approve_use',evidence:'QA-2',expected_sha:digest,expected_parent_sha:digest})
      action=body.choice;id='2'
      return route.fulfill({headers,json:id})
    })
    const token='test.'+Buffer.from(JSON.stringify({role:'authenticated',aal:'aal2',iss:project+'/auth/v1'})).toString('base64url')+'.fixture'
    await page.goto(url+'identity-decisions')
    await page.getByLabel('Human access token').fill(token)
    await page.getByLabel('Placement decision ID').fill('1')
    await page.getByRole('button',{name:'Open placement'}).click()
    await expect(page.getByText('Loaded decision 1.')).toBeVisible()
    await page.getByLabel('Action',{exact:true}).selectOption('approve_use')
    await page.getByLabel('Review evidence or reason').fill('QA-2')
    const save=page.getByRole('button',{name:'Record decision'})
    await expect(save).toBeDisabled()
    const image={name:'fixture.svg',mimeType:'image/svg+xml',buffer:original}
    await page.getByLabel('Verify original file').setInputFiles(image)
    await page.getByLabel('Verify placement file').setInputFiles({...image,buffer:Buffer.from('incorrect')})
    await expect(page.getByText('Blocked · different bytes')).toBeVisible()
    await expect(save).toBeDisabled()
    await page.getByLabel('Verify placement file').setInputFiles(image)
    await expect(save).toBeEnabled()
    await info.attach('Placement review with synthetic QA files',{body:await page.screenshot({fullPage:true}),contentType:'image/png'})
    await save.click()
    await expect(page.getByText('Loaded decision 2.')).toBeVisible()
    await expect(page.locator('#history')).toContainText('approve_use')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  } finally {
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})
    fs.rmSync(root,{recursive:true,force:true})
  }
})
