// Public market data REST API (no API key needed).
const KLINES_URL = 'https://data-api.binance.vision/api/v3/klines'
// Candles barely change in a few minutes; until then, reuse the last response.
const CACHE_TTL = 10 * 60 * 1000
const HOUR = 60 * 60 * 1000
// Binance's candle interval for each resolution, and how long one lasts.
const CANDLES = {
  hour: { interval: '1h', length: HOUR },
  day: { interval: '1d', length: 24 * HOUR },
}
// The most candles Binance gives in one response: with daily ones, about 2.7 years.
const MAX_CANDLES = 1000

const cache = new Map()

// One `{ time, price }` per candle (`resolution`: 'hour' or 'day') since `from` (ms), priced
// at the candle's open. `symbol` is quoted against USDT, like the live stream.
export function fetchCryptoPrices(symbol, resolution, from) {
  const key = `${symbol}:${resolution}`
  const cached = cache.get(key)
  if (cached && cached.from <= from && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.promise

  const { interval, length } = CANDLES[resolution]
  const limit = Math.min(MAX_CANDLES, Math.ceil((Date.now() - from) / length) + 1)

  const promise = fetch(`${KLINES_URL}?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Binance ${response.status}`)
      return response.json()
    })
    .then((candles) => candles.map(([openTime, open]) => ({ time: openTime, price: Number(open) })))
    .catch((error) => {
      cache.delete(key)
      throw error
    })

  cache.set(key, { fetchedAt: Date.now(), from, promise })
  return promise
}
