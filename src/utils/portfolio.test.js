import { describe, expect, it } from 'vitest'
import {
  buildCashLedger,
  buildClosedPositions,
  buildHoldings,
  buildLedger,
  cashImpact,
  deriveTradeField,
  expandTransactions,
  filterByGroup,
  findLedgerError,
  fromPesos,
  getAllocation,
  getAssetsWithMetrics,
  getContributions,
  getDayChange,
  getResults,
  getTotals,
  toLocalUnits,
  quotedAssets,
  usedSymbols,
} from './portfolio.js'

let nextId = 0
const tx = (fields) => ({ id: `t${++nextId}`, ...fields })
const buy = (symbol, quantity, price, extra = {}) =>
  tx({ date: '2026-10-01', type: 'buy', symbol, quantity, price, fee: 0, funding: 'external', ...extra })
const sell = (symbol, quantity, price, extra = {}) =>
  tx({ date: '2026-10-02', type: 'sell', symbol, quantity, price, fee: 0, ...extra })
const deposit = (amount, date = '2026-10-01') => tx({ date, type: 'deposit', amount })
const withdrawal = (amount, date = '2026-10-01') => tx({ date, type: 'withdrawal', amount })
const split = (symbol, newShares, oldShares, date = '2026-10-05') => tx({ date, type: 'split', symbol, newShares, oldShares })

const CATALOG = [
  { symbol: 'ETH', type: 'crypto', price: 2000, color: '#111111' },
  { symbol: 'BTC', type: 'crypto', price: 50000, color: '#222222' },
  { symbol: 'SOL', type: 'crypto', price: 200, color: '#333333' },
  { symbol: 'USDT', type: 'crypto', price: 1, color: '#444444' },
  { symbol: 'AAPL', type: 'stock', price: 250, color: '#555555' },
]
const holdingOf = (holdings, symbol) => holdings.find((holding) => holding.symbol === symbol)

describe('cashImpact', () => {
  it('moves cash with deposits and withdrawals', () => {
    expect(cashImpact(deposit(100))).toBe(100)
    expect(cashImpact(withdrawal(40))).toBe(-40)
  })

  it('credits the net of a sale, unless it is paid out in USDT', () => {
    expect(cashImpact(sell('ETH', 2, 100, { fee: 5 }))).toBe(195)
    expect(cashImpact(sell('ETH', 2, 100, { fee: 5, proceeds: 'cash' }))).toBe(195)
    expect(cashImpact(sell('ETH', 2, 100, { fee: 5, proceeds: 'usdt' }))).toBe(0)
  })

  it('debits a buy, fee included, only when paid with cash', () => {
    expect(cashImpact(buy('ETH', 2, 100, { fee: 5, funding: 'cash' }))).toBe(-205)
    expect(cashImpact(buy('ETH', 2, 100, { funding: 'external' }))).toBe(0)
    expect(cashImpact(buy('ETH', 2, 100, { funding: 'usdt' }))).toBe(0)
    expect(cashImpact(buy('ETH', 2, 100, { funding: undefined }))).toBe(0)
  })
})

describe('getContributions', () => {
  it('adds deposits and buys with new money, and subtracts withdrawals', () => {
    const transactions = [
      deposit(1000),
      withdrawal(200),
      buy('ETH', 2, 100, { fee: 5 }),
      buy('BTC', 1, 50, { funding: undefined }),
      buy('SOL', 1, 300, { funding: 'cash' }),
      buy('SOL', 1, 300, { funding: 'usdt' }),
    ]
    expect(getContributions(transactions)).toBe(1000 - 200 + 205 + 50)
  })

  it("doesn't count USDT received from a sale", () => {
    const transactions = [buy('ETH', 1, 1000), sell('ETH', 0.5, 2000, { proceeds: 'usdt' })]
    expect(getContributions(expandTransactions(transactions))).toBe(1000)
  })
})

