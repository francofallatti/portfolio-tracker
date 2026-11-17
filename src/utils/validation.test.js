import { describe, expect, it } from 'vitest'
import { isValidAsset, isValidSnapshot, isValidTransaction, localDay } from './validation.js'

const TODAY = '2026-11-12'
const valid = (transaction) => isValidTransaction(transaction, TODAY)
const buy = { id: 'a', date: '2026-11-10', type: 'buy', symbol: 'BTC', quantity: 1, price: 100, fee: 0 }

describe('localDay', () => {
  it('gives the local day as YYYY-MM-DD', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('isValidTransaction', () => {
  it('accepts every kind of transaction', () => {
    expect(valid(buy)).toBe(true)
    expect(valid({ ...buy, type: 'sell', proceeds: 'usdt', date: '2026-11-10T14:30' })).toBe(true)
    expect(valid({ id: 'b', date: TODAY, type: 'deposit', amount: 50 })).toBe(true)
    expect(valid({ id: 'c', date: TODAY, type: 'income', symbol: 'SPY', amount: 3 })).toBe(true)
    expect(valid({ id: 'd', date: TODAY, type: 'income', symbol: 'NEXO', quantity: 2, source: 'BTC' })).toBe(true)
    expect(valid({ id: 'e', date: TODAY, type: 'split', symbol: 'AAPL', newShares: 4, oldShares: 1 })).toBe(true)
  })

  it('rejects numbers saved as text', () => {
    expect(valid({ ...buy, quantity: '1' })).toBe(false)
    expect(valid({ ...buy, price: '100' })).toBe(false)
    expect(valid({ id: 'b', date: TODAY, type: 'deposit', amount: '50' })).toBe(false)
  })

  it('rejects a fee that is negative or not a number, and accepts none', () => {
    expect(valid({ ...buy, fee: -1 })).toBe(false)
    expect(valid({ ...buy, fee: '1' })).toBe(false)
    expect(valid({ ...buy, fee: undefined })).toBe(true)
  })

  it('rejects a date in the future, in another format or that does not exist', () => {
    expect(valid({ ...buy, date: '2026-11-13' })).toBe(false)
    expect(valid({ ...buy, date: '2026-11-12T23:59' })).toBe(true)
    expect(valid({ ...buy, date: '12/11/2026' })).toBe(false)
    expect(valid({ ...buy, date: '2026-13-01' })).toBe(false)
  })

  it('requires an id and a known type', () => {
    expect(valid({ ...buy, id: undefined })).toBe(false)
    expect(valid({ ...buy, type: 'transfer' })).toBe(false)
  })

  it('rejects income paid both ways, or neither', () => {
    const income = { id: 'c', date: TODAY, type: 'income', symbol: 'SPY' }
    expect(valid({ ...income, amount: 3, quantity: 1 })).toBe(false)
    expect(valid(income)).toBe(false)
  })

  it('rejects a split that changes nothing', () => {
    expect(valid({ id: 'e', date: TODAY, type: 'split', symbol: 'AAPL', newShares: 2, oldShares: 2 })).toBe(false)
  })
})

describe('isValidSnapshot', () => {
  it('accepts a total with or without its split by type', () => {
    expect(isValidSnapshot({ timestamp: '2026-11-12T10:00:00.000Z', value: 10 })).toBe(true)
    expect(isValidSnapshot({ timestamp: '2026-11-12T10:00:00.000Z', value: 10, byType: { crypto: 4, stock: 6 } })).toBe(true)
  })

  it('rejects a bad timestamp or a value that is not a number', () => {
    expect(isValidSnapshot({ timestamp: 'ayer', value: 10 })).toBe(false)
    expect(isValidSnapshot({ timestamp: '2026-11-12T10:00:00.000Z', value: '10' })).toBe(false)
  })
})

describe('isValidAsset', () => {
  const asset = { symbol: 'MELI', name: 'MercadoLibre', type: 'stock', price: 2000, color: '#facc15' }

  it('accepts an asset, with or without its Argentine ratio', () => {
    expect(isValidAsset(asset)).toBe(true)
    expect(isValidAsset({ ...asset, ratio: 120, localSymbol: 'MELI' })).toBe(true)
  })

  it('rejects an unknown type, a color that is not #rrggbb or a ratio that is not positive', () => {
    expect(isValidAsset({ ...asset, type: 'cash' })).toBe(false)
    expect(isValidAsset({ ...asset, color: 'red' })).toBe(false)
    expect(isValidAsset({ ...asset, ratio: 0 })).toBe(false)
  })

  it('rejects an empty name, a category that is not text, a ratio saved as text or a crypto with ratio', () => {
    expect(isValidAsset({ ...asset, name: '' })).toBe(false)
    expect(isValidAsset({ ...asset, category: 5 })).toBe(false)
    expect(isValidAsset({ ...asset, category: '' })).toBe(true)
    expect(isValidAsset({ ...asset, ratio: '120' })).toBe(false)
    expect(isValidAsset({ ...asset, type: 'crypto', ratio: 120 })).toBe(false)
  })
})
