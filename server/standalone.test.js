import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STARTER_ASSETS } from './starterAssets.js'
import { startServer } from './standalone.js'

const asset = { symbol: 'ETH', name: 'Ethereum', type: 'crypto', color: '#818cf8', price: 2000 }
const buy = { id: 'a', date: '2026-01-06', type: 'buy', symbol: 'ETH', quantity: 1, price: 100, fee: 0 }
const page = { type: 'text/html; charset=utf-8', body: Buffer.from('<p>app</p>') }

let root
let server
let url
const dataFile = (name) => path.join(root, 'data', name)
const send = (route, method, body, headers = {}) =>
  fetch(`${url}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
const get = async (route) => (await fetch(`${url}${route}`)).json()

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-'))
  server = await startServer({
    dataDir: path.join(root, 'data'),
    safetyDir: path.join(root, 'backups'),
    assets: { '/index.html': page },
    port: 0,
  })
  url = `http://127.0.0.1:${server.address().port}`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  fs.rmSync(root, { recursive: true, force: true })
})

describe('standalone server', () => {
  it('starts an empty portfolio: the stablecoin, no transactions and no key', async () => {
    expect(await get('/api/assets')).toEqual(STARTER_ASSETS)
    expect(await get('/api/transactions')).toEqual([])
    expect(await get('/api/history')).toEqual([])
    expect(await get('/api/settings')).toEqual({ finnhubKey: '', keyAsked: false })
  })

  it('keeps what is saved in the data folder', async () => {
    expect((await send('/api/assets', 'POST', asset)).status).toBe(201)
    expect((await send('/api/transactions', 'POST', buy)).status).toBe(201)

    expect(await get('/api/transactions')).toEqual([buy])
    expect(JSON.parse(fs.readFileSync(dataFile('assets.json'), 'utf8'))).toEqual([...STARTER_ASSETS, asset])
  })

  it('rejects a repeated id and invalid data', async () => {
    await send('/api/transactions', 'POST', buy)

    expect((await send('/api/transactions', 'POST', buy)).status).toBe(409)
    expect((await send('/api/transactions', 'POST', { ...buy, id: 'b', quantity: '1' })).status).toBe(400)
  })

  it('edits and deletes, but not an asset that has transactions', async () => {
    await send('/api/assets', 'POST', asset)
    await send('/api/transactions', 'POST', buy)

    expect((await send('/api/transactions', 'PATCH', { id: 'a', changes: { price: 120 } })).status).toBe(200)
    expect((await send('/api/transactions', 'PATCH', { id: 'a', changes: { symbol: 'BTC' } })).status).toBe(400)
    expect((await send('/api/assets', 'DELETE', { ids: ['ETH'] })).status).toBe(409)

    expect((await send('/api/transactions', 'DELETE', { ids: ['a'] })).status).toBe(200)
    expect((await send('/api/assets', 'DELETE', { ids: ['ETH'] })).status).toBe(200)
    expect(await get('/api/assets')).toEqual(STARTER_ASSETS)
  })

  it('saves the Finnhub key and gives it back', async () => {
    expect((await send('/api/settings', 'PUT', { finnhubKey: 'abc123' })).status).toBe(200)
    expect(await get('/api/settings')).toEqual({ finnhubKey: 'abc123', keyAsked: true })
    expect((await send('/api/settings', 'PUT', { finnhubKey: 5 })).status).toBe(400)
  })

  it('remembers that the key was asked when it is declined', async () => {
    await send('/api/settings', 'PUT', { finnhubKey: '' })

    expect(await get('/api/settings')).toEqual({ finnhubKey: '', keyAsked: true })
  })

  it('says which app it is and since when, for a second launch to find it', async () => {
    const ping = await get('/api/ping')

    expect(ping.app).toBe('portfolio-tracker')
    expect(Date.now() - ping.startedAt).toBeLessThan(60000)
  })

  it('restores a backup and keeps what it replaced', async () => {
    const response = await send('/api/backup', 'PUT', { assets: [...STARTER_ASSETS, asset], transactions: [buy] })

    expect(response.status).toBe(200)
    expect(await get('/api/transactions')).toEqual([buy])
    expect(fs.readdirSync(path.join(root, 'backups'))).toHaveLength(1)
  })

  it('refuses requests that come from another website', async () => {
    const other = { Origin: 'http://evil.example' }

    expect((await send('/api/transactions', 'POST', buy, other)).status).toBe(403)
    expect((await fetch(`${url}/api/transactions`, { headers: other })).status).toBe(403)
    expect((await send('/api/transactions', 'POST', buy, { Origin: url })).status).toBe(201)
  })

  it('says so when a document is broken, instead of serving it', async () => {
    fs.writeFileSync(dataFile('transactions.json'), '[{')

    expect((await fetch(`${url}/api/transactions`)).status).toBe(500)
  })

  it('serves the built app, and nothing else', async () => {
    const home = await fetch(`${url}/`)

    expect(await home.text()).toBe('<p>app</p>')
    expect(home.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect((await fetch(`${url}/missing.js`)).status).toBe(404)
    expect((await fetch(`${url}/api/unknown`)).status).toBe(404)
  })
})
