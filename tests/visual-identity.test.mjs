import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serveLibrary } from '../web/vis-library-server.mjs'
const q = { identity_id:'custom.nilo', variant:'reference-sheet', intended_use:'identity reference', channel:'internal', required_approval:'identity' }
test('stdio MCP advertises resolver and refuses when its authority is disconnected', () => {
  const call = (id,method,params) => JSON.stringify({jsonrpc:'2.0',id,method,params})
  const input = [call(1,'tools/list',{}), call(2,'tools/call',{name:'visual.identity.resolve',arguments:q})].join('\n')+'\n'
  const r = spawnSync(process.execPath,['mcp/vis-mcp-server.mjs'],{input,encoding:'utf8',env:{...process.env,VIS_ESTATE_ROOT:''}})
  assert.equal(r.status,0,r.stderr)
  const rows=r.stdout.trim().split('\n').map(JSON.parse)
  assert.ok(rows.find(x=>x.id===1).result.tools.some(t=>t.name==='visual.identity.resolve' && t.inputSchema.required.includes('variant')))
  assert.equal(JSON.parse(rows.find(x=>x.id===2).result.content[0].text).status,'unresolved')
})
test('operator HTTP and CLI both refuse missing or untrusted authority', async t=>{
  const root=mkdtempSync(join(tmpdir(),'vis-identity-'))
  writeFileSync(join(root,'vis.config.json'),'{}')
  const {server,url}=await serveLibrary(root,{port:0})
  t.after(()=>{server.close();rmSync(root,{recursive:true,force:true})})
  assert.match(await (await fetch(url+'identities')).text(),/Registered original/)
  const params=new URLSearchParams({...q,authority_root:'/untrusted'})
  const r=await fetch(url+'api/identity/resolve?'+params)
  assert.equal(r.status,409)
  assert.equal((await r.json()).publish_authorized,false)
  const cli=spawnSync(process.execPath,['bin/vis-identity.mjs'],{input:JSON.stringify(q),encoding:'utf8',env:{...process.env,VIS_ESTATE_ROOT:''}})
  assert.equal(cli.status,3)
})
