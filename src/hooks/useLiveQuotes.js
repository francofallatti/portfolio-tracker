import { useEffect, useMemo, useRef, useState } from 'react'
import { connectBinanceTickers } from '../services/binanceStream.js'
import { fetchStockQuote } from '../services/finnhubQuotes.js'
import { readSavedQuotes, saveQuotes } from '../services/quoteCache.js'

const STOCK_POLL_INTERVAL = 15000
// Finnhub's free plan allows 60 requests a minute: each refresh asks once per symbol,
// so with many of them the refresh slows down to stay under 40 a minute.
const MS_PER_STOCK_REQUEST = 1500
// Binance ticks every second: the last quotes are saved at most this often.
const SAVE_INTERVAL = 5000

// Stablecoins are pegged, so they don't need a live feed.
const isLiveCrypto = (asset) => asset.type === 'crypto' && asset.symbol !== 'USDT'
const isStock = (asset) => asset.type === 'stock'

// `quotes` starts with the ones saved on the last visit and takes the live ones as they
// arrive; `ready` only counts the live ones. Stocks are only quoted with a Finnhub key.
export function useLiveQuotes(assets, finnhubKey) {
  const [savedQuotes] = useState(readSavedQuotes)
  const [quotes, setQuotes] = useState({})
  const lastSave = useRef(0)
  const [cryptoStatus, setCryptoStatus] = useState('connecting')
  const [stockStatus, setStockStatus] = useState('connecting')

  useEffect(() => {
    const symbols = assets.filter(isLiveCrypto).map((asset) => asset.symbol)
    if (!symbols.length) return

    return connectBinanceTickers(symbols, {
      onQuote: (symbol, quote) => setQuotes((prev) => ({ ...prev, [symbol]: quote })),
      onStatus: setCryptoStatus,
    })
  }, [assets])

  useEffect(() => {
    if (!finnhubKey) return

    setStockStatus('connecting')
    const symbols = assets.filter(isStock).map((asset) => asset.symbol)
    const interval = Math.max(STOCK_POLL_INTERVAL, symbols.length * MS_PER_STOCK_REQUEST)
    let timer
    let cancelled = false

    const refresh = async () => {
      try {
        const results = await Promise.all(
          symbols.map(async (symbol) => [symbol, await fetchStockQuote(symbol)]),
        )
        if (cancelled) return

        setQuotes((prev) => ({ ...prev, ...Object.fromEntries(results) }))
        setStockStatus('live')
      } catch {
        if (!cancelled) setStockStatus('error')
      }
      if (!cancelled) timer = setTimeout(refresh, interval)
    }

    refresh()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [assets, finnhubKey])

  const latestQuotes = useMemo(() => ({ ...savedQuotes, ...quotes }), [savedQuotes, quotes])

  useEffect(() => {
    if (!Object.keys(quotes).length || Date.now() - lastSave.current < SAVE_INTERVAL) return
    lastSave.current = Date.now()
    saveQuotes(latestQuotes)
  }, [quotes, latestQuotes])

  // True once every symbol with a live feed has received at least one quote.
  const ready = assets
    .filter((asset) => isLiveCrypto(asset) || (finnhubKey && isStock(asset)))
    .every((asset) => quotes[asset.symbol])

  // Without crypto to follow, the stream never opens: there's nothing to wait for.
  const hasLiveCrypto = assets.some(isLiveCrypto)

  return {
    quotes: latestQuotes,
    cryptoStatus: hasLiveCrypto ? cryptoStatus : 'idle',
    stockStatus: finnhubKey ? stockStatus : 'disabled',
    ready,
  }
}
