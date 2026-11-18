import { CASH_COLOR } from './colors.js'

const OTHERS_COLOR = '#d1d5db'
export const TOP_ALLOCATION_ITEMS = 5

// Below this a position counts as closed (absorbs floating point leftovers).
const EPSILON = 1e-9
// Half a cent: cash below this is treated as zero.
const CASH_EPSILON = 0.005

// Quantities keep 8 decimals (a satoshi), as much as exchanges and brokers show. Rounding
// drops floating point leftovers like 2.20889 - 2 = 0.2088899999999998.
export const roundQuantity = (value) => Math.round(value * 1e8) / 1e8

// Dollar prices keep 4 decimals: a hundredth of a cent.
const roundPrice = (value) => Math.round(value * 1e4) / 1e4

// An order placed in Argentina in pesos, for a CEDEAR or a local share, as a trade in
// shares of the US-listed stock (or ADR) and dollars: `units` at `arsPrice` pesos each,
// with `ratio` units per share and the CCL dollar of that day (`ccl`, pesos per dollar),
// the one CEDEARs are priced with. `arsFee` is the commission in pesos.
export function fromPesos({ units, arsPrice, arsFee = 0, ratio, ccl }) {
  return {
    quantity: roundQuantity(units / ratio),
    price: roundPrice((arsPrice * ratio) / ccl),
    fee: roundPrice(arsFee / ccl),
  }
}

// The way back: how many local units (CEDEARs, local shares) `quantity` shares are. Shares
// keep 8 decimals, so multiplying by the ratio brings back a leftover (0.69444444 × 144 =
// 99.99999936): 4 decimals drop it for any real ratio.
export const toLocalUnits = (quantity, ratio) => Math.round(quantity * ratio * 1e4) / 1e4

// A trade's quantity, unit price and total are tied (total = quantity × price). Given two
// of them, this is `field`, the third; null while the other two aren't both positive.
// The price keeps 8 decimals, so quantity × price gives back the total paid, and cheap
// coins don't round to 0.
export function deriveTradeField(field, { quantity, price, total }) {
  const derive = {
    total: () => Math.round(quantity * price * 100) / 100,
    price: () => Math.round((total / quantity) * 1e8) / 1e8,
    quantity: () => roundQuantity(total / price),
  }
  const value = derive[field]()
  return Number.isFinite(value) && value > 0 ? value : null
}

// New shares per old share of a split: 4 for a 4:1 split, 0.1 for a 1:10 reverse split.
export const splitRatio = (split) => split.newShares / split.oldShares

export const CASH_SYMBOL = 'USD'
// Pegged to the dollar: crypto sales can pay out in it instead of cash.
export const STABLECOIN = 'USDT'

export const ASSET_TYPES = ['crypto', 'stock', 'cash']

// The views of the dashboard: the table tabs, which also filter both charts.
// Cash goes with stocks; USDT is crypto, so it stays with crypto.
export const ASSET_GROUPS = [
  { key: 'all', label: 'Todo', types: ASSET_TYPES },
  { key: 'crypto', label: 'Criptomonedas', types: ['crypto'] },
  { key: 'stock', label: 'Acciones', types: ['stock', 'cash'] },
]

export const getGroupTypes = (groupKey) => ASSET_GROUPS.find((group) => group.key === groupKey).types

// Cash is not in assets.json: it's derived from the transactions like any holding.
const CASH_ASSET = {
  symbol: CASH_SYMBOL,
  name: 'Dólares (efectivo)',
  type: 'cash',
  category: 'Efectivo',
  color: CASH_COLOR,
  price: 1,
  change24h: 0,
  avgCost: 1,
  realized: 0,
}

// Dates sort as text: a day without a time ('YYYY-MM-DD', start of day) goes before that
// day's timed ones ('YYYY-MM-DDTHH:mm'). Stable, so ties keep the order they were added in.
const byDate = (a, b) => a.date.localeCompare(b.date)

