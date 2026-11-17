import { useEffect, useMemo, useState } from 'react'
import { fetchCryptoPrices } from '../services/binanceKlines.js'
import { fetchStockPrices } from '../services/yahooChart.js'
import {
  alignPrices,
  firstTransactionTime,
  getGroupHistory,
  groupFlows,
  historyTimes,
  replayValue,
} from '../utils/history.js'
import { STABLECOIN, expandTransactions, getGroupTypes } from '../utils/portfolio.js'

const REFRESH_INTERVAL = 10 * 60 * 1000

// Past prices of `symbols` over the times of a series (historyTimes: every hour of the
// last 30 days, or every day since `since`), as symbol → Map(time → price), from
// `fetchPrices(symbol, resolution, from)` (a module-level function, so it stays the same).
// Fetched only while `enabled`; a symbol whose request fails is left out.
function usePrices(symbols, fetchPrices, { resolution, since }, enabled) {
  const key = [resolution, since, ...symbols].join(',')
  const symbolsKey = symbols.join(',')
  const [loaded, setLoaded] = useState({ key: null, prices: {} })

  useEffect(() => {
    if (!enabled) return
    const list = symbolsKey ? symbolsKey.split(',') : []
    let cancelled = false

    const load = async () => {
      const times = historyTimes(resolution, since)
      const results = times.length
        ? await Promise.allSettled(list.map((symbol) => fetchPrices(symbol, resolution, times[0])))
        : []
      if (cancelled) return

      const prices = {}
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') prices[list[index]] = alignPrices(result.value, times)
      })
      setLoaded({ key, prices })
    }

    load()
    const timer = setInterval(load, REFRESH_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [key, symbolsKey, resolution, since, fetchPrices, enabled])

  return { prices: loaded.prices, loading: enabled && loaded.key !== key }
}

const tradedSymbols = (catalog, transactions, type) =>
  catalog
    .filter((asset) => asset.type === type && transactions.some((transaction) => transaction.symbol === asset.symbol))
    .map((asset) => asset.symbol)

// The `{ timestamp, value }` series the history chart plots for a group, rebuilt from the
// transactions and the prices of each moment: crypto from Binance, stocks from Yahoo
// (through the dev server). So it has no gaps while the app was closed.
// `resolution` is the step: 'hour' covers the last 30 days hour by hour; 'day', every
// day since the first transaction (the long ranges of the chart).
// A crypto without candles uses its current price (`catalog` carries them); the
// stablecoin has no USDT pair and keeps its catalog price (1).
// Stocks are only rebuilt with prices for all of them. Otherwise (Yahoo down, or a
// production build without the proxy) it falls back to the saved snapshots: "all" plots
// them as they are; "stock" estimates with today's prices before the first one with
// `byType` (`estimatedUntil` marks where that ends).
// `flows` is the money that came into the group, `{ time, amount }` (groupFlows).
export function useGroupHistory(groupKey, { snapshots, transactions: savedTransactions, catalog, resolution }) {
  // USDT paid out by sales counts as held from the time of the sale.
  const transactions = useMemo(() => expandTransactions(savedTransactions), [savedTransactions])
  const types = getGroupTypes(groupKey)
  const withCrypto = types.includes('crypto')
  const withStocks = types.includes('stock')
  const withCash = types.includes('cash')
  const cryptoSymbols = useMemo(() => tradedSymbols(catalog, transactions, 'crypto'), [catalog, transactions])
  const stockSymbols = useMemo(() => tradedSymbols(catalog, transactions, 'stock'), [catalog, transactions])
  const firstTime = useMemo(() => firstTransactionTime(transactions), [transactions])
  // The hourly series always covers the same 30 days; the daily one starts with the portfolio.
  const span = { resolution, since: resolution === 'day' ? firstTime : null }
  const liveCryptoSymbols = useMemo(() => cryptoSymbols.filter((symbol) => symbol !== STABLECOIN), [cryptoSymbols])
  const { prices: cryptoPrices, loading: cryptoLoading } = usePrices(liveCryptoSymbols, fetchCryptoPrices, span, withCrypto)
  const { prices: stockPrices, loading: stockLoading } = usePrices(stockSymbols, fetchStockPrices, span, withStocks)

  // `types` comes from the ASSET_GROUPS constant, so it only changes with the group.
  const flows = useMemo(() => {
    const scope = {
      symbols: catalog.filter((asset) => types.includes(asset.type)).map((asset) => asset.symbol),
      withCash,
    }
    return groupFlows(transactions, scope)
  }, [types, withCash, catalog, transactions])

  const series = useMemo(() => {
    if (cryptoLoading || stockLoading) return { history: [], loading: true, estimatedUntil: null }

    const times = historyTimes(resolution, firstTime)
    const currentPrices = new Map(catalog.map((asset) => [asset.symbol, asset.price]))
    const currentPrice = (symbol) => currentPrices.get(symbol) ?? 0

    if (!withStocks || stockSymbols.every((symbol) => stockPrices[symbol])) {
      const prices = { ...cryptoPrices, ...stockPrices }
      const priceAt = (symbol, time) => prices[symbol]?.get(time) ?? currentPrice(symbol)
      const symbols = [...(withCrypto ? cryptoSymbols : []), ...(withStocks ? stockSymbols : [])]
      const history = replayValue(transactions, { symbols, withCash }, times, priceAt)
      return { history, loading: false, estimatedUntil: null }
    }

    if (groupKey === 'all') return { history: snapshots, loading: false, estimatedUntil: null }

    const saved = getGroupHistory(snapshots, groupKey)
    const estimatedUntil = saved.length ? Date.parse(saved[0].timestamp) : Date.now()
    const estimated = replayValue(
      transactions,
      { symbols: stockSymbols, withCash },
      times.filter((time) => time < estimatedUntil),
      currentPrice,
    )
    return { history: [...estimated, ...saved], loading: false, estimatedUntil }
  }, [
    groupKey,
    resolution,
    firstTime,
    withCrypto,
    withStocks,
    withCash,
    snapshots,
    transactions,
    catalog,
    cryptoSymbols,
    stockSymbols,
    cryptoPrices,
    cryptoLoading,
    stockPrices,
    stockLoading,
  ])

  return { ...series, flows }
}
