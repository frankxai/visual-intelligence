const el = id => document.getElementById(id)
const actions = {
  clear_rights: 'Record rights clearance', verify_scan: 'Record scan evidence', publication_receipt: 'Record publication receipt',
  comment: 'Comment', critique: 'Independent critique', approve_asset: 'Approve asset use',
  approve_identity: 'Approve identity', approve_canon: 'Approve character canon',
  publish: 'Authorize publication', replace_canonical: 'Authorize replacement',
  archive: 'Archive', delete: 'Quarantine', recover: 'Recover', revoke_rights: 'Revoke rights',
}
for (const [value, label] of Object.entries(actions)) el('action').add(new Option(label, value))

const queue = new Map()
let selected, request = 0, offset = 0
const editionLabel = a => a.title || a.asset_id
const make = (tag, value, className) => {
  const node = document.createElement(tag)
  node.textContent = value ?? ''
  if (className) node.className = className
  return node
}
async function api(path, payload) {
  const response = await fetch(path, payload ? {
    method: 'POST', credentials: 'same-origin', headers: {'content-type':'application/json'},
    body: JSON.stringify(payload),
  } : {credentials:'same-origin', cache:'no-store'})
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Request failed')
  }
  return response.json()
}
const labelStatus = s => s ? s[0].toUpperCase() + s.slice(1) : 'Unknown'
function paintImage(id, asset) {
  const img = el(id)
  img.hidden = true
  img.onload = () => {
    img.hidden = false
    el('overlay').disabled = el('reference-image').hidden || el('candidate-image').hidden
  }
  img.onerror = () => {
    img.hidden = true
    if (id === 'reference-image' && asset) {
      el('reference-frame').querySelector('.missing').textContent = 'Reference preview unavailable'
      el('overlay').disabled = true
      mode(false)
    }
    if (id === 'candidate-image' && asset) {
      el('overlay').disabled = true
      mode(false)
    }
  }
  if (!asset) { img.removeAttribute('src'); return }
  img.alt = id === 'ghost' ? '' : editionLabel(asset)
  img.src = '/r/' + encodeURIComponent(asset.asset_id) + '/preview?sha=' + encodeURIComponent(asset.sha256)
}
function referenceChanged() {
  const ref = queue.get(el('reference').value)
  el('reference-frame').querySelector('.missing').textContent = ref ? 'Loading reference…' : 'Choose a reference'
  paintImage('reference-image', ref)
  paintImage('ghost', ref)
  el('reference-caption').textContent = ref ? editionLabel(ref) : 'Unselected'
  el('overlay').disabled = !ref || el('candidate-image').hidden || el('reference-image').hidden
  if (!ref) mode(false)
}
function mode(overlay) {
  el('stage').classList.toggle('overlaid', overlay)
  el('pair').setAttribute('aria-pressed', String(!overlay))
  el('overlay').setAttribute('aria-pressed', String(overlay))
  el('blend').hidden = !overlay
  el('ghost').style.display = overlay ? 'block' : 'none'
}
el('pair').onclick = () => mode(false)
el('overlay').onclick = () => mode(true)
el('opacity').oninput = () => {
  el('ghost').style.opacity = Number(el('opacity').value) / 100
  el('percent').textContent = el('opacity').value + '%'
}
el('opacity').oninput()
el('reference').onchange = referenceChanged
function renderDetails(record) {
  selected = record
  const asset = queue.get(record.asset_id) || record
  el('summary').textContent = editionLabel(asset)
  el('candidate-caption').textContent = editionLabel(asset)
  paintImage('candidate-image', {...record,title:editionLabel(asset)})
  el('status').textContent = labelStatus(record.status)
  el('rights').textContent = labelStatus(record.rights)
  el('consent').textContent = labelStatus(record.consent)
  const rightsLabels = {blocked:'Blocked', revoked:'Revoked', expired:'Expired', review_scoped_grants:'See destination clearances', uncleared:'Uncleared'}
  el('effective-rights').textContent = (rightsLabels[record.effective_rights] || 'Unverified') +
    (record.rights_expires_at ? ' · expires ' + record.rights_expires_at : '')
  el('custody').textContent = record.custody === 'verified' ? 'Source bytes verified' : 'Unverified or unavailable'
  el('technical').textContent = record.technical_pass === true ? 'Passed intake checks' : 'Unverified'
  el('version').textContent = record.version
  el('digest').textContent = record.sha256
  const events = el('events')
  events.replaceChildren()
  for (const event of [...record.events].reverse()) {
    const item = make('li')
    const top = make('div', '', 'event-top')
    top.append(make('strong', actions[event.action] || labelStatus(event.action)), make('small', event.at))
    item.append(top, make('div', [event.actor, event.destination, event.valid_until ? 'Expires ' + new Date(event.valid_until * 1000).toISOString() : ''].filter(Boolean).join(' · '), 'event-meta'))
    if (event.comment) item.append(make('div', event.comment, 'event-note'))
    events.append(item)
  }
  if (!events.children.length) events.append(make('li', 'No decisions recorded for this edition.', 'empty'))
  const lineage = el('parents')
  lineage.replaceChildren()
  for (const parent of record.parents) {
    const p = make('p', queue.get(parent.asset_id)?.title || parent.asset_id)
    p.append(document.createElement('br'), make('small', parent.version + ' · ' + parent.sha256))
    lineage.append(p)
  }
  if (!lineage.children.length) lineage.append(make('p', 'No parent version recorded.', 'muted'))
  const refs = el('reference')
  const previous = refs.value
  refs.replaceChildren(new Option('Choose an enrolled edition', ''))
  for (const row of queue.values()) if (row.asset_id !== record.asset_id) refs.add(new Option(editionLabel(row), row.asset_id))
  const parent = record.parents.find(p => queue.get(p.asset_id)?.sha256 === p.sha256 && queue.get(p.asset_id)?.version === p.version)
  refs.value = parent?.asset_id || (queue.has(previous) && previous !== record.asset_id ? previous : '')
  referenceChanged()
  el('unavailable').hidden = true
  el('desk').hidden = false
}
async function selectAsset(id) {
  const epoch = ++request
  selected = undefined
  el('desk').hidden = true
  el('unavailable').hidden = true
  el('summary').textContent = 'Loading edition…'
  try {
    const data = await api('/api/review/' + encodeURIComponent(id))
    if (epoch === request) renderDetails(data)
  } catch (error) { if (epoch === request) failure(error) }
}
function failure(error) {
  selected = undefined
  el('summary').textContent = 'Review could not be loaded.'
  el('desk').hidden = true
  el('unavailable').hidden = false
  el('unavailable').querySelector('p').textContent = error.message
}
async function load(reset = false) {
  const select = el('asset')
  const previous = select.value
  el('more').disabled = true
  select.disabled = true
  try {
    if (reset) { queue.clear(); offset = 0 }
    const page = await api('/api/library?limit=100&offset=' + offset)
    for (const asset of page.assets) queue.set(asset.asset_id, asset)
    offset += page.assets.length
    el('more').hidden = offset >= page.total || !page.assets.length
    select.replaceChildren()
    for (const asset of queue.values()) select.add(new Option(editionLabel(asset), asset.asset_id))
    if (!queue.size) {
      selected = undefined
      el('desk').hidden = true
      el('unavailable').hidden = true
      el('summary').textContent = 'No editions enrolled for this workspace.'
      select.add(new Option('Queue empty', ''))
      return
    }
    select.value = queue.has(previous) ? previous : select.options[0].value
    select.disabled = false
    await selectAsset(select.value)
  } catch (error) { failure(error) }
  finally {el('more').disabled = false}
}
el('more').onclick = () => load(false)
el('retry').onclick = () => load(true)
el('asset').onchange = () => selectAsset(el('asset').value)