// The USDT side of a trade settled in USDT, or null if it settles in dollars:
// - a sale paid out in USDT (`proceeds: 'usdt'`) receives its net as a USDT buy;
// - a buy paid with USDT (`funding: 'usdt'`) spends its total as a USDT sale.
// Neither side moves cash or counts as new money (`funding: 'sale'`, `proceeds: 'purchase'`).
function stablecoinLeg(transaction) {
  const gross = transaction.quantity * transaction.price
  const fee = transaction.fee ?? 0

  if (transaction.type === 'sell' && transaction.proceeds === 'usdt') {
    return { type: 'buy', quantity: gross - fee, funding: 'sale' }
  }
  if (transaction.type === 'buy' && transaction.funding === 'usdt') {
    return { type: 'sell', quantity: gross + fee, proceeds: 'purchase' }
  }
  return null
}

// A trade settled in USDT is saved as one transaction, but the books read it as
// that trade plus its USDT side at $1 (`sourceId` points back to the trade).
// Anything that replays holdings works on this expanded list.
export function expandTransactions(transactions) {
  return transactions.flatMap((transaction) => {
    const leg = stablecoinLeg(transaction)
    if (!leg) return [transaction]

    const derived = {
      id: `${transaction.id}:usdt`,
      sourceId: transaction.id,
      sourceSymbol: transaction.symbol,
      date: transaction.date,
      symbol: STABLECOIN,
      price: 1,
      fee: 0,
      ...leg,
    }
    return [transaction, derived]
  })
}

// The symbols the transactions rely on, including the asset that generated an income
// and the USDT side of trades settled in it. An asset in this set can't leave the
// catalog. USDT always counts: the market search can't add it back.
export function usedSymbols(savedTransactions) {
  const used = new Set([STABLECOIN])
  for (const { symbol, source } of expandTransactions(savedTransactions)) {
    if (symbol) used.add(symbol)
    if (source) used.add(source)
  }
  return used
}

// Signed effect of a transaction on the USD cash balance. Sells credit cash
// unless paid out otherwise; buys only debit it when paid with cash (`funding: 'cash'`).
// Income (dividends, interest, staking) credits its `amount` when paid in cash.
export function cashImpact(transaction) {
  const gross = transaction.quantity * transaction.price
  const fee = transaction.fee ?? 0

  switch (transaction.type) {
    case 'deposit':
      return transaction.amount
    case 'withdrawal':
      return -transaction.amount
    case 'sell':
      return (transaction.proceeds ?? 'cash') === 'cash' ? gross - fee : 0
    case 'buy':
      return transaction.funding === 'cash' ? -(gross + fee) : 0
    case 'income':
      return transaction.amount ?? 0
    default:
      return 0
  }
}

// Signed effect of a transaction on the quantity held of its symbol.
// Income paid in kind has a `quantity`; paid in cash it has an `amount` instead.
// A split changes the quantity in proportion to what's held, so it's 0 here and
// buildLedger and replayValue apply it themselves.
export function quantityImpact(transaction) {
  if (transaction.type === 'sell') return -transaction.quantity
  if (transaction.type === 'buy' || transaction.type === 'income') return transaction.quantity ?? 0
  return 0
}

// Net money brought in from outside: deposits, minus withdrawals, plus buys
// paid with new money (buys without `funding` count as new money).
export function getContributions(transactions) {
  return transactions.reduce((sum, transaction) => {
    if (transaction.type === 'deposit') return sum + transaction.amount
    if (transaction.type === 'withdrawal') return sum - transaction.amount
    if (transaction.type === 'buy' && (transaction.funding ?? 'external') === 'external') {
      return sum + transaction.quantity * transaction.price + (transaction.fee ?? 0)
    }
    return sum
  }, 0)
}

// Cash movements in date order, each with its signed `cashAmount` and the balance after it.
export function buildCashLedger(transactions) {
  let balance = 0

  return [...transactions]
    .sort(byDate)
    .filter((transaction) => cashImpact(transaction) !== 0)
    .map((transaction) => {
      const cashAmount = cashImpact(transaction)
      balance += cashAmount
      return { ...transaction, cashAmount, balanceAfter: balance }
    })
}

