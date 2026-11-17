import { describe, expect, it } from 'vitest'
import {
  HISTORY_HOURS,
  alignPrices,
  annualizedReturn,
  buildSnapshot,
  contributedUntil,
  dailyTimes,
  firstTransactionTime,
  getGroupHistory,
  groupFlows,
  historyTimes,
  hourlyTimes,
  lifetimeReturn,
  periodReturn,
  portfolioFlows,
  replayValue,
  tradeMarkers,
} from './history.js'
import { expandTransactions, getContributions } from './portfolio.js'

const HOUR = 60 * 60 * 1000
// Local time, like the start of day transactions count from.
const at = (localDateTime) => new Date(localDateTime).getTime()
const values = (series) => series.map((point) => point.value)

describe('buildSnapshot', () => {
  it('saves the total and its split by type, rounded to cents', () => {
    const assets = [
      { type: 'crypto', value: 100.004 },
      { type: 'crypto', value: 50.5 },
      { type: 'cash', value: 10 },
    ]
    expect(buildSnapshot(assets, '2026-10-28T12:00:00.000Z')).toEqual({
      timestamp: '2026-10-28T12:00:00.000Z',
      value: 160.5,
      byType: { crypto: 150.5, stock: 0, cash: 10 },
    })
  })
})

describe('getGroupHistory', () => {
  const snapshots = [
    { timestamp: '2026-10-26T10:00:00.000Z', value: 900 },
    { timestamp: '2026-10-27T10:00:00.000Z', value: 1000, byType: { crypto: 600, stock: 300, cash: 100 } },
  ]

  it('uses every snapshot for "all"', () => {
    expect(getGroupHistory(snapshots, 'all')).toBe(snapshots)
  })

  it('sums the types of a group and skips snapshots without a split', () => {
    expect(getGroupHistory(snapshots, 'stock')).toEqual([{ timestamp: '2026-10-27T10:00:00.000Z', value: 400 }])
    expect(getGroupHistory(snapshots, 'crypto')).toEqual([{ timestamp: '2026-10-27T10:00:00.000Z', value: 600 }])
  })
})

describe('hourlyTimes', () => {
  it('returns the last HISTORY_HOURS hour marks, oldest first', () => {
    const now = Date.UTC(2026, 9, 28, 15, 42)
    const times = hourlyTimes(now)

    expect(times).toHaveLength(HISTORY_HOURS)
    expect(times.at(-1)).toBe(Date.UTC(2026, 9, 28, 15))
    expect(times[1] - times[0]).toBe(HOUR)
  })
})

describe('dailyTimes', () => {
  const DAY = 24 * HOUR

  it('returns every day mark (00:00 UTC) from the one at or before the start up to today', () => {
    const times = dailyTimes(Date.UTC(2026, 9, 25, 18), Date.UTC(2026, 9, 28, 15, 42))

    expect(times).toEqual([25, 26, 27, 28].map((day) => Date.UTC(2026, 9, day)))
    expect(times[1] - times[0]).toBe(DAY)
  })

  it('is empty without a start, like a portfolio with no transactions', () => {
    expect(dailyTimes(firstTransactionTime([]))).toEqual([])
  })

  it('starts at the oldest transaction, whatever the order they were added in', () => {
    const transactions = [{ date: '2026-10-20T14:30' }, { date: '2026-03-05' }]
    expect(firstTransactionTime(transactions)).toBe(at('2026-03-05T00:00'))
  })
})

describe('historyTimes', () => {
  const now = Date.UTC(2026, 9, 28, 15, 42)

  it('gives the hourly marks of the last 30 days, or the daily ones since the start', () => {
    expect(historyTimes('hour', null, now)).toEqual(hourlyTimes(now))
    expect(historyTimes('day', Date.UTC(2026, 9, 27, 3), now)).toEqual([Date.UTC(2026, 9, 27), Date.UTC(2026, 9, 28)])
  })
})

describe('alignPrices', () => {
  const times = [at('2026-10-02T10:00'), at('2026-10-02T11:00'), at('2026-10-03T09:00')]

  it('gives each time the last price at or before it, holding it while the market is closed', () => {
    const points = [
      { time: at('2026-10-02T11:00'), price: 110 },
      { time: at('2026-10-02T09:30'), price: 100 },
      { time: at('2026-10-02T16:00'), price: 120 },
    ]

    expect([...alignPrices(points, times).values()]).toEqual([100, 110, 120])
  })

  it('uses the first price for times before all of them', () => {
    expect(alignPrices([{ time: at('2026-10-02T10:30'), price: 105 }], times).get(times[0])).toBe(105)
  })

  it('is empty without prices', () => {
    expect(alignPrices([], times).size).toBe(0)
  })
})

