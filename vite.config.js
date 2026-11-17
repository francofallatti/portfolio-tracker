import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { usedSymbols } from './src/utils/portfolio.js'
import { isValidAsset, isValidSnapshot, isValidTransaction } from './src/utils/validation.js'

const dataFile = (name) => fileURLToPath(new URL(`./src/data/${name}`, import.meta.url))

// POST appends the request body to the JSON array in `file`.
// `uniqueKey` rejects items whose value for that field already exists.
// `idKey` enables DELETE with a `{ ids }` body to remove items. `findDeleteError` (optional)
// gets the ids and returns why they can't be removed, if they can't.
// `editable` enables PATCH with an `{ id, changes }` body: it merges `changes` into the
// item whose `key` field equals `id`. Only the listed `fields` can change; `null` removes one.
const STORES = {
  '/api/transactions': {
    file: dataFile('transactions.json'),
    validate: isValidTransaction,
    // Reimporting the broker's orders (ids `ord-<n°>`) can't load one twice.
    uniqueKey: 'id',
    idKey: 'id',
    // Type and symbol stay fixed: changing them means deleting the transaction and adding a new one.
    editable: {
      key: 'id',
      fields: ['date', 'quantity', 'price', 'fee', 'funding', 'proceeds', 'amount', 'newShares', 'oldShares'],
    },
  },
  '/api/history': { file: dataFile('history.json'), validate: isValidSnapshot },
  '/api/assets': {
    file: dataFile('assets.json'),
    validate: isValidAsset,
    uniqueKey: 'symbol',
    idKey: 'symbol',
    // An asset with transactions stays: they would be left pointing at nothing.
    findDeleteError: (symbols) => {
      const used = usedSymbols(readItems(dataFile('transactions.json')))
      const blocked = symbols.filter((symbol) => used.has(symbol))
      return blocked.length ? `No se puede borrar ${blocked.join(', ')}: tiene transacciones o es USDT` : null
    },
    // Symbol and type stay fixed: every transaction points at them.
    editable: { key: 'symbol', fields: ['color', 'name', 'category', 'ratio'] },
  },
}

const readItems = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

const writeItems = (file, items) => fs.writeFileSync(file, JSON.stringify(items, null, 2) + '\n')

// history.json is local only (gitignored): a fresh clone starts it empty so the app's import resolves.
if (!fs.existsSync(STORES['/api/history'].file)) writeItems(STORES['/api/history'].file, [])

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })

const sendJson = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function appendItem({ file, validate, uniqueKey }, item, res) {
  if (!validate(item)) return sendJson(res, 400, { error: 'Datos inválidos' })

  const items = readItems(file)
  if (uniqueKey && items.some((existing) => existing[uniqueKey] === item[uniqueKey])) {
    return sendJson(res, 409, { error: `Ya existe un registro con ${uniqueKey} = ${item[uniqueKey]}` })
  }

  items.push(item)
  writeItems(file, items)
  sendJson(res, 201, item)
}

function removeItems({ file, idKey, findDeleteError }, { ids }, res) {
  if (!Array.isArray(ids)) return sendJson(res, 400, { error: 'Falta la lista de ids' })

  const deleteError = findDeleteError?.(ids)
  if (deleteError) return sendJson(res, 409, { error: deleteError })

  const items = readItems(file)
  const remaining = items.filter((item) => !ids.includes(item[idKey]))
  if (remaining.length !== items.length) writeItems(file, remaining)

  sendJson(res, 200, { deleted: items.length - remaining.length })
}

function updateItem({ file, validate, editable }, { id, changes }, res) {
  const fields = Object.keys(changes ?? {})
  if (!fields.length || fields.some((field) => !editable.fields.includes(field))) {
    return sendJson(res, 400, { error: `Solo se puede modificar: ${editable.fields.join(', ')}` })
  }

  const items = readItems(file)
  const index = items.findIndex((item) => item[editable.key] === id)
  if (index === -1) return sendJson(res, 404, { error: `No existe un registro con ${editable.key} = ${id}` })

  // A field set to null is removed (an asset that no longer has a ratio).
  const updated = Object.fromEntries(
    Object.entries({ ...items[index], ...changes }).filter(([, value]) => value !== null),
  )
  if (!validate(updated)) return sendJson(res, 400, { error: 'Datos inválidos' })

  items[index] = updated
  writeItems(file, items)
  sendJson(res, 200, updated)
}

// DELETE and PATCH only exist on the stores that enable them.
const handlerFor = (store, method) => {
  if (method === 'POST') return appendItem
  if (method === 'DELETE' && store.idKey) return removeItems
  if (method === 'PATCH' && store.editable) return updateItem
  return null
}

// Browsers send `Origin` with every write: another website open in the browser can't
// change the data. Requests without it (curl, scripts) are local and go through.
const isSameOrigin = ({ headers }) => !headers.origin || headers.origin === `http://${headers.host}`

// Dev-only endpoints that persist data in src/data/*.json.
// Browsers can't write files, so this runs inside the Vite dev server.
function jsonStore() {
  return {
    name: 'json-store',
    apply: 'serve',
    configureServer(server) {
      for (const [route, store] of Object.entries(STORES)) {
        server.middlewares.use(route, async (req, res, next) => {
          const handler = handlerFor(store, req.method)
          if (!handler) return next()
          if (!isSameOrigin(req)) return sendJson(res, 403, { error: 'Origen no permitido' })

          try {
            handler(store, await readBody(req), res)
          } catch (error) {
            sendJson(res, 400, { error: error.message })
          }
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), jsonStore()],
  server: {
    proxy: {
      // Yahoo Finance has no CORS, so the browser asks the dev server and it asks Yahoo
      // (services/yahooChart.js). Without a User-Agent, Yahoo answers 429.
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
    },
  },
})
