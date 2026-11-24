// The local API: reads and writes the JSON documents, keeps the settings and reaches Yahoo.
// Browsers can't write files, so it runs next to the app: inside the Vite dev server
// (vite.config.js) and inside the standalone server of the executable (server/standalone.js).
import fs from 'node:fs'
import path from 'node:path'
import { usedSymbols } from '../src/utils/portfolio.js'
import { isValidAsset, isValidSettings, isValidSnapshot, isValidTransaction } from '../src/utils/validation.js'
import { restoreData } from '../scripts/restoreData.js'
import { STARTER_ASSETS } from './starterAssets.js'

// Lets a second launch of the executable tell that the port is taken by another copy of itself.
export const APP_ID = 'portfolio-tracker'

const YAHOO_URL = 'https://query1.finance.yahoo.com'
const SETTINGS_FILE = 'settings.json'
// What each document holds before anything is saved.
const EMPTY_DOCUMENTS = { 'assets.json': STARTER_ASSETS, 'transactions.json': [], 'history.json': [] }

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')

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
  // The data changes with every save: a cached answer would bring back what was deleted.
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function appendItem({ file, validate, uniqueKey }, item, res) {
  if (!validate(item)) return sendJson(res, 400, { error: 'Datos inválidos' })

  const items = readJson(file)
  if (uniqueKey && items.some((existing) => existing[uniqueKey] === item[uniqueKey])) {
    return sendJson(res, 409, { error: `Ya existe un registro con ${uniqueKey} = ${item[uniqueKey]}` })
  }

  items.push(item)
  writeJson(file, items)
  sendJson(res, 201, item)
}

function removeItems({ file, idKey, findDeleteError }, { ids }, res) {
  if (!Array.isArray(ids)) return sendJson(res, 400, { error: 'Falta la lista de ids' })

  const deleteError = findDeleteError?.(ids)
  if (deleteError) return sendJson(res, 409, { error: deleteError })

  const items = readJson(file)
  const remaining = items.filter((item) => !ids.includes(item[idKey]))
  if (remaining.length !== items.length) writeJson(file, remaining)

  sendJson(res, 200, { deleted: items.length - remaining.length })
}

function updateItem({ file, validate, editable }, { id, changes }, res) {
  const fields = Object.keys(changes ?? {})
  if (!fields.length || fields.some((field) => !editable.fields.includes(field))) {
    return sendJson(res, 400, { error: `Solo se puede modificar: ${editable.fields.join(', ')}` })
  }

  const items = readJson(file)
  const index = items.findIndex((item) => item[editable.key] === id)
  if (index === -1) return sendJson(res, 404, { error: `No existe un registro con ${editable.key} = ${id}` })

  // A field set to null is removed (an asset that no longer has a ratio).
  const updated = Object.fromEntries(
    Object.entries({ ...items[index], ...changes }).filter(([, value]) => value !== null),
  )
  if (!validate(updated)) return sendJson(res, 400, { error: 'Datos inválidos' })

  items[index] = updated
  writeJson(file, items)
  sendJson(res, 200, updated)
}

// DELETE and PATCH only exist on the stores that enable them.
const writerFor = (store, method) => {
  if (method === 'POST') return appendItem
  if (method === 'DELETE' && store.idKey) return removeItems
  if (method === 'PATCH' && store.editable) return updateItem
  return null
}

// Browsers send `Origin` with every write and with every request from another site:
// a website open in the browser can't read or change the data. Requests without it
// (the app's own reads, curl, scripts) are local and go through.
const isSameOrigin = ({ headers }) => !headers.origin || headers.origin === `http://${headers.host}`

