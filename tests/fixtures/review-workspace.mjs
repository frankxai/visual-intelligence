// Deterministic, invented signal-study plates for VIS browser verification.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { generateKeyPairSync, sign } from 'node:crypto'
import { loadConfig } from '../../core/vis-core.mjs'
import { openLibraryDatabase } from '../../core/vis-library.mjs'
import { sha256File } from '../../core/vis-storage.mjs'
import { importOriginal, manifestBytes } from '../../core/vis-intake.mjs'
import { applyDecision, decisionBytes, decisionTemplate, reviewRecord } from '../../core/vis-review.mjs'
import { serveLibrary } from '../../web/vis-library-server.mjs'

function plate(reference) {
  const paper = reference ? '#e4ead9' : '#f4e5d0',
    ink = '#223a32',
    line = reference ? '#276b59' : '#ab4d2a'
  const curves = Array.from({ length: 22 }, (_, i) => {
    const points = Array.from({ length: 149 }, (_, j) => {
      const x = 45 + j * 4.53,
        t = j / 148,
        amp = 34 + 37 * Math.sin(t * Math.PI)
      const y =
        177 +
        i * 3.3 +
        amp * Math.sin(t * 9 + i * 0.105 + (reference ? 0 : 0.28)) * Math.pow(Math.sin(Math.PI * t), 0.7)
      return x.toFixed(1) + ',' + y.toFixed(1)
    }).join(' ')
    return '<polyline points="' + points + '" fill="none" stroke="' + line + '" stroke-width="1.7"/>'
  }).join('')
  const grid = Array.from(
    { length: 13 },
    (_, i) => '<path d="M' + (45 + 56 * i) + ' 135v192" stroke="#728274" opacity=".27"/>',
  ).join('')
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="440"><rect width="760" height="440" fill="' +
      paper +
      '"/><g fill="' +
      ink +
      '"><text x="44" y="47" font-family="monospace" font-size="14" letter-spacing="2">FIELD STUDIES  /  SIGNAL SERIES</text><text x="42" y="100" font-family="serif" font-size="47">Phase contours</text><text x="716" y="94" text-anchor="end" font-family="monospace" font-size="16">PLATE ' +
      (reference ? '01' : '02') +
      '</text></g>' +
      grid +
      curves +
      '<path d="M44 353H716" stroke="' +
      ink +
      '"/><g fill="' +
      ink +
      '" font-family="monospace" font-size="14"><text x="44" y="382">' +
      (reference ? 'Reference phase · 0.00 rad' : 'Offset phase · 0.28 rad') +
      '</text><text x="44" y="409">Synthetic comparison fixture</text></g></svg>',
  )
}
export async function fixture() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'vis-plates-'))
  fs.writeFileSync(path.join(project, 'vis.config.json'), '{}')
  const key = generateKeyPairSync('ed25519'),
    publicKey = key.publicKey.export({ format: 'pem', type: 'spki' })
  const policy = {
    workspace: 'study-room',
    ingesters: [{ actor: 'agent:plotter', brands: ['fixture'], sourceKinds: ['diagram'], publicKey }],
    reviewers: [
      {
        actor: 'human:fixture',
        actions: ['comment', 'archive', 'restore'],
        destinations: ['private-review'],
        publicKey,
      },
    ],
  }
  const db = openLibraryDatabase(project, loadConfig(project)),
    ids = []
  try {
    for (const ref of [true, false]) {
      const file = path.join(project, ref ? 'reference.png' : 'candidate.png')
      await sharp(plate(ref)).png().toFile(file)
      const m = {
        schema: 'vis.intake.v1',
        workspace: policy.workspace,
        brand: 'fixture',
        sourceKind: 'diagram',
        sourceRef: 'urn:vis:synthetic:phase-' + (ref ? '1' : '2'),
        sourceVersion: '1',
        sourceOwner: 'Synthetic test',
        title: ref ? 'Phase contours · reference' : 'Phase contours · candidate',
        sha256: sha256File(file),
        mime: 'image/png',
        bytes: fs.statSync(file).size,
        parent: ids[0] ?? null,
        run: 'fixture:plot',
        actor: 'agent:plotter',
        model: null,
        costMicros: 0,
        currency: 'EUR',
        rightsRef: null,
        consentRef: null,
        folioRef: null,
        promptRef: null,
      }
      const envelope = {
        manifest: m,
        signature: sign(null, manifestBytes(m), key.privateKey).toString('base64url'),
      }
      const r = await importOriginal({
        db,
        project,
        policy,
        objectRoot: path.join(project, 'storage'),
        file,
        envelope,
      })
      ids.push(r.asset)
    }
    const d = {
      ...decisionTemplate(reviewRecord(db, ids[1]), policy.workspace, 'comment', 'human:fixture'),
      destination: 'private-review',
      note: 'Compare the spacing at the second crest before cropping.',
    }
    applyDecision(
      db,
      policy,
      { decision: d, signature: sign(null, decisionBytes(d), key.privateKey).toString('base64url') },
      ids[1],
    )
    const k = generateKeyPairSync('ed25519')
    policy.critics = [
      {
        actor: 'critic:fixture',
        publicKey: k.publicKey.export({ format: 'pem', type: 'spki' }),
        rubrics: ['fixture:plate'],
      },
    ]
    const { evaluationBytes, recordVisualEvaluation } = await import('../../core/vis-review.mjs')
    const candidate = reviewRecord(db, ids[1]),
      reference = reviewRecord(db, ids[0])
    const evaluation = {
      schema: 'vis.visual-eval.v1',
      workspace: policy.workspace,
      asset: candidate.asset,
      version: candidate.version,
      sha256: candidate.sha256,
      referenceAsset: reference.asset,
      referenceHash: reference.sha256,
      rubric: 'fixture:plate',
      critic: 'critic:fixture',
      score: 24,
      note: 'Synthetic rubric example. Crop and phase labels require human review.',
      model: null,
      costMicros: 0,
      currency: 'EUR',
    }
    recordVisualEvaluation(db, policy, {
      evaluation,
      signature: sign(null, evaluationBytes(evaluation), k.privateKey).toString('base64url'),
    })
  } finally {
    db.close()
  }
  const { server, url } = await serveLibrary(project, { port: 0, reviewPolicy: policy })
  return {
    url,
    project,
    reference: ids[0],
    candidate: ids[1],
    signScope: (d) => {
      const decision = {
        ...d,
        actor: 'human:fixture',
        destination: 'private-review',
        note: 'Synthetic recovery check',
      }
      return {
        decision,
        signature: sign(null, decisionBytes(decision), key.privateKey).toString('base64url'),
      }
    },
    close: async () => {
      await new Promise((resolve) => server.close(resolve))
      fs.rmSync(project, { recursive: true, force: true })
    },
  }
}
