import http from 'node:http'
import { Readable } from 'node:stream'

/** Node transport for the same Fetch handler exercised in host integration tests. */
export function createCatalogNodeServer(handler, resource) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, resource)
      const init = { method: req.method, headers: req.headers }
      if (!['GET', 'HEAD'].includes(req.method)) { init.body = Readable.toWeb(req); init.duplex = 'half' }
      const response = await handler(new Request(url, init))
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch { res.writeHead(500, { 'Cache-Control': 'no-store' }); res.end('gateway_unavailable') }
  })
  server.requestTimeout = 10000
  server.headersTimeout = 5000
  server.maxHeadersCount = 50
  return server
}
