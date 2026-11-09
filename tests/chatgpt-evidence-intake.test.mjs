import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { inspectPng, validateSourceUrl, fetchScreenshot, ingestEvidence, parseArgs } from '../scripts/chatgpt-evidence-intake.mjs'

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64')
const ref={brand:'frankx',captureDate:'2026-10-28',sourcePage:'https://www.frankx.ai/'}

test('valid PNG, dimensions, and allowlisted screenshot hosts',()=>{
  assert.deepEqual(inspectPng(png),{width:1,height:1})
  assert.throws(()=>inspectPng(Buffer.from('invalid')),/PNG signature/)
  assert.equal(validateSourceUrl('https://res.cloudinary.com/alljsqnj/image/upload/v2/a.png').hostname,'res.cloudinary.com')
  assert.throws(()=>validateSourceUrl('https://127.0.0.1/private'),/not allowlisted/)
  assert.throws(()=>validateSourceUrl('http://res.cloudinary.com/alljsqnj/image/upload/a.png'),/HTTPS/)
  assert.throws(()=>validateSourceUrl('https://res.cloudinary.com/other/image/upload/a.png'),/not allowlisted/)
})
test('redirect, oversized body, and invalid PNG rejected',async()=>{
  const u='https://res.cloudinary.com/alljsqnj/image/upload/a.png'
  await assert.rejects(fetchScreenshot(u,async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1'}})),/redirect rejected/)
  await assert.rejects(fetchScreenshot(u,async()=>new Response('x',{headers:{'content-length':'99999999'}})),/byte ceiling/)
  await assert.rejects(fetchScreenshot(u,async()=>new Response('invalid')),/PNG signature/)
})
test('dry-run does not publish, grants no rights, redacts signed query',async()=>{
  const receipt=await ingestEvidence({...ref,url:'https://res.cloudinary.com/alljsqnj/image/upload/a.png?token=secret',fetchImpl:async()=>new Response(png)})
  assert.equal(receipt.status,'dry_run')
  assert.equal(receipt.approval_status,'needs_review')
  assert.equal(receipt.rights_status,'unknown')
  assert.equal(receipt.publication_status,'not_published')
  assert.equal(receipt.destination.bucket,'starlight-media-private')
  assert.equal(receipt.source_media_url.includes('secret'),false)
  assert.equal(receipt.bytes,png.length)
})
test('private write requires gate and verified byte-identical readback',async()=>{
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'vis-intake-test-'))
  const file=path.join(dir,'evidence.png')
  const previous=process.env.VIS_ENABLE_PUBLISH
  try {
    await fsp.writeFile(file,png)
    const storage={putMaster:async()=>({existing:false}),getMaster:async(_sha,dest)=>fsp.writeFile(dest,png)}
    delete process.env.VIS_ENABLE_PUBLISH
    await assert.rejects(ingestEvidence({...ref,file,execute:true,storage}),/VIS_ENABLE_PUBLISH/)
    process.env.VIS_ENABLE_PUBLISH='1'
    const result=await ingestEvidence({...ref,file,execute:true,storage})
    assert.equal(result.status,'private_archive_verified')
    assert.equal(result.result.verified_bytes,png.length)
    await assert.rejects(ingestEvidence({...ref,file,execute:true,storage:{...storage,getMaster:async(_sha,dest)=>fsp.writeFile(dest,'corrupt')}}),/readback mismatch/)
  }finally{
    if(previous===undefined) delete process.env.VIS_ENABLE_PUBLISH
    else process.env.VIS_ENABLE_PUBLISH=previous
    await fsp.rm(dir,{recursive:true,force:true})
  }
})
test('rejects ambiguous inputs and duplicate options',async()=>{
  assert.throws(()=>parseArgs(['--url','a','--url','b']),/Duplicate/)
  await assert.rejects(ingestEvidence({...ref,file:'a',url:'b'}),/exactly one/)
})