describe('buildLedger', () => {
  it('weighs the average cost (PPC) with fees and keeps it on sells', () => {
    const rows = buildLedger([
      buy('ETH', 1, 100, { fee: 2 }),
      buy('ETH', 3, 200, { fee: 2 }),
      sell('ETH', 2, 250, { fee: 4 }),
    ])

    expect(rows[1].avgCostAfter).toBe(176)
    expect(rows[2]).toMatchObject({ quantityAfter: 2, avgCostAfter: 176, realized: (250 - 176) * 2 - 4 })
    expect(rows[0].realized).toBeNull()
  })

  it('replays by date and keeps insertion order on the same day', () => {
    const first = buy('ETH', 1, 100, { date: '2026-10-05' })
    const second = sell('ETH', 1, 120, { date: '2026-10-05' })
    const earlier = buy('ETH', 1, 90, { date: '2026-09-01' })

    expect(buildLedger([first, second, earlier]).map((row) => row.id)).toEqual([earlier.id, first.id, second.id])
  })

  it('keeps 8 decimals, so selling what is left closes the position', () => {
    const rows = buildLedger([buy('BABA', 2.20889, 100), sell('BABA', 2, 110), sell('BABA', 0.20889, 120)])

    expect(rows[1].quantityAfter).toBe(0.20889)
    expect(rows[2].quantityAfter).toBe(0)
    expect(buildLedger([buy('BTC', 0.12345678, 50000)])[0].quantityAfter).toBe(0.12345678)
  })

  it('orders a day by time of day, with the transactions without one first (start of day)', () => {
    const afternoon = sell('ETH', 1, 120, { date: '2026-10-05T15:00' })
    const morning = buy('ETH', 1, 100, { date: '2026-10-05T09:30' })
    const dayOnly = buy('ETH', 1, 90, { date: '2026-10-05' })

    expect(buildLedger([afternoon, morning, dayOnly]).map((row) => row.id)).toEqual([dayOnly.id, morning.id, afternoon.id])
  })
})

describe('splits', () => {
  it('multiply the quantity and divide the PPC, with no realized result', () => {
    const rows = buildLedger([buy('AAPL', 10, 200, { fee: 20 }), split('AAPL', 4, 1)])

    expect(rows[1]).toMatchObject({ quantityAfter: 40, avgCostAfter: 50.5, realized: null })
  })

  it('also work in reverse (1:10), and later sales use the new PPC', () => {
    const rows = buildLedger([buy('BABA', 100, 2), split('BABA', 1, 10), sell('BABA', 5, 25, { date: '2026-10-06' })])

    expect(rows[1]).toMatchObject({ quantityAfter: 10, avgCostAfter: 20 })
    expect(rows[2]).toMatchObject({ quantityAfter: 5, realized: (25 - 20) * 5 })
  })

  it('move no money: cash, contributions and the money invested stay the same', () => {
    const transactions = [deposit(2000), buy('AAPL', 10, 200, { funding: 'cash' }), split('AAPL', 4, 1)]
    const holding = buildHoldings(CATALOG, transactions).find((item) => item.symbol === 'AAPL')

    expect(cashImpact(transactions[2])).toBe(0)
    expect(getContributions(transactions)).toBe(2000)
    expect(holding.quantity * holding.avgCost).toBe(2000)
  })

  it('count for the sales after them, and only those', () => {
    const transactions = [buy('AAPL', 1, 200), split('AAPL', 4, 1)]

    expect(findLedgerError([...transactions, sell('AAPL', 3, 60, { date: '2026-10-06' })])).toBeNull()
    expect(findLedgerError([...transactions, sell('AAPL', 3, 60, { date: '2026-10-03' })])).toMatch(/AAPL/)
  })
})

