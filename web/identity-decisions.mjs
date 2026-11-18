const el = id => document.getElementById(id)
const message = text => { el('message').textContent = text }
let config, current, revision = 0, saving = false
const files = ['master','candidate']
const verified = new Set()
const previews = new Map()

function update() {
  const action = el('action').value
  const needsBytes = ['approve_use','recover'].includes(action)
  el('save').disabled = saving || !current || !action || !el('evidence').value.trim() ||
    (needsBytes && verified.size !== 2)
}
function clear() {
  revision++
  current = undefined
  verified.clear()
  for (const id of files) {
    if (previews.has(id)) URL.revokeObjectURL(previews.get(id))
    previews.delete(id)
    el(id).value = ''
    el(id+'-state').textContent = ''
    el(id+'-preview').hidden = true
    el(id+'-preview').removeAttribute('src')
  }
  el('details').hidden = true
  el('action').value = el('evidence').value = ''
  el('history').replaceChildren()
  update()
}
async function rpc(name, args) {
  const token = el('token').value.trim()
  let claims
  try { claims = JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/'))) } catch { /* malformed session */ }
  if (claims?.role !== 'authenticated' || claims.aal !== 'aal2' || claims.iss !== config.project+'/auth/v1') {
    throw Error('Use a current MFA-verified human session for this project.')
  }
  const res = await fetch(config.project+'/rest/v1/rpc/'+name,{
    method:'POST',redirect:'error',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
    headers:{apikey:config.key,authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify(args)
  })
  if (!res.ok) throw Error('The decision service declined the request. Check membership, current version and rights.')
  return res.json()
}
async function openPlacement() {
  clear()
  const at = revision, placement = el('placement').value.trim()
  if (!/^[1-9][0-9]{0,18}$/.test(placement)) return message('Enter a valid placement decision ID.')
  try {
    const rows = await rpc('vis_review_history',{placement})
    if (at !== revision) return
    if (!rows.length) return message('No placement visible to this reviewer.')
    current = rows[0]
    const record = el('record')
    record.replaceChildren()
    for (const [label,key] of Object.entries({'Brand':'brand','Identity':'identity_id','Variant':'variant','Use':'intended_use','Channel':'channel','Rights':'rights_basis','Expiry':'expires_at','Placement version':'version_id','Master version':'master_version','Placement SHA-256':'sha256','Master SHA-256':'parent_sha256'})) {
      const dt=document.createElement('dt'), dd=document.createElement('dd')
      dt.textContent=label; dd.textContent=current[key]; record.append(dt,dd)
    }
    for (const r of rows) {
      const item=document.createElement('li')
      item.textContent=[r.action,r.recorded_at,r.reviewer,r.version_id,r.evidence_ref].join(' · ')
      el('history').append(item)
    }
    el('details').hidden=false
    message('Loaded decision '+current.decision_id+'.')
  } catch (e) { if (at===revision) message(e.message) }
}
for (const id of files) el(id).onchange=async()=>{
  const at=revision, file=el(id).files[0], img=el(id+'-preview')
  verified.delete(id); update()
  img.hidden=true; img.removeAttribute('src')
  if (previews.has(id)) URL.revokeObjectURL(previews.get(id))
  previews.delete(id)
  if (!current || !file) return
  try {
    const bytes=await file.arrayBuffer()
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')
    if (at!==revision || file!==el(id).files[0]) return
    if (hash!==current[id==='master'?'parent_sha256':'sha256']) { el(id+'-state').textContent='Blocked · different bytes';return }
    verified.add(id); el(id+'-state').textContent='Exact recorded bytes'
    if (['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type)) {
      const url=URL.createObjectURL(file);previews.set(id,url);img.src=url;img.hidden=false
    }
    update()
  } catch { if(at===revision) el(id+'-state').textContent='File could not be verified' }
}
el('load').onclick=openPlacement
for(const id of ['token','placement']) el(id).oninput=clear
for(const id of ['action','evidence']) el(id).oninput=update
el('save').onclick=async()=>{
  if(el('save').disabled) return
  const at=revision
  saving=true; update()
  try {
    const id=await rpc('vis_review_decide',{placement:current.decision_id,choice:el('action').value,evidence:el('evidence').value.trim(),expected_sha:current.sha256,expected_parent_sha:current.parent_sha256})
    if(at!==revision) return
    el('placement').value=id
    await openPlacement()
  } catch(e){if(at===revision)message(e.message)} finally{saving=false; update()}
}
try {
  const res=await fetch('/api/identity/reviewer-config',{cache:'no-store'})
  if(!res.ok) throw Error()
  config=await res.json()
  el('project').textContent='Session credentials go directly to '+config.project+'. The browser retains them only while this page is open.'
  el('session').disabled=false
  message('Connect your enrolled reviewer session.')
} catch { message('Reviewer service is not configured on this workspace.') }
