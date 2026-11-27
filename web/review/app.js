const q = (id) => document.getElementById(id)
const sample = window.VIS_PREVIEW
const option = (value, text) => new Option(text, value)
const labels = {
  comment: 'Comment',
  approve_use: 'Asset use',
  approve_identity: 'Brand identity',
  approve_canon: 'Character canon',
  authorize_publication: 'Publication',
  replace_canonical: 'Canonical replacement',
  archive: 'Archive',
  delete: 'Quarantine',
  restore: 'Restore',
  revoke_rights: 'Revoke rights',
}
let current,
  selection = 0,
  pending,
  records = []
async function request(path, options) {
  const r = await fetch(path, options)
  const data = await r.json()
  if (!r.ok) throw Error(data.error || 'Request failed')
  return data
}
function message(text) {
  q('status').textContent = text
}
function paragraph(text) {
  const p = document.createElement('p')
  p.textContent = text
  return p
}
function loadImage(id, asset) {
  const img = q(id)
  img.hidden = false
  img.onerror = () => {
    img.hidden = true
  }
  if (asset) img.src = sample?.images[asset] || '/r/' + encodeURIComponent(asset) + '/preview'
  else img.removeAttribute('src')
}
function renderRecord(r) {
  current = r
  pending = null
  q('signed').value = ''
  q('submit').disabled = true
  q('inspect').hidden = true
  q('title').textContent = r.title
  q('state').textContent = r.state + ' · revision ' + r.revision
  q('eligibility').textContent =
    r.state !== 'candidate'
      ? 'Use blocked · ' + r.state
      : !['owned', 'generated-owned', 'licensed'].includes(r.rights)
        ? 'Use blocked · rights ' + r.rights
        : 'Use requires scoped clearance'
  loadImage('candidate', r.asset)
  q('facts').replaceChildren()
  for (const [name, value] of Object.entries({
    Rights: r.rights,
    Source: r.source?.manifest.sourceKind || 'Existing catalog',
    Consent: r.source?.manifest.consentRef ? 'Evidence referenced' : 'No evidence on file',
    Validation: r.source?.technical.level || 'No intake attestation',
    Format: r.mime || 'Unknown',
    Dimensions: r.width && r.height ? r.width + ' × ' + r.height : 'Unknown',
    Version: r.version,
    'SHA-256': r.sha256,
  })) {
    const dt = document.createElement('dt'),
      dd = document.createElement('dd')
    dt.textContent = name
    dd.textContent = value
    q('facts').append(dt, dd)
  }
  const links = [
    ...r.placements.map((p) => p.site + ' · ' + p.status + ' · ' + p.url),
    ...(r.publications || []).map((p) => p.platform + ' · ' + p.status + ' · ' + p.campaign),
  ]
  q('lineage').replaceChildren(
    ...(links.length ? links : ['No linked derivatives or placements.']).map(paragraph),
  )
  if (r.lineage.length && !links.length) q('lineage').replaceChildren()
  for (const edge of r.lineage) {
    const isParent = edge.child === r.asset,
      id = isParent ? edge.parent : edge.child
    const button = document.createElement('button')
    button.className = 'lineage-link'
    button.textContent =
      (isParent ? 'Parent · ' : 'Derivative · ') +
      (records.find((a) => a.asset_id === id)?.title || id.slice(0, 14))
    button.title = id
    button.onclick = () => {
      q('asset').value = id
      refresh().catch((e) => message(e.message))
    }
    q('lineage').append(button)
  }
  q('evaluation').replaceChildren(
    ...(r.evaluations?.length
      ? r.evaluations.map((e) => e.evaluator + ' · ' + e.score + '/30 · ' + e.notes)
      : ['Awaiting independent critique.']
    ).map(paragraph),
  )
  q('history').replaceChildren(
    ...(r.history.length
      ? r.history.map((h) => {
          const el = document.createElement('div')
          el.className = 'event'
          const title = document.createElement('strong')
          title.textContent = labels[h.decision.action] || h.decision.action
          const meta = document.createElement('small')
          meta.textContent =
            h.decision.actor +
            ' · rev ' +
            h.revision +
            ' · ' +
            new Date(h.recorded_at).toISOString().slice(0, 16).replace('T', ' ') +
            ' UTC'
          el.append(title, paragraph(h.decision.note), meta)
          return el
        })
      : [paragraph('Awaiting the first signed review.')]),
  )
}
async function refresh() {
  const seq = ++selection,
    id = q('asset').value
  if (!id) {
    q('title').textContent = 'No assets in this workspace'
    q('decisions').hidden = true
    return
  }
  const record = sample?.records[id] || (await request('/api/review/asset/' + encodeURIComponent(id)))
  if (seq !== selection) return
  renderRecord(record)
  for (const item of q('reference').options) item.disabled = item.value === id
  if (q('reference').value === id) q('reference').value = ''
  await compareImage()
}
async function compareImage() {
  const id = q('reference').value
  loadImage('referenceImage', id)
  q('overlay').disabled = !id
  if (!id) mode(false)
  q('comparisonLabel').textContent = 'Comparison asset'
  if (!id) return
  const r = sample?.records[id] || (await request('/api/review/asset/' + encodeURIComponent(id)))
  if (q('reference').value === id)
    q('comparisonLabel').textContent = 'Comparison asset · ' + r.state + ' · rights ' + r.rights
}
function mode(blend) {
  q('plates').classList.toggle('blend', blend)
  q('side').setAttribute('aria-pressed', String(!blend))
  q('overlay').setAttribute('aria-pressed', String(blend))
  q('mix').hidden = !blend
}
q('side').onclick = () => mode(false)
q('overlay').onclick = () => mode(true)
q('opacity').oninput = () => q('plates').style.setProperty('--opacity', q('opacity').value / 100)
q('reference').onchange = () => compareImage().catch((e) => message(e.message))
q('asset').onchange = () => refresh().catch((e) => message(e.message))
q('template').onclick = async () => {
  try {
    const data = await request(
      '/api/review/scope/' + encodeURIComponent(current.asset) + '?action=' + q('action').value,
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = 'review-scope.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  } catch (e) {
    message(e.message)
  }
}
q('signed').onchange = async () => {
  pending = null
  q('submit').disabled = true
  q('inspect').hidden = true
  try {
    const f = q('signed').files[0]
    if (!f || f.size > 20000) throw Error('Select a small signed JSON decision')
    const e = JSON.parse(await f.text())
    if (e.decision?.asset !== current.asset || e.decision?.revision !== current.revision)
      throw Error('Decision target or revision differs')
    q('inspect').textContent = JSON.stringify(e.decision, null, 2)
    q('inspect').hidden = false
    pending = e
    q('submit').disabled = false
  } catch (e) {
    message(e.message)
  }
}
q('submit').onclick = async () => {
  try {
    q('submit').disabled = true
    await request('/api/review/asset/' + encodeURIComponent(current.asset), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vis-operator': '1' },
      body: JSON.stringify(pending),
    })
    await refresh()
    message('Signed decision recorded.')
  } catch (e) {
    message(e.message)
  }
}
try {
  const data = sample || (await request('/api/review'))
  records = data.assets
  q('workspace').textContent = data.workspace
  q('decisions').hidden = Boolean(sample)
  q('asset').replaceChildren(...data.assets.map((a) => option(a.asset_id, a.title)))
  q('reference').replaceChildren(
    option('', 'Choose a reference'),
    ...data.assets.map((a) => option(a.asset_id, a.title)),
  )
  q('action').replaceChildren(...Object.entries(labels).map(([k, v]) => option(k, v)))
  q('reference').value = data.reference || ''
  await refresh()
} catch (e) {
  message(e.message)
  q('title').textContent = 'Review unavailable'
}