describe('fromPesos', () => {
  it('turns CEDEARs bought in pesos into shares and dollars at the CCL', () => {
    // 114 MELI CEDEARs (120 per share) at $22,450 with the CCL at $1,650.
    expect(fromPesos({ units: 114, arsPrice: 22450, arsFee: 1650, ratio: 120, ccl: 1650 })).toEqual({
      quantity: 0.95,
      price: 1632.7273,
      fee: 1,
    })
  })

  it('keeps 8 decimals of shares, so 100 CEDEARs (144 per share) are 0.69444444', () => {
    expect(fromPesos({ units: 100, arsPrice: 2772.5, ratio: 144, ccl: 1650.3 }).quantity).toBe(0.69444444)
  })
})

describe('toLocalUnits', () => {
  it('gives back the CEDEARs of a holding without the rounding leftover', () => {
    // 100 CEDEARs (144 per share) are saved as 0.69444444 shares: × 144 is 99.99999936.
    expect(toLocalUnits(0.69444444, 144)).toBe(100)
    expect(toLocalUnits(fromPesos({ units: 37, arsPrice: 1, ratio: 58, ccl: 1 }).quantity, 58)).toBe(37)
  })

  it('keeps the units of a holding that is not a whole number of them', () => {
    expect(toLocalUnits(1.5, 3)).toBe(4.5)
  })
})

describe('deriveTradeField', () => {
  it('gives the unit price of a buy from what was paid and what was received', () => {
    // $1,000 of ETH that bought 0.47166872: the price is not the $1,000.
    const price = deriveTradeField('price', { quantity: 0.47166872, total: 1000 })
    expect(price).toBeCloseTo(2120.1321, 4)
    expect(0.47166872 * price).toBeCloseTo(1000, 6)
  })

  it('gives the quantity from the total and the price, with 8 decimals', () => {
    expect(deriveTradeField('quantity', { price: 2030, total: 1000 })).toBe(0.49261084)
  })

  it('gives the total in cents from the quantity and the price', () => {
    expect(deriveTradeField('total', { quantity: 0.47166872, price: 2030 })).toBe(957.49)
  })

  it('is null while the other two are missing', () => {
    expect(deriveTradeField('price', { quantity: 0, total: 1000 })).toBeNull()
    expect(deriveTradeField('quantity', { price: NaN, total: 1000 })).toBeNull()
    expect(deriveTradeField('total', { quantity: 1, price: 0 })).toBeNull()
  })
})

describe('quotedAssets', () => {
  const catalog = [...CATALOG, { symbol: 'MSFT', type: 'stock', price: 400, color: '#666666' }]
  const symbols = (assets) => assets.map((asset) => asset.symbol)

  it('quotes every crypto, but only the stocks that are held', () => {
    const transactions = [buy('AAPL', 2, 250)]
    expect(symbols(quotedAssets(catalog, transactions))).toEqual(['ETH', 'BTC', 'SOL', 'USDT', 'AAPL'])
    expect(symbols(quotedAssets(catalog, []))).toEqual(['ETH', 'BTC', 'SOL', 'USDT'])
  })

  it('leaves out the stocks sold out until `closed` asks for them', () => {
    const transactions = [buy('AAPL', 2, 250), sell('AAPL', 2, 300), buy('MSFT', 1, 400)]
    expect(symbols(quotedAssets(catalog, transactions))).toEqual(['ETH', 'BTC', 'SOL', 'USDT', 'MSFT'])
    expect(symbols(quotedAssets(catalog, transactions, { closed: true }))).toEqual([
      'ETH',
      'BTC',
      'SOL',
      'USDT',
      'AAPL',
      'MSFT',
    ])
  })
})

describe('usedSymbols', () => {
  it('lists what the transactions rely on, with the source of an income and the USDT side of a trade', () => {
    const used = usedSymbols([
      buy('ETH', 1, 2000),
      tx({ date: '2026-10-03', type: 'income', symbol: 'NEXO', quantity: 2, source: 'BTC' }),
      deposit(100),
    ])
    expect([...used].sort()).toEqual(['BTC', 'ETH', 'NEXO', 'USDT'])
  })

  it('always keeps USDT and leaves out assets without transactions', () => {
    const used = usedSymbols([sell('SOL', 1, 200, { proceeds: 'usdt' })])
    expect(used.has('USDT')).toBe(true)
    expect(used.has('SOL')).toBe(true)
    expect(used.has('AAPL')).toBe(false)
    expect([...usedSymbols([])]).toEqual(['USDT'])
  })
})

