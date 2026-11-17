const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usdCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const formatUSD = (value) => usd.format(value)

export const formatAxisUSD = (value) => usdCompact.format(value)

export const formatSignedUSD = (value) => `${value >= 0 ? '+' : '-'}${usd.format(Math.abs(value))}`

const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const arsCompact = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  notation: 'compact',
  maximumFractionDigits: 1,
})
export const formatARS = (value) => ars.format(value)

// Next to amounts in pesos, a dollar amount says so: '$1,234.56' → 'US$1,234.56'.
const labelUSD = (text) => text.replace('$', 'US$')

// Formatters for amounts kept in dollars. `format`, `formatSigned` and `formatAxis` show
// them in the display currency: dollars, or pesos at `rate` (pesos per dollar) when there
// is one. `formatUSD` and `formatSignedUSD` are for records of what happened in dollars
// (an order's price, a deposit), which stay in dollars and say so while showing pesos.
export function moneyFormatters(rate) {
  if (!rate) {
    return { format: formatUSD, formatSigned: formatSignedUSD, formatAxis: formatAxisUSD, formatUSD, formatSignedUSD }
  }

  return {
    format: (value) => ars.format(value * rate),
    formatSigned: (value) => `${value >= 0 ? '+' : '-'}${ars.format(Math.abs(value * rate))}`,
    formatAxis: (value) => arsCompact.format(value * rate),
    formatUSD: (value) => labelUSD(formatUSD(value)),
    formatSignedUSD: (value) => labelUSD(formatSignedUSD(value)),
  }
}

export const formatPercent = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`

export const formatQuantity = (value) => value.toLocaleString('en-US', { maximumFractionDigits: 8 })

const timeFormat = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' })
const dateTimeFormat = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormat = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const monthFormat = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit' })

// A day with its year ('28/10/2026') and a month ('oct 26'), for the long ranges of the history.
export const formatDate = (timestamp) => dateFormat.format(timestamp)

export const formatMonth = (timestamp) => monthFormat.format(timestamp)

export const formatTime = (timestamp) => timeFormat.format(timestamp)

export const formatDay = (timestamp) => dayFormat.format(timestamp)

export const formatDateTime = (timestamp) => dateTimeFormat.format(timestamp)

// Formats the day of a 'YYYY-MM-DD[THH:mm]' date as-is; parsing it with Date would shift it to UTC.
export const formatIsoDate = (isoDate) => isoDate.slice(0, 10).split('-').reverse().join('/')

// A transaction's day, plus its time of day when it has one: '28/10/2026 14:30'.
export const formatTransactionDate = (date) =>
  date.length > 10 ? `${formatIsoDate(date)} ${date.slice(11, 16)}` : formatIsoDate(date)

export const trendClass = (value) => (value >= 0 ? 'up' : 'down')