describe('replayValue', () => {
  const buy = (symbol, quantity, date) => ({ type: 'buy', symbol, quantity, price: 1, date })
  const sell = (symbol, quantity, date) => ({ type: 'sell', symbol, quantity, price: 1, date })

  it('counts a transaction from the start of its day', () => {
    const times = [at('2026-10-04T23:00'), at('2026-10-05T00:00'), at('2026-10-05T12:00')]
    const series = replayValue([buy('ETH', 2, '2026-10-05')], { symbols: ['ETH'] }, times, () => 100)

    expect(values(series)).toEqual([0, 200, 200])
    expect(series[1].timestamp).toBe(new Date(times[1]).toISOString())
  })

  it('counts a transaction with a time of day from that time', () => {
    const times = [at('2026-10-05T14:00'), at('2026-10-05T15:00')]
    const series = replayValue([buy('ETH', 2, '2026-10-05T14:30')], { symbols: ['ETH'] }, times, () => 100)

    expect(values(series)).toEqual([0, 200])
  })

  it('values each quantity at the price of that hour', () => {
    const times = [at('2026-10-05T10:00'), at('2026-10-05T11:00')]
    const prices = { [times[0]]: 100, [times[1]]: 110 }
    const series = replayValue([buy('ETH', 2, '2026-10-01')], { symbols: ['ETH'] }, times, (symbol, time) => prices[time])

    expect(values(series)).toEqual([200, 220])
  })

  it('only follows the given symbols, and adds cash at face value with `withCash`', () => {
    const transactions = [
      buy('ETH', 1, '2026-10-01'),
      buy('AAPL', 3, '2026-10-01'),
      { type: 'deposit', amount: 50, date: '2026-10-02' },
    ]
    const times = [at('2026-10-01T12:00'), at('2026-10-02T12:00')]

    expect(values(replayValue(transactions, { symbols: ['AAPL'] }, times, () => 10))).toEqual([30, 30])
    expect(values(replayValue(transactions, { symbols: ['AAPL'], withCash: true }, times, () => 10))).toEqual([30, 80])
  })

  it('adds income paid in kind to the quantity, and income paid in cash to the cash', () => {
    const times = [at('2026-10-01T12:00'), at('2026-10-02T12:00')]
    const transactions = [
      buy('ETH', 1, '2026-10-01'),
      { type: 'income', symbol: 'ETH', quantity: 0.5, date: '2026-10-02' },
      { type: 'income', symbol: 'ETH', amount: 7, date: '2026-10-02' },
    ]

    expect(values(replayValue(transactions, { symbols: ['ETH'] }, times, () => 10))).toEqual([10, 15])
    expect(values(replayValue(transactions, { symbols: ['ETH'], withCash: true }, times, () => 10))).toEqual([10, 22])
  })

  it('counts the shares bought before a split in post-split units, since prices come adjusted', () => {
    // 1 share at $200 that splits 4:1 on 10/03: adjusted, it's $50 all along.
    const times = [at('2026-10-02T12:00'), at('2026-10-04T12:00')]
    const transactions = [buy('AAPL', 1, '2026-10-01'), { type: 'split', symbol: 'AAPL', newShares: 4, oldShares: 1, date: '2026-10-03' }]

    expect(values(replayValue(transactions, { symbols: ['AAPL'] }, times, () => 50))).toEqual([200, 200])
  })

  it('never values a negative quantity', () => {
    const times = [at('2026-10-01T12:00'), at('2026-10-02T12:00')]
    const transactions = [sell('ETH', 1, '2026-10-01'), buy('ETH', 3, '2026-10-02')]

    expect(values(replayValue(transactions, { symbols: ['ETH'] }, times, () => 10))).toEqual([0, 20])
  })
})

