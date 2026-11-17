import {
  ASSET_TYPES,
  cashImpact,
  getContributions,
  getGroupTypes,
  quantityImpact,
  splitRatio,
  sumValues,
} from './portfolio.js'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// The longest range with a point per hour; the hourly series covers this much.
export const HISTORY_HOURS = 30 * 24

// The ranges of the history chart. Up to 30 days the series has a point per hour; the
// longer ones, a point per day since the first transaction.
export const HISTORY_RANGES = [
  { key: '24h', label: '24H', duration: DAY, resolution: 'hour' },
  { key: '7d', label: '7D', duration: 7 * DAY, resolution: 'hour' },
  { key: '30d', label: '30D', duration: 30 * DAY, resolution: 'hour' },
  { key: '90d', label: '90D', duration: 90 * DAY, resolution: 'day' },
  { key: '1y', label: '1A', duration: 365 * DAY, resolution: 'day' },
  { key: 'all', label: 'Todo', duration: Infinity, resolution: 'day' },
]

const roundCents = (value) => Math.round(value * 100) / 100

// A transaction counts from its `date`, in local time: 'YYYY-MM-DDTHH:mm', or 'YYYY-MM-DD'
// when the time of day isn't known, which counts from the start of that day.
export const transactionTime = (date) => new Date(date.length === 10 ? `${date}T00:00` : date).getTime()

// When the portfolio starts: the time of its oldest transaction (Infinity without any).
export const firstTransactionTime = (transactions) =>
  Math.min(...transactions.map((transaction) => transactionTime(transaction.date)))

// A history.json point: the total plus its split by asset type, so each group can plot its own line.
export function buildSnapshot(assets, timestamp) {
  const byType = Object.fromEntries(
    ASSET_TYPES.map((type) => [type, roundCents(sumValues(assets.filter((asset) => asset.type === type)))]),
  )
  return { timestamp, value: roundCents(sumValues(assets)), byType }
}

// The `{ timestamp, value }` series of one group from the saved snapshots.
// Snapshots saved before `byType` existed only have the total, so they only count for "all".
export function getGroupHistory(snapshots, groupKey) {
  if (groupKey === 'all') return snapshots

  const types = getGroupTypes(groupKey)
  return snapshots
    .filter((snapshot) => snapshot.byType)
    .map((snapshot) => ({
      timestamp: snapshot.timestamp,
      value: types.reduce((sum, type) => sum + (snapshot.byType[type] ?? 0), 0),
    }))
}

// The last HISTORY_HOURS hour marks, oldest first. They match the open times of Binance's hourly candles.
export function hourlyTimes(now = Date.now()) {
  const lastHour = Math.floor(now / HOUR) * HOUR
  return Array.from({ length: HISTORY_HOURS }, (_, index) => lastHour - (HISTORY_HOURS - 1 - index) * HOUR)
}

// The day marks (00:00 UTC, oldest first) from the one at or before `from` up to today's.
// They match the open times of Binance's daily candles. Empty when `from` is after `now`.
export function dailyTimes(from, now = Date.now()) {
  if (!(from <= now)) return []
  const first = Math.floor(from / DAY) * DAY
  const last = Math.floor(now / DAY) * DAY
  return Array.from({ length: (last - first) / DAY + 1 }, (_, index) => first + index * DAY)
}

// The times a series is rebuilt over: the last HISTORY_HOURS hours, or every day since `from`.
export const historyTimes = (resolution, from, now = Date.now()) =>
  resolution === 'day' ? dailyTimes(from, now) : hourlyTimes(now)

// The price at each of `times` (ascending), as Map(time → price): the last of `points`
// (`{ time, price }`, any order) at or before it, or the first one for times before them all.
// Stocks only have points while the market is open, so their price holds overnight and on weekends.
export function alignPrices(points, times) {
  const sorted = [...points].sort((a, b) => a.time - b.time)
  const prices = new Map()
  if (!sorted.length) return prices

  let next = 0
  for (const time of times) {
    while (next < sorted.length && sorted[next].time <= time) next++
    prices.set(time, sorted[Math.max(next - 1, 0)].price)
  }
  return prices
}

// Money that entered the part of the portfolio made of `symbols` (plus cash, with `withCash`)
// from outside it: from outside the portfolio (deposits, buys with new money) or from the
// rest of it (cash spent on crypto enters crypto and leaves cash). Over the whole portfolio
// it adds up to getContributions. Income is gain, never a flow, and a split moves no money.
// Takes expanded transactions, so a trade settled in USDT nets out against its USDT side.
export function flowInto(transaction, { symbols, withCash = false }) {
  if (transaction.type === 'income' || transaction.type === 'split') return 0
  const cash = withCash ? cashImpact(transaction) : 0
  if (!symbols.includes(transaction.symbol)) return cash

  const gross = transaction.quantity * transaction.price
  const fee = transaction.fee ?? 0
  return cash + (transaction.type === 'buy' ? gross + fee : fee - gross)
}

// The money flowing into a group (flowInto), as `{ time, amount }`. Transactions that move none are left out.
export const groupFlows = (transactions, scope) =>
  transactions
    .map((transaction) => ({ time: transactionTime(transaction.date), amount: flowInto(transaction, scope) }))
    .filter((flow) => flow.amount !== 0)

// The chart's "Aportado" line at `time`: the flows up to then.
export const contributedUntil = (flows, time) =>
  flows.filter((flow) => flow.time <= time).reduce((sum, flow) => sum + flow.amount, 0)

