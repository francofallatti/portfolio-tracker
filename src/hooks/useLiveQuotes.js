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
// Every quote re-renders the whole app, and each crypto ticks on its own every second:
// they are collected and applied together, at most this often.
const QUOTE_BATCH_INTERVAL = 2000

// Stablecoins are pegged, so they don't need a live feed.
const isLiveCrypto = (asset) => asset.type === 'crypto' && asset.symbol !== 'USDT'
const isStock = (asset) => asset.type === 'stock'

// `quotes` starts with the ones saved on the last visit and takes the live ones as they
// arrive; `ready` only counts the live ones. Stocks are only quoted with a Finnhub key.
// `assets` are the ones to quote. The feeds follow their symbols, not the array: editing
// a name or a color doesn't reconnect the stream or restart the polling.
export function useLiveQuotes(assets, finnhubKey) {
  const cryptoKey = assets.filter(isLiveCrypto).map((asset) => asset.symbol).join(',')
  const stockKey = assets.filter(isStock).map((asset) => asset.symbol).join(',')
  const [savedQuotes] = useState(readSavedQuotes)
  const [quotes, setQuotes] = useState({})
  const lastSave = useRef(0)
  const [cryptoStatus, setCryptoStatus] = useState('connecting')
  const [stockStatus, setStockStatus] = useState('connecting')
  // The stocks left out of the last refresh, shown next to the status.
  const [failedStocks, setFailedStocks] = useState([])

  useEffect(() => {
    if (!cryptoKey) return
    const symbols = cryptoKey.split(',')

    let pending = {}
    let timer = null
    let lastFlush = 0

    const flush = () => {
      timer = null
      lastFlush = Date.now()
      const batch = pending
      pending = {}
      setQuotes((prev) => ({ ...prev, ...batch }))
    }

    const disconnect = connectBinanceTickers(symbols, {
      // The first quotes go out right away; after that, one update per interval.
      onQuote: (symbol, quote) => {
        pending[symbol] = quote
        timer ??= setTimeout(flush, Math.max(0, QUOTE_BATCH_INTERVAL - (Date.now() - lastFlush)))
      },
      onStatus: setCryptoStatus,
    })

    return () => {
      clearTimeout(timer)
      disconnect()
    }
  }, [cryptoKey])

  useEffect(() => {
    if (!finnhubKey) return

    setStockStatus('connecting')
    const symbols = stockKey ? stockKey.split(',') : []
    const interval = Math.max(STOCK_POLL_INTERVAL, symbols.length * MS_PER_STOCK_REQUEST)
    let timer
    let cancelled = false

    // A symbol that fails keeps its last quote and doesn't hold back the others.
    const refresh = async () => {
      const results = await Promise.allSettled(symbols.map(fetchStockQuote))
      if (cancelled) return

      const fresh = {}
      const failed = []
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') fresh[symbols[index]] = result.value
        else failed.push(symbols[index])
      })
      // Kept as it is while the same ones fail, so a refresh doesn't re-render for nothing.
      setFailedStocks((prev) => (prev.join() === failed.join() ? prev : failed))
      const quoted = Object.keys(fresh).length
      if (quoted) setQuotes((prev) => ({ ...prev, ...fresh }))
      if (quoted === symbols.length) setStockStatus('live')
      else setStockStatus(quoted ? 'partial' : 'error')

      timer = setTimeout(refresh, interval)
    }

    refresh()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [stockKey, finnhubKey])

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
    failedStocks: finnhubKey ? failedStocks : [],
    ready,
  }
}
