// REST API from Finnhub. The key lives in VITE_FINNHUB_API_KEY, which is
// exposed to the browser, so use a key with no billing and rotate it if shared.
const BASE_URL = 'https://finnhub.io/api/v1'

export const FINNHUB_API_KEY = import.meta.env.VITE_FINNHUB_API_KEY

const request = async (path, params) => {
  const query = new URLSearchParams({ ...params, token: FINNHUB_API_KEY })
  const response = await fetch(`${BASE_URL}${path}?${query}`)
  if (!response.ok) throw new Error(`Finnhub ${response.status} for ${path}`)

  return response.json()
}

export async function fetchStockQuote(symbol) {
  const data = await request('/quote', { symbol })
  return { price: data.c, change24h: data.dp }
}

// US listings only: symbols with a suffix (NVDA.TO, NVDA.MX…) are other
// exchanges, which the free plan can't quote.
export async function searchStocks(query) {
  const data = await request('/search', { q: query })
  return data.result
    .filter((item) => !item.symbol.includes('.'))
    .map((item) => ({ symbol: item.symbol, name: item.description, kind: item.type }))
}

// Returns {} for ETFs and funds.
export function fetchStockProfile(symbol) {
  return request('/stock/profile2', { symbol })
}