describe('buildHoldings', () => {
  it('derives quantity, PPC and realized result per asset', () => {
    const holdings = buildHoldings(CATALOG, [buy('BTC', 2, 40000), sell('BTC', 1, 45000)])
    expect(holdingOf(holdings, 'BTC')).toMatchObject({ quantity: 1, avgCost: 40000, realized: 5000, price: 50000 })
  })

  it('drops closed positions, floating point leftovers included', () => {
    const holdings = buildHoldings(CATALOG, [
      buy('ETH', 2, 100),
      sell('ETH', 2, 150),
      buy('SOL', 0.1, 100),
      buy('SOL', 0.2, 100),
      sell('SOL', 0.3, 100),
    ])
    // Only the cash the sales credited is left.
    expect(holdings.map((holding) => holding.symbol)).toEqual(['USD'])
  })

  it('ignores symbols that are not in the catalog', () => {
    expect(buildHoldings(CATALOG, [buy('DOGE', 100, 0.1)])).toEqual([])
  })

  it('adds cash only once it has some movement', () => {
    expect(holdingOf(buildHoldings(CATALOG, [buy('ETH', 1, 100)]), 'USD')).toBeUndefined()

    const holdings = buildHoldings(CATALOG, [deposit(500), buy('ETH', 1, 100, { funding: 'cash', fee: 1 })])
    expect(holdingOf(holdings, 'USD')).toMatchObject({ type: 'cash', quantity: 399, price: 1 })
  })
})

describe('buildCashLedger', () => {
  it('lists only what moved cash, with the balance after each movement', () => {
    const rows = buildCashLedger([
      deposit(100, '2026-10-01'),
      buy('ETH', 1, 50, { date: '2026-10-02' }),
      sell('ETH', 1, 80, { date: '2026-10-03' }),
    ])
    expect(rows.map((row) => [row.cashAmount, row.balanceAfter])).toEqual([
      [100, 100],
      [80, 180],
    ])
  })
})

describe('findLedgerError', () => {
  it('accepts a consistent log', () => {
    expect(findLedgerError([deposit(100), buy('ETH', 1, 50, { funding: 'cash' }), sell('ETH', 1, 60)])).toBeNull()
  })

  it('rejects selling more than was held, naming the asset', () => {
    expect(findLedgerError([buy('ETH', 1, 50), sell('ETH', 2, 60)])).toMatch(/ETH/)
  })

  it('checks a backdated sale where it falls', () => {
    const transactions = [buy('ETH', 1, 50, { date: '2026-10-01' }), sell('ETH', 1, 60, { date: '2026-09-01' })]
    expect(findLedgerError(transactions)).toMatch(/ETH/)
  })

  it('rejects cash going negative at some point, even if a later deposit covers it', () => {
    const transactions = [
      buy('ETH', 1, 100, { date: '2026-10-01', funding: 'cash' }),
      deposit(500, '2026-10-05'),
    ]
    expect(findLedgerError(transactions)).toMatch(/efectivo/)
  })

  it('checks same-day transactions by their time of day', () => {
    const transactions = [
      buy('ETH', 1, 50, { date: '2026-10-05T15:00' }),
      sell('ETH', 1, 60, { date: '2026-10-05T09:00' }),
    ]
    expect(findLedgerError(transactions)).toMatch(/ETH/)
  })

  it('accepts a deposit and a cash buy on the same day, in that order', () => {
    expect(findLedgerError([deposit(100), buy('ETH', 1, 100, { funding: 'cash' })])).toBeNull()
  })
})