describe('contributedUntil', () => {
  const trade = (type, symbol, quantity, price, date, extra = {}) => ({ type, symbol, quantity, price, fee: 0, date, ...extra })
  const saved = [
    { type: 'deposit', amount: 1000, date: '2026-10-01' },
    trade('buy', 'ETH', 1, 400, '2026-10-02', { funding: 'cash', fee: 10 }),
    trade('buy', 'AAPL', 2, 100, '2026-10-02', { funding: 'external' }),
    trade('sell', 'ETH', 0.5, 600, '2026-10-03', { proceeds: 'usdt' }),
    trade('buy', 'SOL', 1, 100, '2026-10-04', { funding: 'usdt' }),
    trade('sell', 'ETH', 0.5, 500, '2026-10-05', { fee: 5 }),
    { type: 'income', symbol: 'AAPL', amount: 7, date: '2026-10-05' },
    { type: 'income', symbol: 'ETH', quantity: 0.1, date: '2026-10-05' },
    { type: 'withdrawal', amount: 50, date: '2026-10-06' },
  ]
  const transactions = expandTransactions(saved.map((transaction, index) => ({ id: `c${index}`, ...transaction })))
  const all = { symbols: ['ETH', 'AAPL', 'USDT', 'SOL'], withCash: true }
  const crypto = { symbols: ['ETH', 'USDT', 'SOL'] }
  const stocks = { symbols: ['AAPL'], withCash: true }
  const end = at('2026-10-07T00:00')
  const contributed = (list, scope, time) => contributedUntil(groupFlows(list, scope), time)

  it('adds up to the contributions over the whole portfolio, at any time', () => {
    expect(contributed(transactions, all, end)).toBe(getContributions(saved))
    expect(contributed(transactions, all, at('2026-10-02T12:00'))).toBe(1200)
  })

  it('counts money moved between groups as leaving one and entering the other', () => {
    // ETH bought with cash (+410), sold for cash (-245); the USDT trades stay inside crypto.
    expect(contributed(transactions, crypto, end)).toBe(410 - 245)
    // Deposit, new money for AAPL, cash to ETH and back, withdrawal. Income is never a flow.
    expect(contributed(transactions, stocks, end)).toBe(1000 + 200 - 410 + 245 - 50)
  })

  it('counts a transaction from the start of its day', () => {
    expect(contributed(transactions, all, at('2026-10-01T00:00'))).toBe(1000)
    expect(contributed(transactions, all, at('2026-09-30T23:00'))).toBe(0)
  })

  it('leaves splits out: they move no money', () => {
    const splitOnly = [{ type: 'split', symbol: 'AAPL', newShares: 4, oldShares: 1, date: '2026-10-03' }]

    expect(groupFlows(splitOnly, all)).toEqual([])
  })

  it('counts a transaction with a time of day from that time', () => {
    const timed = [{ type: 'deposit', amount: 100, date: '2026-10-01T15:30' }]

    expect(contributed(timed, all, at('2026-10-01T15:00'))).toBe(0)
    expect(contributed(timed, all, at('2026-10-01T16:00'))).toBe(100)
  })
})

describe('periodReturn', () => {
  const DAY = 24 * HOUR
  const t0 = at('2026-10-01T00:00')
  const point = (days, value) => ({ time: t0 + days * DAY, value })
  const flow = (days, amount) => ({ time: t0 + days * DAY, amount })

  it('is the change in value over the starting value when no money moves', () => {
    expect(periodReturn(point(0, 1000), point(10, 1100), [])).toBeCloseTo(10)
  })

  it('leaves the money that came in out of the gain, and weighs it by the time it was invested', () => {
    // Gain: 2200 - 1000 - 1000 = 200. Capital: 1000 + 1000 for half the period.
    expect(periodReturn(point(0, 1000), point(10, 2200), [flow(5, 1000)])).toBeCloseTo((200 / 1500) * 100)
  })

  it('only counts the flows after the start and up to the end', () => {
    const flows = [flow(0, 500), flow(5, 1000), flow(11, 300)]
    expect(periodReturn(point(0, 1000), point(10, 2200), flows)).toBeCloseTo((200 / 1500) * 100)
  })

  it('starts with the first flow when nothing was invested before', () => {
    expect(periodReturn(point(0, 0), point(10, 1100), [flow(9, 1000)])).toBeCloseTo(10)
  })

  it('is null with no capital to measure against', () => {
    expect(periodReturn(point(0, 0), point(10, 0), [])).toBeNull()
  })
})

describe('portfolioFlows', () => {
  it('dates the money brought in from outside, and adds up to the contributions', () => {
    const transactions = [
      { id: '1', date: '2026-10-01', type: 'deposit', amount: 1000 },
      { id: '2', date: '2026-10-02T10:00', type: 'buy', symbol: 'BTC', quantity: 1, price: 500, fee: 5, funding: 'cash' },
      { id: '3', date: '2026-10-03', type: 'buy', symbol: 'ETH', quantity: 2, price: 100, fee: 0 },
      { id: '4', date: '2026-10-04', type: 'income', symbol: 'ETH', amount: 20 },
      { id: '5', date: '2026-10-05', type: 'withdrawal', amount: 300 },
    ]
    const flows = portfolioFlows(transactions)

    expect(flows).toEqual([
      { time: at('2026-10-01T00:00'), amount: 1000 },
      { time: at('2026-10-03T00:00'), amount: 200 },
      { time: at('2026-10-05T00:00'), amount: -300 },
    ])
    expect(flows.reduce((sum, flow) => sum + flow.amount, 0)).toBe(getContributions(transactions))
  })
})

