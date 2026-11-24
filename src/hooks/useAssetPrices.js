import { useEffect, useState } from 'react'
import { fetchCryptoPrices } from '../services/binanceKlines.js'
import { fetchStockPrices } from '../services/yahooChart.js'
import { historyTimes } from '../utils/history.js'

// The past prices of one asset since `from` (ms), as `{ time, price }` oldest first:
// hourly or daily candles from Binance (crypto) or bars from Yahoo (stocks, through the
// local server). `failed` when they couldn't be loaded.
// The hourly series is asked from the same start as the history chart's, to share its cache.
export function useAssetPrices({ symbol, type }, resolution, from) {
  const key = `${symbol}:${resolution}:${from}`
  const [loaded, setLoaded] = useState({ key: null, points: [], failed: false })

  useEffect(() => {
    let cancelled = false
    const fetchPrices = type === 'crypto' ? fetchCryptoPrices : fetchStockPrices
    const start = resolution === 'hour' ? historyTimes('hour')[0] : from

    fetchPrices(symbol, resolution, start)
      .then((points) => {
        if (cancelled) return
        const sorted = [...points].sort((a, b) => a.time - b.time)
        // The last price before the range holds at its start: a stock on a weekend has no bars in the last 24 hours.
        const previous = sorted.filter((point) => point.time < from).at(-1)
        const inside = sorted.filter((point) => point.time >= from)
        setLoaded({
          key,
          points: previous ? [{ time: from, price: previous.price }, ...inside] : inside,
          failed: false,
        })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, points: [], failed: true })
      })

    return () => {
      cancelled = true
    }
  }, [key, symbol, type, resolution, from])

  const current = loaded.key === key
  return { points: current ? loaded.points : [], loading: !current, failed: current && loaded.failed }
}
