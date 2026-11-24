// What the write endpoints (server/api.js) accept in each JSON document.

// Local date, with the time of day when it's known.
const TRANSACTION_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/
// `#rrggbb`, the only format the native color picker understands.
const HEX_COLOR = /^#[0-9a-f]{6}$/i

// Real numbers only: '5' > 0 is true in JavaScript, but a quantity saved as text breaks the sums.
const isAmount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isPositive = (value) => isAmount(value) && value > 0
const isText = (value) => typeof value === 'string' && value.length > 0
const isOptional = (value, check) => value === undefined || check(value)

// Today as 'YYYY-MM-DD' in local time, the way transactions are dated.
export function localDay(date = new Date()) {
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// A date in one of the two formats that exists and isn't after `today`: a transaction
// dated in the future would count as held now, but the history would ignore it.
const isValidDate = (date, today) =>
  typeof date === 'string' &&
  TRANSACTION_DATE.test(date) &&
  !Number.isNaN(new Date(date.length === 10 ? `${date}T00:00` : date).getTime()) &&
  date.slice(0, 10) <= today

export function isValidTransaction(transaction, today = localDay()) {
  if (!isText(transaction.id) || !isValidDate(transaction.date, today)) return false

  switch (transaction.type) {
    case 'deposit':
    case 'withdrawal':
      return isPositive(transaction.amount)
    // A split turns every `oldShares` held into `newShares`.
    case 'split':
      return (
        isText(transaction.symbol) &&
        isPositive(transaction.newShares) &&
        isPositive(transaction.oldShares) &&
        transaction.newShares !== transaction.oldShares
      )
    // Income is paid either in cash (`amount`, USD) or in kind (`quantity` of `symbol`), never both.
    // `source` (optional) is the asset that generated it, when it was paid in another one.
    case 'income': {
      const { amount, quantity } = transaction
      const inCash = isPositive(amount) && quantity === undefined
      const inKind = isPositive(quantity) && amount === undefined
      return isText(transaction.symbol) && (inCash || inKind) && isOptional(transaction.source, isText)
    }
    case 'buy':
    case 'sell':
      return (
        isText(transaction.symbol) &&
        isPositive(transaction.quantity) &&
        isPositive(transaction.price) &&
        isOptional(transaction.fee, isAmount) &&
        [undefined, 'cash', 'external', 'usdt'].includes(transaction.funding) &&
        [undefined, 'cash', 'usdt'].includes(transaction.proceeds)
      )
    default:
      return false
  }
}

// `byType` (value per asset type) is optional: older snapshots only have the total.
export const isValidSnapshot = (snapshot) =>
  !Number.isNaN(Date.parse(snapshot.timestamp)) &&
  isAmount(snapshot.value) &&
  isOptional(
    snapshot.byType,
    (byType) => byType !== null && typeof byType === 'object' && Object.values(byType).every(isAmount),
  )

// The Finnhub key as text; empty means there is none. Nothing else is kept in the settings.
export const isValidSettings = (settings) =>
  settings !== null &&
  typeof settings === 'object' &&
  Object.keys(settings).join() === 'finnhubKey' &&
  typeof settings.finnhubKey === 'string' &&
  /^[\w-]{0,100}$/.test(settings.finnhubKey)

// A stock also bought in Argentina has the `ratio` of its Argentine units (CEDEARs, or
// local shares per ADR) per share, and `localSymbol` when it trades there under another ticker.
// Only stocks have a ratio.
export const isValidAsset = (asset) =>
  isText(asset.symbol) &&
  isText(asset.name) &&
  ['crypto', 'stock'].includes(asset.type) &&
  isOptional(asset.category, (category) => typeof category === 'string') &&
  isAmount(asset.price) &&
  HEX_COLOR.test(asset.color) &&
  isOptional(asset.ratio, (ratio) => asset.type === 'stock' && isPositive(ratio)) &&
  isOptional(asset.localSymbol, isText)
