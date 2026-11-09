import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/feedback.mjs'

function createResponseMock() {
  const res = {
    headers: {},
    statusCode: 200,
    body: null,
    ended: false,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(data) {
      this.body = data
      this.ended = true
      return this
    },
    end() {
      this.ended = true
      return this
    }
  }
  return res
}

test('OPTIONS request returns 204 with CORS headers', async () => {
  const req = { method: 'OPTIONS' }
  const res = createResponseMock()
  await handler(req, res)

  assert.equal(res.statusCode, 204)
  assert.equal(res.ended, true)
  assert.equal(res.headers['access-control-allow-origin'], '*')
})

test('GET request returns 405 method not allowed', async () => {
  const req = { method: 'GET' }
  const res = createResponseMock()
  await handler(req, res)

  assert.equal(res.statusCode, 405)
  assert.equal(res.body.error, 'Method not allowed')
})

test('POST request without asset_id returns 400', async () => {
  const req = { method: 'POST', body: {} }
  const res = createResponseMock()
  await handler(req, res)

  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error, 'Missing asset_id')
})

test('POST request with stringified body parses correctly', async () => {
  const req = { method: 'POST', body: JSON.stringify({ asset_id: 'asset123', action: 'approve' }) }
  const res = createResponseMock()
  await handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.receipt.asset_id, 'asset123')
  assert.equal(res.body.receipt.approval_status, 'approved')
})

test('POST request correctly determines approved status for rating >= 4', async () => {
  const req = { method: 'POST', body: { asset_id: 'asset123', rating: 4 } }
  const res = createResponseMock()
  await handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.receipt.approval_status, 'approved')
  assert.equal(res.body.receipt.polarity, 'positive')
})

test('POST request correctly determines rejected status for rating <= 2', async () => {
  const req = { method: 'POST', body: { asset_id: 'asset123', rating: '2' } }
  const res = createResponseMock()
  await handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.receipt.approval_status, 'rejected')
  assert.equal(res.body.receipt.polarity, 'negative')
})

test('POST request correctly determines needs-review status for rating 3', async () => {
  const req = { method: 'POST', body: { asset_id: 'asset123', rating: 3 } }
  const res = createResponseMock()
  await handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.receipt.approval_status, 'needs-review')
  assert.equal(res.body.receipt.polarity, 'neutral')
})

test('POST request treats defects as rejection', async () => {
  const req = { method: 'POST', body: { assetId: 'asset123', defects: ['blurry'] } }
  const res = createResponseMock()
  await handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.receipt.asset_id, 'asset123')
  assert.equal(res.body.receipt.approval_status, 'rejected')
  assert.deepEqual(res.body.receipt.defects, ['blurry'])
})

test('POST request gracefully fails on internal error', async () => {
  // Pass a body that throws when parsed, bypassing the type check to simulate edge case
  const req = { method: 'POST', get body() { throw new Error('Simulated exception') } }
  const res = createResponseMock()
  await handler(req, res)

  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error, 'Simulated exception')
})