describe('lifetimeReturn', () => {
  const DAY = 24 * HOUR
  const t0 = at('2026-10-01T00:00')
  const flow = (days, amount) => ({ time: t0 + days * DAY, amount })
  const end = (days, value) => ({ time: t0 + days * DAY, value })

  it('is the gain over what was put in when it all came in at once', () => {
    expect(lifetimeReturn([flow(0, 1000)], end(10, 1500))).toBeCloseTo(50)
  })

  it('does not depend on when the money came in', () => {
    // 1000 long ago and 9000 yesterday, 1000 lost: 10% of what was put in.
    expect(lifetimeReturn([flow(0, 1000), flow(599, 9000)], end(600, 9000))).toBeCloseTo(-10)
  })

  it('is not inflated by a withdrawal', () => {
    // Gain: 700 - (1000 - 500) = 200, over the 1000 that were in at the most.
    // Over the net contributions it would say 200 / 500 = 40%.
    expect(lifetimeReturn([flow(0, 1000), flow(5, -500)], end(10, 700))).toBeCloseTo(20)
  })

  it('still measures the gain once more was withdrawn than put in', () => {
    // Gain: 100 - (1000 - 1200) = 300.
    expect(lifetimeReturn([flow(0, 1000), flow(5, -1200)], end(10, 100))).toBeCloseTo(30)
  })

  it('measures against the peak, not against everything that ever came in', () => {
    // The same 1000 went in, out and in again: the most at stake was 1000, not 2000.
    const flows = [flow(8, 1000), flow(0, 1000), flow(4, -1000)]
    expect(lifetimeReturn(flows, end(10, 1100))).toBeCloseTo(10)
  })

  it('is null without any money put in', () => {
    expect(lifetimeReturn([], end(10, 0))).toBeNull()
  })
})

describe('annualizedReturn', () => {
  const YEAR = 365 * 24 * HOUR
  const now = at('2026-10-01T00:00')
  const flow = (yearsAgo, amount) => ({ time: now - yearsAgo * YEAR, amount })
  const end = (value) => ({ time: now, value })

  it('is the yearly rate of a single contribution', () => {
    expect(annualizedReturn([flow(2, 1000)], end(1210))).toBeCloseTo(10)
    expect(annualizedReturn([flow(2, 1000)], end(810))).toBeCloseTo(-10)
  })

  it('compounds each contribution from its date', () => {
    // 1000 for two years and 1000 for one, both at 10%.
    expect(annualizedReturn([flow(2, 1000), flow(1, 1000)], end(1210 + 1100))).toBeCloseTo(10)
  })

  it('counts a withdrawal as money that stopped compounding', () => {
    expect(annualizedReturn([flow(2, 1000), flow(1, -500)], end(1210 - 550))).toBeCloseTo(10)
  })

  it('is null with less than a year of history, without flows or without a rate that fits', () => {
    expect(annualizedReturn([flow(0.5, 1000)], end(1100))).toBeNull()
    expect(annualizedReturn([], end(1000))).toBeNull()
    // Money was only taken out, yet there is value left: no rate turns one into the other.
    expect(annualizedReturn([flow(2, -1000)], end(500))).toBeNull()
  })
})

describe('tradeMarkers', () => {
  const buy = (id, price, date) => ({ id, type: 'buy', symbol: 'AAPL', quantity: 1, price, date })

  it('marks buys and sells at their time and price, oldest first', () => {
    const sell = { id: 's1', type: 'sell', symbol: 'AAPL', quantity: 1, price: 120, date: '2026-10-05T14:30' }
    const markers = tradeMarkers([sell, buy('b1', 100, '2026-10-01')])

    expect(markers.map(({ id, type, time, price }) => ({ id, type, time, price }))).toEqual([
      { id: 'b1', type: 'buy', time: at('2026-10-01T00:00'), price: 100 },
      { id: 's1', type: 'sell', time: at('2026-10-05T14:30'), price: 120 },
    ])
    expect(markers[1].transaction).toBe(sell)
  })

  it('leaves out income and splits', () => {
    const income = { id: 'i1', type: 'income', symbol: 'AAPL', amount: 5, date: '2026-10-02' }
    const split = { id: 'x1', type: 'split', symbol: 'AAPL', newShares: 4, oldShares: 1, date: '2026-10-03' }

    expect(tradeMarkers([buy('b1', 100, '2026-10-01'), income, split]).map((marker) => marker.id)).toEqual(['b1'])
  })

  it('adjusts the price of trades before a split, like the past prices are', () => {
    const split = { id: 'x1', type: 'split', symbol: 'AAPL', newShares: 4, oldShares: 1, date: '2026-10-03' }
    const markers = tradeMarkers([buy('b1', 200, '2026-10-01'), split, buy('b2', 60, '2026-10-04')])

    expect(markers.map((marker) => marker.price)).toEqual([50, 60])
  })
})