// Replays one asset's transactions in date order. Each row carries the position
// after it (`quantityAfter`, `avgCostAfter`) and, for sells, the realized result.
// Income paid in kind adds units at cost 0, so it lowers the PPC. A split multiplies
// the quantity and divides the PPC by its ratio: the money invested stays the same.
export function buildLedger(transactions) {
  let quantity = 0
  let avgCost = 0

  return [...transactions]
    .sort(byDate)
    .map((transaction) => {
      const fee = transaction.fee ?? 0
      let realized = null

      if (transaction.type === 'split') {
        quantity = roundQuantity((quantity * transaction.newShares) / transaction.oldShares)
        avgCost = (avgCost * transaction.oldShares) / transaction.newShares
      } else if (transaction.type === 'sell') {
        realized = (transaction.price - avgCost) * transaction.quantity - fee
        quantity = roundQuantity(quantity - transaction.quantity)
      } else if (quantityImpact(transaction)) {
        const cost = transaction.type === 'buy' ? transaction.price * transaction.quantity + fee : 0
        const totalCost = avgCost * quantity + cost
        quantity = roundQuantity(quantity + transaction.quantity)
        avgCost = totalCost / quantity
      }

      return { ...transaction, realized, quantityAfter: quantity, avgCostAfter: avgCost }
    })
}

const transactionsOf = (transactions, symbol) => transactions.filter((transaction) => transaction.symbol === symbol)

// Derives quantity, average cost (PPC), realized result and income paid in cash per
// asset from the transaction log. Assets without transactions are left out.
function buildPositions(assets, transactions) {
  return assets.flatMap((asset) => {
    const ledger = buildLedger(transactionsOf(transactions, asset.symbol))
    if (!ledger.length) return []

    const last = ledger.at(-1)
    return {
      ...asset,
      quantity: last.quantityAfter,
      avgCost: last.avgCostAfter,
      realized: ledger.reduce((sum, row) => sum + (row.realized ?? 0), 0),
      income: ledger.reduce((sum, row) => sum + (row.type === 'income' ? cashImpact(row) : 0), 0),
      lastDate: last.date,
    }
  })
}

// The open positions. Cash is appended as one more holding once it has any movement.
export function buildHoldings(assets, savedTransactions) {
  const transactions = expandTransactions(savedTransactions)
  const holdings = buildPositions(assets, transactions).filter((position) => position.quantity > EPSILON)

  const cashLedger = buildCashLedger(transactions)
  if (!cashLedger.length) return holdings

  return [...holdings, { ...CASH_ASSET, quantity: Math.max(cashLedger.at(-1).balanceAfter, 0) }]
}

// Assets that had transactions but are no longer held (sold out), with quantity 0,
// the realized result and income they left, and the date of their last transaction (`lastDate`).
export function buildClosedPositions(assets, savedTransactions) {
  return buildPositions(assets, expandTransactions(savedTransactions))
    .filter((position) => position.quantity <= EPSILON)
    .map((position) => ({ ...position, quantity: 0 }))
}

// What the historic gain is made of: the unrealized result of what is held, the realized
// result of every sale and the income paid in cash. Income paid in kind (cost 0) is
// part of the unrealized result. `assets` comes from getAssetsWithMetrics.
export function getResults(assets, closedPositions) {
  const positions = [...assets, ...closedPositions]
  return {
    unrealized: assets.reduce((sum, asset) => sum + asset.gain, 0),
    realized: positions.reduce((sum, position) => sum + position.realized, 0),
    income: positions.reduce((sum, position) => sum + (position.income ?? 0), 0),
  }
}