describe('trades settled in USDT', () => {
  const ethBuy = buy('ETH', 1, 1000, { date: '2026-10-01' })
  const ethSale = sell('ETH', 0.5, 2000, { date: '2026-10-05', fee: 10, proceeds: 'usdt' })
  const usdtBuy = buy('USDT', 1000, 1, { date: '2026-10-01' })
  const solBuy = buy('SOL', 2, 150, { date: '2026-10-03', fee: 5, funding: 'usdt' })

  it('expands each one into the trade plus its USDT side at $1', () => {
    expect(expandTransactions([ethSale, solBuy])).toEqual([
      ethSale,
      expect.objectContaining({ sourceId: ethSale.id, type: 'buy', symbol: 'USDT', quantity: 990, price: 1 }),
      solBuy,
      expect.objectContaining({ sourceId: solBuy.id, type: 'sell', symbol: 'USDT', quantity: 305, price: 1 }),
    ])
    expect(expandTransactions([ethBuy])).toEqual([ethBuy])
  })

  it('pays a sale out in USDT without touching cash', () => {
    const holdings = buildHoldings(CATALOG, [ethBuy, ethSale])
    expect(holdingOf(holdings, 'ETH')).toMatchObject({ quantity: 0.5, realized: 490 })
    expect(holdingOf(holdings, 'USDT')).toMatchObject({ quantity: 990, avgCost: 1 })
    expect(holdingOf(holdings, 'USD')).toBeUndefined()
  })

  it('pays a buy with USDT, fee included, without touching cash', () => {
    const holdings = buildHoldings(CATALOG, [usdtBuy, solBuy])
    expect(holdingOf(holdings, 'USDT').quantity).toBe(695)
    expect(holdingOf(holdings, 'SOL')).toMatchObject({ quantity: 2, avgCost: 152.5 })
    expect(holdingOf(holdings, 'USD')).toBeUndefined()
    expect(getContributions(expandTransactions([usdtBuy, solBuy]))).toBe(1000)
  })

  it('rejects paying with USDT that was not there on that date', () => {
    expect(findLedgerError([solBuy])).toMatch(/USDT/)
    expect(findLedgerError([usdtBuy, { ...solBuy, quantity: 10 }])).toMatch(/USDT/)
  })

  it("rejects deleting a sale whose USDT was already spent", () => {
    const spend = sell('USDT', 500, 1, { date: '2026-10-06' })
    expect(findLedgerError([ethBuy, ethSale, spend])).toBeNull()
    expect(findLedgerError([ethBuy, spend])).toMatch(/USDT/)
  })

  it('chains a sale into USDT and a buy with that USDT', () => {
    const later = { ...solBuy, date: '2026-10-06' }
    expect(findLedgerError([ethBuy, ethSale, later])).toBeNull()
    expect(holdingOf(buildHoldings(CATALOG, [ethBuy, ethSale, later]), 'USDT').quantity).toBe(685)
  })
})

