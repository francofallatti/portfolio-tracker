// The last quotes seen (`symbol -> { price, change24h }`), kept in this browser so the app
// opens with them instead of the prices saved in assets.json, which are never updated.
const STORAGE_KEY = 'last-quotes'

const isQuote = (quote) =>
  Number.isFinite(quote?.price) && quote.price > 0 && Number.isFinite(quote.change24h)

// Empty when nothing was saved, or when storage is unavailable or holds something else.
export function readSavedQuotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
    return Object.fromEntries(Object.entries(saved).filter(([, quote]) => isQuote(quote)))
  } catch {
    return {}
  }
}

export function saveQuotes(quotes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes))
  } catch {
    // Not persisted; the next load starts from the catalog's prices.
  }
}
