import { describe, expect, it } from 'vitest'
import { backupFileName, findBackupError, parseBackupCsv, summarizeRestore, toBackupCsv } from './backup.js'

const TODAY = '2026-11-12'

const assets = [
  { symbol: 'USDT', name: 'Tether', type: 'crypto', category: 'Stablecoin', color: '#2dd4bf', price: 1, change24h: 0.01 },
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto', category: '', color: '#818cf8', price: 2000, change24h: -1.5 },
  { symbol: 'NEXO', name: 'Nexo', type: 'crypto', color: '#60a5fa', price: 1.25, change24h: 0 },
  {
    symbol: 'YPF',
    name: 'YPF S.A., "la petrolera"',
    type: 'stock',
    category: 'Energy',
    color: '#38bdf8',
    price: 30,
    change24h: 2,
    ratio: 10,
    localSymbol: 'YPFD',
  },
]

// One of every shape a transaction can have.
const transactions = [
  { id: 'dep-1', date: '2026-01-05', type: 'deposit', amount: 5000 },
  { id: 'buy-1', date: '2026-01-06', type: 'buy', symbol: 'ETH', quantity: 0.12345678, price: 2500, fee: 0.5, funding: 'cash' },
  { id: 'buy-2', date: '2026-01-07T14:30', type: 'buy', symbol: 'YPF', quantity: 15, price: 28.5, fee: 0, funding: 'external' },
  { id: 'split-1', date: '2026-02-01', type: 'split', symbol: 'YPF', newShares: 4, oldShares: 1 },
  { id: 'sell-1', date: '2026-03-01', type: 'sell', symbol: 'ETH', quantity: 0.1, price: 3600, fee: 0.1, proceeds: 'usdt' },
  { id: 'buy-3', date: '2026-03-02', type: 'buy', symbol: 'NEXO', quantity: 100, price: 1.2, fee: 0, funding: 'usdt' },
  { id: 'inc-1', date: '2026-04-01', type: 'income', symbol: 'YPF', amount: 3.5 },
  { id: 'inc-2', date: '2026-04-02', type: 'income', symbol: 'NEXO', quantity: 0.00000012, source: 'ETH' },
  { id: 'wd-1', date: '2026-05-01', type: 'withdrawal', amount: 100 },
]

const data = { assets, transactions }

describe('toBackupCsv / parseBackupCsv', () => {
  it('rebuilds exactly what was exported', () => {
    expect(parseBackupCsv(toBackupCsv(data))).toEqual(data)
  })

  it('keeps the order of the items and of their fields', () => {
    const restored = parseBackupCsv(toBackupCsv(data))
    expect(JSON.stringify(restored)).toBe(JSON.stringify(data))
  })

  it('tells an empty text from a missing field', () => {
    const [, eth, nexo] = parseBackupCsv(toBackupCsv(data)).assets
    expect(eth.category).toBe('')
    expect('category' in nexo).toBe(false)
  })

  it('keeps numbers as numbers, with every decimal', () => {
    const restored = parseBackupCsv(toBackupCsv(data)).transactions
    expect(restored[1].quantity).toBe(0.12345678)
    expect(restored[2].fee).toBe(0)
    expect(restored[7].quantity).toBe(0.00000012)
  })

  it('reads a file with a BOM, Unix line endings and no final line break', () => {
    const csv = String.fromCharCode(0xfeff) + toBackupCsv(data).replaceAll('\r\n', '\n').trimEnd()
    expect(parseBackupCsv(csv)).toEqual(data)
  })

  it('exports nothing but the header for an empty portfolio', () => {
    const empty = { assets: [], transactions: [] }
    expect(toBackupCsv(empty).trim().split('\r\n')).toHaveLength(2)
    expect(parseBackupCsv(toBackupCsv(empty))).toEqual(empty)
  })

  it('refuses to export a field or a value it would lose', () => {
    const withNote = { assets, transactions: [{ ...transactions[0], note: 'x' }] }
    expect(() => toBackupCsv(withNote)).toThrow('note')
    const withText = { assets, transactions: [{ ...transactions[0], amount: '5000' }] }
    expect(() => toBackupCsv(withText)).toThrow('amount')
  })

  it('rejects a file that is not a backup', () => {
    expect(() => parseBackupCsv('')).toThrow('No es un backup')
    expect(() => parseBackupCsv('fecha;monto\n2026-01-01;10')).toThrow('No es un backup')
  })

  it('says which line is wrong', () => {
    const lines = toBackupCsv(data).split('\r\n')
    const badNumber = [...lines]
    badNumber[5] = badNumber[5].replace('5000', '5.000,00')
    expect(() => parseBackupCsv(badNumber.join('\r\n'))).toThrow('Línea 6')

    const badRecord = [...lines]
    badRecord[1] = badRecord[1].replace(/^asset/, 'activo')
    expect(() => parseBackupCsv(badRecord.join('\r\n'))).toThrow('Línea 2')
  })

  it('rejects a file that was cut short', () => {
    const csv = toBackupCsv(data)
    const lines = csv.trimEnd().split('\r\n')
    // Cut between two rows, in the middle of the last row and inside a quoted name.
    expect(() => parseBackupCsv(lines.slice(0, -1).join('\r\n'))).toThrow('incompleto')
    expect(() => parseBackupCsv(lines.slice(0, 8).join('\r\n'))).toThrow('incompleto')
    expect(() => parseBackupCsv(csv.slice(0, -25))).toThrow('incompleto')
    expect(() => parseBackupCsv(csv.slice(0, csv.indexOf('la petrolera')))).toThrow('incompleto')
  })

  it('rejects a file with a row removed by hand', () => {
    const lines = toBackupCsv(data).trimEnd().split('\r\n')
    lines.splice(6, 1)
    expect(() => parseBackupCsv(lines.join('\r\n'))).toThrow('incompleto')
  })

  it('rejects a value under a column of the other kind of record', () => {
    const lines = toBackupCsv(data).split('\r\n')
    // An asset row with an id.
    lines[1] = lines[1].replace('asset,', 'asset,abc')
    expect(() => parseBackupCsv(lines.join('\r\n'))).toThrow('"id" no va en un registro "asset"')
  })

  it('ignores columns it does not know', () => {
    const lines = toBackupCsv(data).trimEnd().split('\r\n')
    const csv = lines.map((line, index) => `${line},${index ? 'x' : 'note'}`).join('\r\n')
    expect(parseBackupCsv(csv)).toEqual(data)
  })
})