// Returns why the transaction log is inconsistent, or null if it's fine.
// Replays in date order, so a backdated transaction is checked where it falls.
export function findLedgerError(savedTransactions) {
  const transactions = expandTransactions(savedTransactions)
  const symbols = new Set(transactions.filter(quantityImpact).map((transaction) => transaction.symbol))
  const oversold = [...symbols].find((symbol) =>
    buildLedger(transactionsOf(transactions, symbol)).some((row) => row.quantityAfter < -EPSILON),
  )
  if (oversold) return `no alcanzan los ${oversold} que tenías en esa fecha para cubrir una venta o un pago`

  if (buildCashLedger(transactions).some((row) => row.balanceAfter < -CASH_EPSILON)) {
    return 'el efectivo quedaría en negativo (no alcanza el saldo en esa fecha)'
  }

  return null
}

export function applyQuotes(assets, quotes) {
  return assets.map((asset) => {
    const quote = quotes[asset.symbol]
    return quote ? { ...asset, price: quote.price, change24h: quote.change24h } : asset
  })
}

export function getAssetsWithMetrics(assets) {
  const withValues = assets.map((asset) => {
    const value = asset.price * asset.quantity
    const cost = asset.avgCost * asset.quantity
    const gain = value - cost

    return { ...asset, value, cost, gain, gainPercent: cost ? (gain / cost) * 100 : 0 }
  })

  const total = withValues.reduce((sum, asset) => sum + asset.value, 0)

  return withValues.map((asset) => ({ ...asset, weight: total ? (asset.value / total) * 100 : 0 }))
}

export const sumValues = (assets) => assets.reduce((sum, asset) => sum + asset.value, 0)

export const filterByGroup = (assets, groupKey) =>
  assets.filter((asset) => getGroupTypes(groupKey).includes(asset.type))

// The gain is measured against the money put in, so it covers both
// realized results (now sitting in cash) and unrealized ones. Its % needs the date
// of every contribution: see `lifetimeReturn` and `annualizedReturn` in history.js.
export function getTotals(assets, contributions) {
  const value = sumValues(assets)

  return { value, contributions, gain: value - contributions }
}

// How much the value of what is held changed today, from each asset's `change24h` (crypto:
// the last 24 hours; stocks: since the previous close): `{ amount, percent }`, the percent
// over what it was all worth before. Cash doesn't change. `assets` comes from getAssetsWithMetrics.
export function getDayChange(assets) {
  const previous = assets.reduce((sum, asset) => {
    const change = asset.change24h ?? 0
    // Down 100% leaves nothing to tell what it was worth before.
    return sum + (change > -100 ? asset.value / (1 + change / 100) : asset.value)
  }, 0)
  const amount = sumValues(assets) - previous
  return { amount, percent: previous > 0 ? (amount / previous) * 100 : 0 }
}

// True when grouping would actually hide something: a single leftover asset
// is shown on its own instead of as a one-item "Otros".
export const canGroupAllocation = (assets) => assets.length > TOP_ALLOCATION_ITEMS + 1

// With `grouped`, everything past the top TOP_ALLOCATION_ITEMS is summed into
// "Otros", which keeps the hidden slices in `members`. Each slice uses its
// asset's own color, the same as its icon in the table.
export function getAllocation(assets, { grouped = true } = {}) {
  const total = assets.reduce((sum, asset) => sum + asset.value, 0)
  const sorted = [...assets].sort((a, b) => b.value - a.value)

  const toItem = (asset) => ({
    name: asset.symbol,
    value: asset.value,
    weight: total ? (asset.value / total) * 100 : 0,
    color: asset.color,
  })

  if (!grouped || !canGroupAllocation(assets)) return sorted.map(toItem)

  const rest = sorted.slice(TOP_ALLOCATION_ITEMS)
  const restValue = rest.reduce((sum, asset) => sum + asset.value, 0)

  return [
    ...sorted.slice(0, TOP_ALLOCATION_ITEMS).map(toItem),
    {
      name: 'Otros',
      value: restValue,
      weight: total ? (restValue / total) * 100 : 0,
      color: OTHERS_COLOR,
      members: rest.map(toItem),
    },
  ]
}