// Yahoo Finance has no CORS, so the browser asks this server and it asks Yahoo
// (services/yahooChart.js). Without a User-Agent, Yahoo answers 429.
async function proxyYahoo(target, res) {
  let upstream
  try {
    upstream = await fetch(`${YAHOO_URL}${target}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  } catch {
    return sendJson(res, 502, { error: 'No se pudo consultar Yahoo Finance' })
  }
  res.statusCode = upstream.status
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
  res.end(Buffer.from(await upstream.arrayBuffer()))
}

// Returns a middleware `(req, res, next)` for everything under `/api/`.
// `dataDir` holds the JSON documents (created empty if missing) and `safetyDir` keeps what
// a restore replaces. `finnhubKey` is the key to use while none was saved from the app.
export function createApi({ dataDir, safetyDir, finnhubKey = '' }) {
  fs.mkdirSync(dataDir, { recursive: true })
  for (const [name, content] of Object.entries(EMPTY_DOCUMENTS)) {
    if (!fs.existsSync(path.join(dataDir, name))) writeJson(path.join(dataDir, name), content)
  }

  const startedAt = Date.now()
  const dataFile = (name) => path.join(dataDir, name)
  const settingsFile = dataFile(SETTINGS_FILE)
  const readSettings = () => (fs.existsSync(settingsFile) ? readJson(settingsFile) : {})

  // GET returns the whole array and POST appends the request body to it.
  // `uniqueKey` rejects items whose value for that field already exists.
  // `idKey` enables DELETE with a `{ ids }` body to remove items. `findDeleteError` (optional)
  // gets the ids and returns why they can't be removed, if they can't.
  // `editable` enables PATCH with an `{ id, changes }` body: it merges `changes` into the
  // item whose `key` field equals `id`. Only the listed `fields` can change; `null` removes one.
  const stores = {
    '/api/transactions': {
      file: dataFile('transactions.json'),
      validate: isValidTransaction,
      // Reimporting the broker's orders can't load one twice.
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
        const used = usedSymbols(readJson(dataFile('transactions.json')))
        const blocked = symbols.filter((symbol) => used.has(symbol))
        return blocked.length ? `No se puede borrar ${blocked.join(', ')}: tiene transacciones o es USDT` : null
      },
      // Symbol and type stay fixed: every transaction points at them.
      editable: { key: 'symbol', fields: ['color', 'name', 'category', 'ratio'] },
    },
  }

  async function handle(route, target, req, res, next) {
    const { method } = req

    if (route === '/api/ping' && method === 'GET') return sendJson(res, 200, { app: APP_ID, startedAt })

    if (route.startsWith('/api/yahoo/') && method === 'GET') {
      return proxyYahoo(target.slice('/api/yahoo'.length), res)
    }

    if (route === '/api/settings') {
      // `keyAsked`: the settings were saved at least once, with a key or without one. Until
      // then the app opens the key form by itself. It goes with the data, not with the
      // browser, so a new data folder asks again.
      if (method === 'GET') {
        return sendJson(res, 200, { finnhubKey, ...readSettings(), keyAsked: fs.existsSync(settingsFile) })
      }
      if (method !== 'PUT') return next()
      const settings = await readBody(req)
      if (!isValidSettings(settings)) return sendJson(res, 400, { error: 'Datos inválidos' })
      writeJson(settingsFile, settings)
      return sendJson(res, 200, settings)
    }

    // PUT replaces the catalog and the transactions with a backup (`{ assets, transactions }`),
    // after keeping the files it replaces in `safetyDir`.
    if (route === '/api/backup' && method === 'PUT') {
      restoreData(await readBody(req), { dataDir, safetyDir })
      return sendJson(res, 200, { restored: true })
    }

    const store = stores[route]
    if (!store) return next()
    if (method === 'GET') return sendJson(res, 200, readJson(store.file))

    const write = writerFor(store, method)
    if (!write) return next()
    write(store, await readBody(req), res)
  }

  return async function api(req, res, next) {
    const [route] = req.url.split('?')
    if (!route.startsWith('/api/')) return next()
    if (!isSameOrigin(req)) return sendJson(res, 403, { error: 'Origen no permitido' })

    try {
      await handle(route, req.url, req, res, next)
    } catch (error) {
      // A read fails when a document is broken on disk; a write, when the request is.
      sendJson(res, req.method === 'GET' ? 500 : 400, { error: error.message })
    }
  }
}
