import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { restoreData } from './restoreData.js'

const assets = [{ symbol: 'ETH', name: 'Ethereum', type: 'crypto', color: '#818cf8', price: 2000 }]
const transactions = [
  { id: 'a', date: '2026-01-06', type: 'buy', symbol: 'ETH', quantity: 1, price: 100, fee: 0, funding: 'external' },
]

let dataDir
let safetyDir
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8')
const restore = (backup) => restoreData(backup, { dataDir, safetyDir, now: new Date(2026, 10, 5, 14, 30, 59) })

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-'))
  dataDir = path.join(root, 'data')
  safetyDir = path.join(root, 'backups')
  fs.mkdirSync(dataDir)
})

afterEach(() => fs.rmSync(path.dirname(dataDir), { recursive: true, force: true }))

describe('restoreData', () => {
  it('writes both files the way the app saves them', () => {
    fs.writeFileSync(path.join(dataDir, 'assets.json'), '[]\n')
    fs.writeFileSync(path.join(dataDir, 'transactions.json'), '[]\n')

    restore({ assets, transactions })

    expect(read(dataDir, 'assets.json')).toBe(JSON.stringify(assets, null, 2) + '\n')
    expect(read(dataDir, 'transactions.json')).toBe(JSON.stringify(transactions, null, 2) + '\n')
    expect(fs.readdirSync(dataDir).sort()).toEqual(['assets.json', 'transactions.json'])
  })

  it('keeps what it replaces, even a broken JSON', () => {
    fs.writeFileSync(path.join(dataDir, 'assets.json'), '[]\n')
    fs.writeFileSync(path.join(dataDir, 'transactions.json'), '[{ "id": "a", broken')

    const keptIn = restore({ assets, transactions })

    expect(keptIn).toBe(path.join(safetyDir, 'before-restore-2026-11-05T14-30-59'))
    expect(read(keptIn, 'transactions.json')).toBe('[{ "id": "a", broken')
    expect(read(keptIn, 'assets.json')).toBe('[]\n')
  })

  it('restores into a folder with no files', () => {
    restore({ assets, transactions })
    expect(JSON.parse(read(dataDir, 'transactions.json'))).toEqual(transactions)
  })

  it('writes nothing when the backup is not valid', () => {
    fs.writeFileSync(path.join(dataDir, 'transactions.json'), '[]\n')
    const orphan = { assets: [], transactions }

    expect(() => restore(orphan)).toThrow('No se puede restaurar')
    expect(read(dataDir, 'transactions.json')).toBe('[]\n')
    expect(fs.existsSync(safetyDir)).toBe(false)
  })
})
