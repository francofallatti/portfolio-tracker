import { fetchStockProfile, fetchStockQuote } from './finnhubQuotes.js'
import { pickColor } from '../utils/colors.js'

// Builds the assets.json entry for an asset found in a market search.
// `usedColors` (the catalog's) lets the new asset get a color nobody has yet.
export async function toCatalogAsset(result, usedColors) {
  const color = pickColor(result.symbol, usedColors)

  if (result.type === 'crypto') {
    return {
      symbol: result.symbol,
      name: result.name,
      type: 'crypto',
      category: 'Crypto',
      color,
      price: result.price,
      change24h: 0,
    }
  }

  const [quote, profile] = await Promise.all([fetchStockQuote(result.symbol), fetchStockProfile(result.symbol)])

  return {
    symbol: result.symbol,
    name: profile.name || result.name || result.symbol,
    type: 'stock',
    category: profile.finnhubIndustry || (result.kind === 'ETP' ? 'ETF' : 'Stock'),
    color,
    price: quote.price,
    change24h: quote.change24h ?? 0,
  }
}
