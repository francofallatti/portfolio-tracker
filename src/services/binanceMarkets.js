// Public market data REST API (no API key needed).
const TICKERS_URL = 'https://data-api.binance.vision/api/v3/ticker/price'

let marketsPromise

// Every crypto tradable against USDT, which is what the live price stream supports.
// Fetched once per page load.
export function fetchCryptoMarkets() {
  marketsPromise ??= fetch(TICKERS_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`Binance ${response.status}`)
      return response.json()
    })
    .then((tickers) =>
      tickers
        .filter((ticker) => ticker.symbol.endsWith('USDT'))
        .map((ticker) => ({ symbol: ticker.symbol.slice(0, -4), price: Number(ticker.price) })),
    )
    .catch((error) => {
      marketsPromise = undefined
      throw error
    })

  return marketsPromise
}
