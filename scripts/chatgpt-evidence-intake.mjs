#!/usr/bin/env node
/** Private evidence screenshot intake. Extends the existing VIS Worker adapter. */
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const MAX_BYTES=15*1024*1024
const PNG=Buffer.from([137,80,78,71,13,10,26,10])
const SHA=/^[a-f0-9]{64}$/
const BRAND=/^[a-z][a-z0-9-]{0,63}$/

export function validateSourceUrl(value) {
  const u=new URL(value)
  if(u.protocol!=='https:'||u.username||u.password) throw new Error('HTTPS screenshot URL required')
  const cloudinary=u.hostname==='res.cloudinary.com'&&u.pathname.startsWith('/alljsqnj/image/upload/')
  const firecrawl=u.hostname==='storage.googleapis.com'&&u.pathname.startsWith('/firecrawl-scrape-media/screenshot-')
  if(!cloudinary&&!firecrawl) throw new Error('Screenshot URL host/path not allowlisted')
  if(u.port&&u.port!=='443') throw new Error('Nonstandard port prohibited')
  return u
}
export function inspectPng(data) {
  if(data.length<33||data.length>MAX_BYTES||!data.subarray(0,8).equals(PNG)) throw new Error('PNG signature/size rejected')
  if(data.readUInt32BE(8)!==13||data.toString('ascii',12,16)!=='IHDR') throw new Error('PNG header rejected')
  const width=data.readUInt32BE(16),height=data.readUInt32BE(20)
  if(!width||!height||width>30000||height>30000) throw new Error('PNG dimensions rejected')
  return {width,height}
}
export async function fetchScreenshot(value,fetchImpl=fetch) {
  const u=validateSourceUrl(value)
  const response=await fetchImpl(u,{redirect:'manual',signal:AbortSignal.timeout(30000)})
  if(response.status>=300&&response.status<400) throw new Error('Screenshot redirect rejected')
  if(!response.ok||!response.body) throw new Error('Screenshot fetch failed ('+response.status+')')
  const length=Number(response.headers.get('content-length'))
  if(Number.isFinite(length)&&length>MAX_BYTES) throw new Error('Screenshot exceeds byte ceiling')
  const chunks=[]
  let bytes=0
  for await(const chunk of response.body){
    bytes+=chunk.byteLength
    if(bytes>MAX_BYTES) throw new Error('Screenshot exceeds byte ceiling')
    chunks.push(Buffer.from(chunk))
  }
  const data=Buffer.concat(chunks)
  inspectPng(data)
  return data
}
export async function ingestEvidence({file,url,sourcePage,brand,captureDate,execute=false,storage,fetchImpl=fetch}) {
  if(Boolean(file)===Boolean(url)) throw new Error('Supply exactly one of file or url')
  if(!BRAND.test(brand||'')) throw new Error('Invalid brand ID')
  const page=new URL(sourcePage)
  if(page.protocol!=='https:'||page.username||page.password) throw new Error('Source page must use HTTPS')
  if(!/^\d{4}-\d{2}-\d{2}$/.test(captureDate)||Number.isNaN(Date.parse(captureDate+'T00:00:00Z'))) throw new Error('Invalid capture date')
  if(file&&(await fsp.stat(file)).size>MAX_BYTES) throw new Error('Local screenshot exceeds byte ceiling')
  const data=file?await fsp.readFile(file):await fetchScreenshot(url,fetchImpl)
  const dimensions=inspectPng(data)
  const sha256=crypto.createHash('sha256').update(data).digest('hex')
  if(!SHA.test(sha256)) throw new Error('Invalid SHA-256')
  const key='masters/'+sha256.slice(0,2)+'/'+sha256
  const sourceRef=url?validateSourceUrl(url):null
  if(sourceRef) sourceRef.search='' // Never copy expiring/signed URL query to receipts.
  const receipt={
    schema_version:'vis.website-evidence-intake.v1',status:'dry_run',
    brand_id:brand,source_page:page.origin+page.pathname,capture_date:captureDate,
    source_file:file?path.basename(file):null,source_media_url:sourceRef?sourceRef.toString():null,
    sha256,bytes:data.length,mime_type:'image/png',...dimensions,
    rights_status:'unknown',approval_status:'needs_review',
    destination:{provider:'cloudflare-r2',bucket:'starlight-media-private',key,access:'private'},
    publication_status:'not_published',
  }
  if(!execute) return receipt
  if(process.env.VIS_ENABLE_PUBLISH!=='1') throw new Error('VIS_ENABLE_PUBLISH=1 and --execute required for private R2 writes')
  if(!storage?.putMaster||!storage?.getMaster) throw new Error('Existing VIS storage adapter required')
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'vis-capture-'))
  try {
    const sourcePath=path.join(dir,'capture.png'),verifyPath=path.join(dir,'verified.png')
    await fsp.writeFile(sourcePath,data,{flag:'wx',mode:0o600})
    const result=await storage.putMaster(sha256,sourcePath)
    await storage.getMaster(sha256,verifyPath)
    const remote=await fsp.readFile(verifyPath)
    if(remote.length!==data.length||crypto.createHash('sha256').update(remote).digest('hex')!==sha256) throw new Error('R2 readback mismatch; not archived')
    return {...receipt,status:'private_archive_verified',result:{existing:Boolean(result?.existing),verified_bytes:remote.length},verified_at:new Date().toISOString()}
  } finally {await fsp.rm(dir,{recursive:true,force:true})}
}
export function parseArgs(args) {
  const a={},bool=new Set(['--execute','--help'])
  const allowed=new Set(['--file','--url','--source-page','--brand','--capture-date','--out'])
  for(let i=0;i<args.length;i++){
    const flag=args[i]
    if(bool.has(flag)){a[flag.slice(2)]=true;continue}
    if(!allowed.has(flag)||!args[i+1]||args[i+1].startsWith('--')) throw new Error('Invalid argument: '+flag)
    if(a[flag.slice(2)]) throw new Error('Duplicate argument: '+flag)
    a[flag.slice(2)]=args[++i]
  }
  return a
}
export async function main(args) {
  const a=parseArgs(args)
  if(a.help){console.log('Usage: node scripts/chatgpt-evidence-intake.mjs (--file PNG | --url allowlisted-URL) --source-page https://... --brand frankx --capture-date YYYY-MM-DD [--execute] [--out private-receipt.json]');return}
  let storage
  if(a.execute) {
    if(process.env.VIS_ENABLE_PUBLISH!=='1') throw new Error('Explicit VIS_ENABLE_PUBLISH=1 required for --execute')
    const {createWorkerStorage}=await import('../core/vis-storage.mjs')
    storage=createWorkerStorage({baseUrl:process.env.VIS_MEDIA_WORKER_URL,adminToken:process.env.VIS_MEDIA_ADMIN_TOKEN,signingKey:process.env.VIS_MEDIA_PREVIEW_SIGNING_KEY})
  }
  const receipt=await ingestEvidence({file:a.file,url:a.url,sourcePage:a['source-page'],brand:a.brand,captureDate:a['capture-date'],execute:Boolean(a.execute),storage})
  if(a.out){
    await fsp.mkdir(path.dirname(path.resolve(a.out)),{recursive:true})
    await fsp.writeFile(a.out,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600})
  }
  console.log(JSON.stringify(receipt,null,2))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).catch(err=>{console.error('VIS intake blocked: '+err.message);process.exitCode=1})
}