describe('income (dividends, interest, staking)', () => {
  const income = (symbol, paid, date = '2026-10-03') => tx({ date, type: 'income', symbol, ...paid })
  const aaplBuy = buy('AAPL', 2, 100)
  const dividend = income('AAPL', { amount: 10 })
  const ethBuy = buy('ETH', 1, 1000)
  const staking = income('ETH', { quantity: 1 })

  it('credits cash when paid in cash, without counting as new money', () => {
    expect(cashImpact(dividend)).toBe(10)
    expect(cashImpact(staking)).toBe(0)
    expect(getContributions([aaplBuy, dividend])).toBe(200)
  })

  it('adds the cash to the holding it came from, leaving quantity and PPC alone', () => {
    const holdings = buildHoldings(CATALOG, [aaplBuy, dividend])
    expect(holdingOf(holdings, 'AAPL')).toMatchObject({ quantity: 2, avgCost: 100, income: 10, realized: 0 })
    expect(holdingOf(holdings, 'USD').quantity).toBe(10)
  })

  it('adds units at cost 0 when paid in kind, which lowers the PPC', () => {
    const eth = holdingOf(buildHoldings(CATALOG, [ethBuy, staking]), 'ETH')
    expect(eth).toMatchObject({ quantity: 2, avgCost: 500, income: 0 })
  })

  it('grows the asset it was paid in, not the one that generated it (`source`)', () => {
    const holdings = buildHoldings(CATALOG, [ethBuy, income('SOL', { quantity: 3, source: 'ETH' })])
    expect(holdingOf(holdings, 'ETH')).toMatchObject({ quantity: 1, avgCost: 1000 })
    expect(holdingOf(holdings, 'SOL')).toMatchObject({ quantity: 3, avgCost: 0 })
  })

  it('lets units received in kind be sold', () => {
    expect(findLedgerError([ethBuy, staking, sell('ETH', 2, 1000, { date: '2026-10-04' })])).toBeNull()
    expect(findLedgerError([ethBuy, sell('ETH', 2, 1000, { date: '2026-10-04' })])).toMatch(/ETH/)
  })

  it('rejects deleting a dividend whose cash was already spent', () => {
    const spend = buy('ETH', 0.01, 1000, { date: '2026-10-04', funding: 'cash' })
    expect(findLedgerError([aaplBuy, dividend, spend])).toBeNull()
    expect(findLedgerError([aaplBuy, spend])).toMatch(/efectivo/)
  })

  it('counts as gain', () => {
    const transactions = [aaplBuy, dividend]
    const assets = getAssetsWithMetrics(buildHoldings(CATALOG, transactions))
    // AAPL at 250 (+300 unrealized) plus the $10 dividend.
    expect(getTotals(assets, getContributions(transactions)).gain).toBe(310)
  })
})

describe('metrics and totals', () => {
  const holdings = [
    { symbol: 'ETH', type: 'crypto', price: 2000, quantity: 1, avgCost: 1500 },
    { symbol: 'AAPL', type: 'stock', price: 250, quantity: 8, avgCost: 300 },
  ]

  it('computes value, cost, gain and weight per asset', () => {
    const [eth, aapl] = getAssetsWithMetrics(holdings)
    expect(eth).toMatchObject({ value: 2000, cost: 1500, gain: 500, weight: 50 })
    expect(eth.gainPercent).toBeCloseTo(33.33, 2)
    expect(aapl).toMatchObject({ value: 2000, cost: 2400, gain: -400, weight: 50 })
    expect(aapl.gainPercent).toBeCloseTo(-16.67, 2)
  })

  it('measures the gain against the money put in', () => {
    const totals = getTotals(getAssetsWithMetrics(holdings), 3000)
    expect(totals).toEqual({ value: 4000, contributions: 3000, gain: 1000 })
  })
})

