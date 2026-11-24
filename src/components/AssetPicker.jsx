import { useEffect, useMemo, useState } from 'react'
import { fetchCryptoMarkets } from '../services/binanceMarkets.js'
import { getFinnhubKey, searchStocks } from '../services/finnhubQuotes.js'

const MAX_NEW_PER_TYPE = 5
const SEARCH_DELAY = 300

const TYPE_LABELS = { crypto: 'Cripto', stock: 'Acción' }

// Searches the portfolio catalog first, then Binance (crypto) and Finnhub (stocks)
// for assets that aren't in the catalog yet (`isNew: true`).
export default function AssetPicker({ catalog, selected, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cryptoMarkets, setCryptoMarkets] = useState([])
  const [stockResults, setStockResults] = useState([])
  const [searching, setSearching] = useState(false)

  const term = query.trim().toUpperCase()

  useEffect(() => {
    fetchCryptoMarkets()
      .then(setCryptoMarkets)
      .catch(() => setCryptoMarkets([]))
  }, [])

  useEffect(() => {
    setStockResults([])
    if (!getFinnhubKey() || !term) {
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const results = await searchStocks(term)
        if (!cancelled) setStockResults(results)
      } catch {
        // Leave stock results empty; catalog and crypto results still show.
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, SEARCH_DELAY)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term])

  const results = useMemo(() => {
    const known = new Set(catalog.map((asset) => asset.symbol))
    const matches = (text) => text.toUpperCase().includes(term)

    const fromCatalog = catalog
      .filter((asset) => !term || matches(asset.symbol) || matches(asset.name))
      .map((asset) => ({ ...asset, isNew: false }))
    if (!term) return fromCatalog

    const newCryptos = cryptoMarkets
      .filter((market) => !known.has(market.symbol) && market.symbol.startsWith(term))
      .sort((a, b) => a.symbol.length - b.symbol.length)
      .slice(0, MAX_NEW_PER_TYPE)
      .map((market) => ({ symbol: market.symbol, name: market.symbol, type: 'crypto', price: market.price, isNew: true }))

    const newStocks = stockResults
      .filter((stock) => !known.has(stock.symbol))
      .slice(0, MAX_NEW_PER_TYPE)
      .map((stock) => ({ ...stock, type: 'stock', isNew: true }))

    return [...fromCatalog, ...newCryptos, ...newStocks]
  }, [catalog, cryptoMarkets, stockResults, term])

  const choose = (asset) => {
    onSelect(asset)
    setQuery('')
    setOpen(false)
  }

  const displayValue = open || !selected ? query : `${selected.symbol} · ${selected.name}`

  return (
    <div className="asset-picker">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-label="Activo"
        placeholder="Buscá por símbolo o nombre (ej: BTC, NVDA)"
        value={displayValue}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          // The first Escape only closes the list; stopping it here keeps the form open.
          if (event.key === 'Escape' && open) {
            event.stopPropagation()
            setOpen(false)
            return
          }
          if (event.key === 'Enter' && results.length) {
            event.preventDefault()
            choose(results[0])
          }
        }}
      />

      {open && (
        <ul className="asset-picker__list" role="listbox">
          {results.map((asset) => (
            <li key={`${asset.type}-${asset.symbol}`} role="option" aria-selected={selected?.symbol === asset.symbol}>
              {/* preventDefault keeps the input focused so blur doesn't close the list before the click lands. */}
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(asset)}>
                <strong>{asset.symbol}</strong>
                <span className="asset-picker__name">{asset.name}</span>
                <span className="asset-picker__type">
                  {TYPE_LABELS[asset.type]}
                  {asset.isNew && <span className="asset-picker__new"> · Nuevo</span>}
                </span>
              </button>
            </li>
          ))}
          {searching && <li className="asset-picker__hint">Buscando acciones…</li>}
          {!searching && !results.length && <li className="asset-picker__hint">Sin resultados.</li>}
          {!getFinnhubKey() && term && (
            <li className="asset-picker__hint">Para buscar acciones nuevas cargá tu key de Finnhub (arriba, al lado de las cotizaciones).</li>
          )}
        </ul>
      )}
    </div>
  )
}
