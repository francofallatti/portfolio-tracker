// The backup: the catalog and every transaction in one CSV the app can read back,
// so a broken JSON or a dead disk has a restore point.
import { findLedgerError } from './portfolio.js'
import { isValidAsset, isValidTransaction, localDay } from './validation.js'

// One row per item; `record` says which kind. Assets go first, then transactions, both in
// the order they are saved (two orders with the same date count in insertion order).
// The last row is `end` with how many items came before it: a file cut short (a download
// or a sync that didn't finish) is missing it, and would otherwise restore half the history.
const ASSET_FIELDS = ['symbol', 'name', 'type', 'category', 'color', 'price', 'change24h', 'ratio', 'localSymbol']
const TRANSACTION_FIELDS = [
  'id',
  'date',
  'type',
  'symbol',
  'quantity',
  'price',
  'fee',
  'funding',
  'proceeds',
  'amount',
  'newShares',
  'oldShares',
  'source',
]
const RECORDS = { asset: ASSET_FIELDS, transaction: TRANSACTION_FIELDS }
const COLUMNS = ['record', ...new Set([...TRANSACTION_FIELDS, ...ASSET_FIELDS])]
const NUMERIC = new Set(['quantity', 'price', 'fee', 'amount', 'newShares', 'oldShares', 'change24h', 'ratio'])
const NUMBER = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i
// The mark some editors put at the start of a UTF-8 file.
const BOM = 0xfeff
const END = 'end'
const INCOMPLETE = 'El archivo está incompleto: no llega hasta el final del backup'

// A missing field is an empty cell and an empty text is `""`, so the two come back apart.
function toCell(value, field) {
  if (value === undefined) return ''
  if (NUMERIC.has(field) ? !Number.isFinite(value) : typeof value !== 'string') {
    throw new Error(`No se puede exportar "${field}": tiene un valor que el backup no sabe guardar`)
  }
  const text = String(value)
  return text === '' || /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function toRow(record, item) {
  const unknown = Object.keys(item).find((field) => !RECORDS[record].includes(field))
  // Dropping a field the backup doesn't know would lose data without anyone noticing.
  if (unknown) throw new Error(`No se puede exportar: el backup no conoce el campo "${unknown}"`)
  return COLUMNS.map((column) => (column === 'record' ? record : toCell(item[column], column))).join(',')
}

export function toBackupCsv({ assets, transactions }) {
  const rows = [
    COLUMNS.join(','),
    ...assets.map((asset) => toRow('asset', asset)),
    ...transactions.map((transaction) => toRow('transaction', transaction)),
    COLUMNS.map((column) => ({ record: END, id: assets.length + transactions.length })[column] ?? '').join(','),
  ]
  return rows.join('\r\n') + '\r\n'
}

export const backupFileName = (date = new Date()) => `portfolio-backup-${localDay(date)}.csv`

// Splits the text into rows of `{ text, quoted }` cells. Quoted cells keep commas, quotes and line breaks.
function readCells(text) {
  const rows = []
  let row = []
  let cell = { text: '', quoted: false }
  let inQuotes = false

  const endCell = () => {
    row.push(cell)
    cell = { text: '', quoted: false }
  }
  const endRow = () => {
    endCell()
    // A blank line (the one after the last row) is not a record.
    if (row.length > 1 || row[0].text || row[0].quoted) rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inQuotes) {
      if (char !== '"') cell.text += char
      else if (text[index + 1] === '"') {
        cell.text += '"'
        index += 1
      } else inQuotes = false
    } else if (char === '"' && cell.text === '') {
      inQuotes = true
      cell.quoted = true
    } else if (char === ',') endCell()
    else if (char === '\n') endRow()
    else if (char !== '\r') cell.text += char
  }
  if (inQuotes) throw new Error(INCOMPLETE)
  endRow()
  return rows
}

function fromCell({ text, quoted }, field, line) {
  if (!NUMERIC.has(field)) return text
  if (quoted || !NUMBER.test(text)) throw new Error(`Línea ${line}: "${text}" no es un número válido para "${field}"`)
  return Number(text)
}

