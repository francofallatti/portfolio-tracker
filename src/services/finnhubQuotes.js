// REST API from Finnhub. The key is the user's own and is entered in the app: it's kept
// with the rest of the data (settings.json) and loaded on start. It's exposed to the
// browser, so use a key with no billing and rotate it if shared.
const BASE_URL = 'https://finnhub.io/api/v1'

let apiKey = ''

export const getFinnhubKey = () => apiKey

export const setFinnhubKey = (key) => {
  apiKey = key ?? ''
}

const request = async (path, params) => {
  const query = new URLSearchParams({ ...params, token: apiKey })
  const response = await fetch(`${BASE_URL}${path}?${query}`)
  if (!response.ok) throw new Error(`Finnhub ${response.status} for ${path}`)

  return response.json()
}

// Whether Finnhub accepts `key`, asked before saving it. Throws if it can't be asked.
export async function isFinnhubKeyAccepted(key) {
  let response
  try {
    response = await fetch(`${BASE_URL}/quote?${new URLSearchParams({ symbol: 'AAPL', token: key })}`)
  } catch {
    throw new Error('No se pudo verificar la key: revisá la conexión.')
  }
  if (response.status === 401 || response.status === 403) return false
  if (!response.ok) throw new Error(`No se pudo verificar la key (Finnhub respondió ${response.status}).`)
  return true
}

// Finnhub answers a symbol it doesn't know with price 0 instead of an error: taken as
// a quote, it would value the whole position at $0.
export async function fetchStockQuote(symbol) {
  const data = await request('/quote', { symbol })
  if (!(data.c > 0)) throw new Error(`Finnhub has no price for ${symbol}`)
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
