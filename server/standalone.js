// The app without Vite: one local server that hands the built app to the browser and
// answers the API. It's what the executable runs (server/exe.js).
import http from 'node:http'
import { createApi } from './api.js'

const sendAsset = (res, asset, path) => {
  res.statusCode = 200
  res.setHeader('Content-Type', asset.type)
  // Built files carry a hash in their name and never change; the page that names them does.
  res.setHeader('Cache-Control', path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
  res.end(asset.body)
}

// `assets` maps each path of the built app ('/index.html') to `{ type, body }`.
// Resolves with the server once it listens; rejects if the port is taken (`EADDRINUSE`).
export function startServer({ dataDir, safetyDir, assets, port, host = '127.0.0.1' }) {
  const api = createApi({ dataDir, safetyDir })

  const server = http.createServer((req, res) => {
    api(req, res, () => {
      const [path] = req.url.split('?')
      const asset = assets[path === '/' ? '/index.html' : path]
      if (asset && req.method === 'GET') return sendAsset(res, asset, path)

      res.statusCode = 404
      res.end('Not found')
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve(server))
  })
}
