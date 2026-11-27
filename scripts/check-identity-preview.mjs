// Operator acceptance test. Inputs are a saved scope+pins and an independently obtained original.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const [origin, requestFile, originalFile] = process.argv.slice(2)
const server = new URL(origin)
if (server.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(server.hostname)) throw Error('Use the loopback VIS server')
const q = JSON.parse(readFileSync(requestFile,'utf8'))
if (!q.expected_version || !/^[a-f0-9]{64}$/.test(q.expected_sha256)) throw Error('Pass an independently pinned version and SHA-256')
const original = readFileSync(originalFile)
if (createHash('sha256').update(original).digest('hex') !== q.expected_sha256) throw Error('Wrong comparison original')
const response = await fetch(new URL('/api/identity/preview',server), {
  method:'POST',redirect:'error',headers:{'x-vis-operator':'1','content-type':'application/json'},body:JSON.stringify(q)
})
if (!response.ok || response.headers.get('content-type')!=='image/webp') throw Error('Verified preview unavailable')
const preview = Buffer.from(await response.arrayBuffer())
const normalize = image => image.flatten({background:'#fff'}).toColourspace('srgb').raw().toBuffer({resolveWithObject:true})
const expected = await normalize(sharp(original).resize({width:720,height:480,fit:'inside',withoutEnlargement:true}))
const actual = await normalize(sharp(preview))
if (['width','height','channels'].some(key=>expected.info[key]!==actual.info[key])) throw Error('Dimensions or channels differ')
let error=0, large=0
for(let i=0;i<expected.data.length;i++){
  const delta=Math.abs(expected.data[i]-actual.data[i])
  error+=delta
  if(delta>40) large++
}
const mean=error/expected.data.length, outliers=large/expected.data.length
if(mean>5 || outliers>0.02) throw Error('Rendered preview differs from the verified original')
console.log(JSON.stringify({identity:q.identity_id,sha256:q.expected_sha256,width:actual.info.width,height:actual.info.height,mean_absolute_error:mean,outlier_fraction:outliers}))