describe('closed positions and results', () => {
  const solBuy = buy('SOL', 2, 100, { fee: 2 })
  const solSale = sell('SOL', 2, 150, { fee: 3, date: '2026-10-07' })

  it('lists what was sold out, with its realized result and last date', () => {
    const transactions = [solBuy, solSale, buy('ETH', 1, 1000)]
    expect(buildClosedPositions(CATALOG, transactions)).toEqual([
      expect.objectContaining({ symbol: 'SOL', quantity: 0, realized: 95, lastDate: '2026-10-07' }),
    ])
    expect(holdingOf(buildHoldings(CATALOG, transactions), 'SOL')).toBeUndefined()
  })

  it('treats floating point leftovers as closed', () => {
    const leftovers = [buy('SOL', 0.3, 10), sell('SOL', 0.1, 10), sell('SOL', 0.2, 10)]
    expect(buildClosedPositions(CATALOG, leftovers)).toEqual([expect.objectContaining({ symbol: 'SOL', quantity: 0 })])
  })

  it('splits the historic gain exactly into unrealized, realized and income', () => {
    const transactions = [
      deposit(5000, '2026-09-01'),
      solBuy,
      solSale,
      buy('ETH', 2, 1000, { funding: 'cash', fee: 10 }),
      sell('ETH', 0.5, 1200, { fee: 5, proceeds: 'usdt', date: '2026-10-03' }),
      buy('AAPL', 2, 200, { funding: 'usdt', date: '2026-10-04' }),
      tx({ date: '2026-10-05', type: 'income', symbol: 'AAPL', amount: 12 }),
      tx({ date: '2026-10-05', type: 'income', symbol: 'BTC', quantity: 0.001, source: 'ETH' }),
      withdrawal(300, '2026-10-06'),
    ]
    expect(findLedgerError(transactions)).toBeNull()

    const assets = getAssetsWithMetrics(buildHoldings(CATALOG, transactions))
    const results = getResults(assets, buildClosedPositions(CATALOG, transactions))
    const { gain } = getTotals(assets, getContributions(transactions))

    expect(results.realized).toBeCloseTo(95 + (1200 - 1005) * 0.5 - 5, 6)
    expect(results.income).toBe(12)
    expect(results.unrealized + results.realized + results.income).toBeCloseTo(gain, 6)
  })
})

describe('filterByGroup', () => {
  const assets = [
    { symbol: 'USDT', type: 'crypto' },
    { symbol: 'AAPL', type: 'stock' },
    { symbol: 'USD', type: 'cash' },
  ]
  const symbols = (groupKey) => filterByGroup(assets, groupKey).map((asset) => asset.symbol)

  it('puts cash with stocks and USDT with crypto', () => {
    expect(symbols('all')).toEqual(['USDT', 'AAPL', 'USD'])
    expect(symbols('crypto')).toEqual(['USDT'])
    expect(symbols('stock')).toEqual(['AAPL', 'USD'])
  })
})

describe('getAllocation', () => {
  const assetsWorth = (...values) =>
    values.map((value, index) => ({ symbol: `A${index}`, value, color: `#00000${index}` }))

  it('keeps the top 5 and sums the rest into "Otros"', () => {
    const slices = getAllocation(assetsWorth(10, 70, 5, 40, 30, 20, 25))
    expect(slices.map((slice) => slice.name)).toEqual(['A1', 'A3', 'A4', 'A6', 'A5', 'Otros'])
    expect(slices.at(-1)).toMatchObject({ value: 15, color: '#d1d5db' })
    expect(slices.at(-1).members.map((member) => member.name)).toEqual(['A0', 'A2'])
    expect(slices.reduce((sum, slice) => sum + slice.weight, 0)).toBeCloseTo(100)
    expect(slices[0].color).toBe('#000001')
  })

  it("doesn't group a single leftover asset", () => {
    expect(getAllocation(assetsWorth(1, 2, 3, 4, 5, 6)).map((slice) => slice.name)).not.toContain('Otros')
  })

  it('shows everything, largest first, when not grouped', () => {
    const slices = getAllocation(assetsWorth(10, 70, 5, 40, 30, 20, 25), { grouped: false })
    expect(slices.map((slice) => slice.value)).toEqual([70, 40, 30, 25, 20, 10, 5])
  })
})

describe('getDayChange', () => {
  it('adds up what each asset moved today, over what it was all worth before', () => {
    const assets = [
      { value: 110, change24h: 10 },
      { value: 180, change24h: -10 },
      { value: 100, type: 'cash' },
    ]
    const change = getDayChange(assets)

    // 100 -> 110, 200 -> 180, and cash stays at 100: 400 -> 390.
    expect(change.amount).toBeCloseTo(-10)
    expect(change.percent).toBeCloseTo(-2.5)
  })

  it('is zero without holdings', () => {
    expect(getDayChange([])).toEqual({ amount: 0, percent: 0 })
  })
})
