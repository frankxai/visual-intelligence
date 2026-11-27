const fields = [
  'schema',
  'workspace',
  'brand',
  'sourceKind',
  'sourceRef',
  'sourceVersion',
  'sourceOwner',
  'title',
  'sha256',
  'bytes',
  'mime',
  'parent',
  'run',
  'actor',
  'model',
  'costMicros',
  'currency',
  'rightsRef',
  'consentRef',
  'folioRef',
  'promptRef',
]

export function manifestBytes(m) {
  if (!m || Object.keys(m).length !== fields.length || !fields.every((f) => Object.hasOwn(m, f)))
    throw Error('Invalid intake fields')
  return Buffer.from(JSON.stringify(fields.map((f) => m[f])))
}