// Reads a backup back into `{ assets, transactions }`. Throws with the line that is wrong.
// It only rebuilds what the file says: `findBackupError` decides whether it can be restored.
export function parseBackupCsv(text) {
  const [header, ...rows] = readCells(text.charCodeAt(0) === BOM ? text.slice(1) : text)
  const columns = header?.map((cell) => cell.text) ?? []
  if (!COLUMNS.every((column) => columns.includes(column))) {
    throw new Error(
      'No es un backup de Portfolio Tracker: faltan columnas. Si lo abriste y guardaste con Excel, usá el archivo original.',
    )
  }

  const end = rows.pop()
  const cellOf = (cells, column) => cells[columns.indexOf(column)]?.text
  if (!end || cellOf(end, 'record') !== END || cellOf(end, 'id') !== String(rows.length)) throw new Error(INCOMPLETE)

  const backup = { assets: [], transactions: [] }
  rows.forEach((cells, index) => {
    const line = index + 2
    // A decimal comma (a file saved by a spreadsheet) shifts every cell after it.
    if (cells.length !== columns.length) {
      throw new Error(`Línea ${line}: tiene ${cells.length} columnas y el encabezado ${columns.length}`)
    }
    const record = cellOf(cells, 'record')
    const fields = RECORDS[record]
    if (!fields) throw new Error(`Línea ${line}: "${record ?? ''}" no es un tipo de registro conocido`)

    const item = {}
    columns.forEach((column, position) => {
      const cell = cells[position]
      if (column === 'record' || !cell || (cell.text === '' && !cell.quoted)) return
      // A value under a column the backup doesn't know is ignored; under one of the other record, it's a mistake.
      if (!fields.includes(column)) {
        if (COLUMNS.includes(column)) throw new Error(`Línea ${line}: "${column}" no va en un registro "${record}"`)
        return
      }
      item[column] = fromCell(cell, column, line)
    })
    // Keys in the order the app saves them, so a restored file reads like the original.
    const ordered = Object.fromEntries(fields.filter((field) => field in item).map((field) => [field, item[field]]))
    backup[record === 'asset' ? 'assets' : 'transactions'].push(ordered)
  })
  return backup
}

const firstRepeated = (values) => values.find((value, index) => values.indexOf(value) !== index)

// Why this backup can't replace the data, or null. The same rules the write endpoints apply
// one item at a time, over the whole set.
export function findBackupError({ assets, transactions }, today = localDay()) {
  if (!Array.isArray(assets) || !Array.isArray(transactions)) return 'el backup no tiene activos y transacciones'

  const badAsset = assets.find((asset) => !isValidAsset(asset))
  if (badAsset) return `el activo ${badAsset.symbol ?? '(sin símbolo)'} tiene datos inválidos`
  const badTransaction = transactions.find((transaction) => !isValidTransaction(transaction, today))
  if (badTransaction) return `la transacción ${badTransaction.id ?? '(sin id)'} tiene datos inválidos`

  const repeatedSymbol = firstRepeated(assets.map((asset) => asset.symbol))
  if (repeatedSymbol) return `el activo ${repeatedSymbol} está repetido`
  const repeatedId = firstRepeated(transactions.map((transaction) => transaction.id))
  if (repeatedId) return `la transacción ${repeatedId} está repetida`

  const symbols = new Set(assets.map((asset) => asset.symbol))
  const orphan = transactions
    .flatMap((transaction) => [transaction.symbol, transaction.source])
    .find((symbol) => symbol !== undefined && !symbols.has(symbol))
  if (orphan) return `hay transacciones de ${orphan}, que no está entre los activos del backup`

  return findLedgerError(transactions)
}

const sameItem = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

function compare(current, restored, key) {
  const before = new Map(current.map((item) => [item[key], item]))
  const after = new Set(restored.map((item) => item[key]))
  return {
    total: restored.length,
    added: restored.filter((item) => !before.has(item[key])).length,
    changed: restored.filter((item) => before.has(item[key]) && !sameItem(item, before.get(item[key]))).length,
    removed: current.filter((item) => !after.has(item[key])).length,
  }
}

// What restoring `backup` over `current` would do, to show before confirming.
export const summarizeRestore = (current, backup) => ({
  assets: compare(current.assets, backup.assets, 'symbol'),
  transactions: compare(current.transactions, backup.transactions, 'id'),
})