const dialog = el('decision')
const token = el('token')
function signedFields() {
  const parts = token.value.trim().split('.')
  if (parts.length !== 2 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error('Enter a signed authorization.')
  const payload = atob(parts[0].replace(/-/g,'+').replace(/_/g,'/'))
  const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(payload, c => c.charCodeAt(0))))
  if (!selected || data.audience !== selected.audience || data.action !== el('action').value || data.asset_id !== selected.asset_id ||
      data.sha256 !== selected.sha256 || data.version !== selected.version || data.revision !== selected.revision) {
    throw new Error('The authorization must match this action and current edition.')
  }
  return data
}
function inspectToken() {
  el('submit-decision').disabled = true
  el('decision-error').textContent = ''
  el('token-summary').textContent = ''
  if (!token.value.trim()) return
  try {
    const fields = signedFields()
    const summary = el('token-summary')
    const labels = {actor:'Signer',tenant:'Workspace',action:'Action',destination:'Destination',comment:'Note',
      rights:'Rights grant',consent:'Consent',valid_until:'Valid until',evidence_ref:'Evidence',scanner:'Scanner',scan_result:'Scan result',
      previous_asset_id:'Previous identity',previous_version:'Previous version',previous_sha256:'Previous SHA-256',receipt_ref:'Receipt',
      authority_ref:'Authority',authority_sha256:'Authority SHA-256',provider:'Provider'}
    const bound = new Set(['protocol','kid','sha256','revision','version','asset_id','nonce','iat','exp'])
    for (const [key,value] of Object.entries(fields)) {
      if (bound.has(key) || value == null || value === '') continue
      const display = key === 'action' ? actions[value] : key === 'valid_until' ? new Date(value*1000).toISOString() :
        typeof value === 'object' ? JSON.stringify(value) : String(value)
      summary.append(make('dt', labels[key] || key),make('dd', display))
    }
    summary.append(make('dt','Signature expires'), make('dd', new Date(fields.exp*1000).toISOString()))
    el('submit-decision').disabled = false
  } catch (error) { el('decision-error').textContent = error.message }
}
el('open-decision').onclick = () => {
  token.value = ''
  el('audience').textContent = selected?.audience || 'Unverified'
  el('action').value = 'comment'
  inspectToken()
  dialog.showModal()
}
dialog.onclose = () => {token.value = ''; inspectToken()}
el('close-dialog').onclick = () => dialog.close()
el('action').onchange = inspectToken
token.oninput = inspectToken
el('decision-form').onsubmit = async event => {
  event.preventDefault()
  const id = selected?.asset_id
  if (!id) return
  el('submit-decision').disabled = true
  try {
    const {action, destination, comment} = signedFields()
    await api('/api/review/' + encodeURIComponent(id) + '/decision', {token:token.value.trim(),action,destination,comment})
    dialog.close()
    await selectAsset(id)
  } catch (error) {
    token.value = ''
    el('token-summary').textContent = ''
    el('decision-error').textContent = error.message
  }
}
mode(false)
load(true)