// The return between two `{ time, value }` points, in % (Modified Dietz): the gain (change in
// value minus the money that came in) over the average capital at work, where each flow counts
// for the share of the period it was invested. Only flows in (start, end] count. With nothing
// invested at the start, the period begins with the first flow. Null with no capital to measure.
export function periodReturn(start, end, flows) {
  const inside = flows.filter((flow) => flow.time > start.time && flow.time <= end.time)
  const from = start.value > 0 || !inside.length ? start.time : Math.min(...inside.map((flow) => flow.time))
  const span = end.time - from
  if (span <= 0) return null

  const net = inside.reduce((sum, flow) => sum + flow.amount, 0)
  const capital = inside.reduce((sum, flow) => sum + (flow.amount * (end.time - flow.time)) / span, start.value)
  return capital > 0 ? ((end.value - start.value - net) / capital) * 100 : null
}

// The money brought into the whole portfolio from outside (getContributions), as
// `{ time, amount }`: withdrawals are negative. Takes the saved transactions.
export const portfolioFlows = (transactions) =>
  transactions
    .map((transaction) => ({ time: transactionTime(transaction.date), amount: getContributions([transaction]) }))
    .filter((flow) => flow.amount !== 0)

// The gain up to `end` (`{ time, value }`) over the most that was ever put in (the peak
// of the net contributions), in %. Without withdrawals that is gain / contributions.
// Dividing by the net contributions instead would inflate it after a withdrawal, and
// fail once more was taken out than put in. It isn't weighted by time (periodReturn is):
// over a long history with most of the money put in recently, the average capital is
// small and the % reads far worse or better than what was actually won or lost.
// Null without any money put in.
export function lifetimeReturn(flows, end) {
  const past = flows.filter((flow) => flow.time <= end.time).sort((a, b) => a.time - b.time)
  let net = 0
  let peak = 0
  for (const flow of past) {
    net += flow.amount
    peak = Math.max(peak, net)
  }
  return peak > 0 ? ((end.value - net) / peak) * 100 : null
}

const YEAR = 365 * 24 * 60 * 60 * 1000

// The yearly rate that turns the flows into `end.value` at `end.time` (XIRR, the
// money-weighted return), in %: every flow compounds at it from its date. Null with
// less than a year of history, where annualizing would extrapolate a short streak,
// and when no rate explains the flows.
export function annualizedReturn(flows, end) {
  const past = flows.filter((flow) => flow.time <= end.time)
  if (!past.length || end.time - Math.min(...past.map((flow) => flow.time)) < YEAR) return null

  // What the flows would be worth at `end` growing at `rate`, against what they are worth.
  const excess = (rate) =>
    past.reduce((sum, flow) => sum + flow.amount * (1 + rate) ** ((end.time - flow.time) / YEAR), 0) - end.value

  let low = -0.999999
  let high = 1
  while (excess(low) * excess(high) > 0 && high < 1e6) high *= 2
  if (excess(low) * excess(high) > 0) return null

  // Bisection: slower than Newton, but it can't diverge.
  for (let step = 0; step < 100; step++) {
    const middle = (low + high) / 2
    if (excess(low) * excess(middle) <= 0) high = middle
    else low = middle
  }
  return ((low + high) / 2) * 100
}

// The buys and sells of one asset (its transactions, in any order) as marks for its price
// chart, oldest first: `{ id, type, time, price, transaction }`. Past prices come
// split-adjusted, so `price` is too: what was paid, divided by the ratio of every later split.
export function tradeMarkers(transactions) {
  const events = transactions
    .map((transaction) => ({ transaction, time: transactionTime(transaction.date) }))
    .sort((a, b) => a.time - b.time)
  const markers = []
  let laterSplits = 1

  for (const { transaction, time } of events.reverse()) {
    if (transaction.type === 'split') laterSplits *= splitRatio(transaction)
    if (transaction.type !== 'buy' && transaction.type !== 'sell') continue
    markers.push({ id: transaction.id, type: transaction.type, time, price: transaction.price / laterSplits, transaction })
  }
  return markers.reverse()
}

// Rebuilds a `{ timestamp, value }` series over `times` (ascending): at each time,
// the quantities of `symbols` held according to the transactions dated up to
// then, valued with `priceAt(symbol, time)`. With `withCash`, the cash balance
// adds at face value.
// Prices come split-adjusted (Yahoo's are, and so is today's price), so quantities
// count in post-split shares: each transaction's, times the ratio of every later split.
export function replayValue(transactions, { symbols, withCash = false }, times, priceAt) {
  const events = transactions
    .map((transaction) => ({ transaction, time: transactionTime(transaction.date), factor: 1 }))
    .sort((a, b) => a.time - b.time)
  const laterSplits = new Map()
  for (const event of [...events].reverse()) {
    const { symbol, type } = event.transaction
    event.factor = laterSplits.get(symbol) ?? 1
    if (type === 'split') laterSplits.set(symbol, event.factor * splitRatio(event.transaction))
  }
  const quantities = new Map()
  let cash = 0
  let next = 0

  return times.map((time) => {
    for (; next < events.length && events[next].time <= time; next++) {
      const { transaction, factor } = events[next]
      if (withCash) cash += cashImpact(transaction)
      if (symbols.includes(transaction.symbol)) {
        const quantity = quantityImpact(transaction) * factor
        quantities.set(transaction.symbol, (quantities.get(transaction.symbol) ?? 0) + quantity)
      }
    }

    let value = cash
    for (const [symbol, quantity] of quantities) value += Math.max(quantity, 0) * priceAt(symbol, time)
    return { timestamp: new Date(time).toISOString(), value }
  })
}
