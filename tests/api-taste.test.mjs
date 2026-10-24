import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/taste.mjs'

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

test('OPTIONS request returns 204 with CORS headers', () => {
  const req = { method: 'OPTIONS', query: {} }
  const res = createResponseMock()
  handler(req, res)

  assert.equal(res.statusCode, 204)
  assert.equal(res.ended, true)
  assert.equal(res.headers['access-control-allow-origin'], '*')
  assert.equal(res.headers['access-control-allow-methods'], 'GET, OPTIONS')
})

test('GET request without filters returns all doctrines', () => {
  const req = { method: 'GET', query: {} }
  const res = createResponseMock()
  handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.ended, true)
  assert.equal(res.headers['cache-control'], 'public, s-maxage=300, stale-while-revalidate=600')
  assert.equal(res.body.ok, true)
  assert.equal(res.body.total, 7) // Total foundational doctrines
  assert.equal(res.body.positive_doctrines.length, 6)
  assert.equal(res.body.negative_doctrines.length, 1)
})

test('GET request with brand filter includes specified brand and estate doctrines', () => {
  const req = { method: 'GET', query: { brand: 'arcanea' } }
  const res = createResponseMock()
  handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.ok(res.body.total > 0)
  const allBrands = res.body.positive_doctrines.concat(res.body.negative_doctrines).map(d => d.brand)
  for (const b of allBrands) {
    assert.ok(b === 'arcanea' || b === 'estate', `Brand ${b} is not arcanea or estate`)
  }
})

test('GET request with polarity and category filters', () => {
  const req = { method: 'GET', query: { polarity: 'positive', category: 'copy' } }
  const res = createResponseMock()
  handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.total, 1)
  assert.equal(res.body.positive_doctrines[0].subject, 'Fewer words, more weight')
  assert.equal(res.body.negative_doctrines.length, 0)
})

test('GET request with case-insensitive filters', () => {
  const req = { method: 'GET', query: { brand: 'FRANKX', category: 'TYPOGRAPHY' } }
  const res = createResponseMock()
  handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.total, 1)
  assert.equal(res.body.positive_doctrines[0].brand, 'frankx')
  assert.equal(res.body.positive_doctrines[0].category, 'typography')
})
