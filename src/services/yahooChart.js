// Yahoo Finance's chart API: past prices of US stocks and ETFs, which Finnhub's free
// plan doesn't give. It's unofficial and has no CORS, so requests go through the dev
// server's proxy (`/api/yahoo` in vite.config.js): it only works with `npm run dev`.
const CHART_URL = '/api/yahoo/v8/finance/chart'
// Bars barely change in a few minutes; until then, reuse the last response.
const CACHE_TTL = 10 * 60 * 1000
const HOUR = 60 * 60 * 1000
// Yahoo's bar interval for each resolution and how long a bar lasts (a daily one, the
// 6.5 hours of a market session). `margin` asks for some days before the first one
// needed, so it has a price even after a long weekend.
const BARS = {
  hour: { interval: '60m', length: HOUR, margin: 4 * 24 * HOUR },
  day: { interval: '1d', length: 6.5 * HOUR, margin: 7 * 24 * HOUR },
}

const cache = new Map()

// `{ time, price }` points since `from` (ms), from bars of `resolution` ('hour' or 'day'):
// each bar gives its open at its start and its close at its end. There are only bars
// while the market is open. Prices come adjusted by splits.
export function fetchStockPrices(symbol, resolution, from) {
  const key = `${symbol}:${resolution}`
  const cached = cache.get(key)
  if (cached && cached.from <= from && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.promise

  const { interval, length, margin } = BARS[resolution]
  const query = new URLSearchParams({
    interval,
    period1: Math.floor((from - margin) / 1000),
    period2: Math.floor(Date.now() / 1000),
  })

  const promise = fetch(`${CHART_URL}/${encodeURIComponent(symbol)}?${query}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Yahoo ${response.status}`)
      return response.json()
    })
    .then((data) => {
      const result = data.chart?.result?.[0]
      if (!result?.timestamp) throw new Error(`Yahoo has no prices for ${symbol}`)

      const { open, close } = result.indicators.quote[0]
      return result.timestamp
        .flatMap((start, index) => [
          { time: start * 1000, price: open[index] },
          { time: start * 1000 + length, price: close[index] },
        ])
        .filter((point) => point.price != null)
    })
    .catch((error) => {
      cache.delete(key)
      throw error
    })

  cache.set(key, { fetchedAt: Date.now(), from, promise })
  return promise
}