describe('findBackupError', () => {
  const error = (backup) => findBackupError(backup, TODAY)

  it('accepts a consistent backup', () => {
    expect(error(data)).toBeNull()
    expect(error({ assets: [], transactions: [] })).toBeNull()
  })

  it('rejects invalid items', () => {
    expect(error({ assets: [{ ...assets[0], color: 'red' }], transactions: [] })).toContain('USDT')
    expect(error({ assets, transactions: [{ ...transactions[0], amount: -1 }] })).toContain('dep-1')
    expect(error({ assets, transactions: [{ ...transactions[0], date: '2026-12-01' }] })).toContain('dep-1')
  })

  it('rejects repeated assets and transactions', () => {
    expect(error({ assets: [...assets, assets[1]], transactions })).toContain('ETH está repetido')
    expect(error({ assets, transactions: [...transactions, transactions[0]] })).toContain('dep-1 está repetida')
  })

  it('rejects a transaction whose asset or source is not in the backup', () => {
    const withoutEth = assets.filter((asset) => asset.symbol !== 'ETH')
    expect(error({ assets: withoutEth, transactions: [transactions[0], transactions[1]] })).toContain('ETH')
    expect(error({ assets: withoutEth, transactions: [transactions[7]] })).toContain('ETH')
  })

  it('rejects a history that does not add up', () => {
    const oversold = [{ id: 's', date: '2026-01-01', type: 'sell', symbol: 'ETH', quantity: 1, price: 10, fee: 0 }]
    expect(error({ assets, transactions: oversold })).toContain('ETH')
  })
})

describe('summarizeRestore', () => {
  it('counts what a restore adds, changes and removes', () => {
    const current = {
      assets: [assets[0], { ...assets[1], color: '#000000' }, { ...assets[2], symbol: 'SOL' }],
      transactions: [transactions[0], { ...transactions[1], price: 1 }, { ...transactions[8], id: 'new' }],
    }
    expect(summarizeRestore(current, data)).toEqual({
      assets: { total: 4, added: 2, changed: 1, removed: 1 },
      transactions: { total: 9, added: 7, changed: 1, removed: 1 },
    })
  })

  it('finds nothing to do when the backup matches, whatever the order of the fields', () => {
    const { id, ...rest } = transactions[1]
    const current = { assets, transactions: transactions.map((item) => (item.id === id ? { ...rest, id } : item)) }
    const { transactions: summary } = summarizeRestore(current, data)
    expect(summary).toEqual({ total: 9, added: 0, changed: 0, removed: 0 })
  })
})

describe('backupFileName', () => {
  it('carries the local day', () => {
    expect(backupFileName(new Date(2026, 10, 5, 23, 59))).toBe('portfolio-backup-2026-11-05.csv')
  })
})
