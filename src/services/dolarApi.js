// DolarApi: public Argentine exchange rates, no API key, with CORS.
const RATES_URL = 'https://dolarapi.com/v1/dolares'

// The MEP dollar ("bolsa") and the CCL dollar ("contadoconliqui"), in pesos per dollar at
// their selling price (the quote everybody calls "el MEP"), and when they were updated.
export async function fetchDollarRates() {
  const response = await fetch(RATES_URL)
  if (!response.ok) throw new Error(`DolarApi ${response.status}`)

  const quotes = await response.json()
  const quoteOf = (house) => quotes.find((quote) => quote.casa === house)
  const mep = quoteOf('bolsa')
  const ccl = quoteOf('contadoconliqui')
  if (!mep || !ccl) throw new Error('DolarApi has no MEP or CCL')

  return { mep: mep.venta, ccl: ccl.venta, updatedAt: Date.parse(mep.fechaActualizacion) }
}

// ArgentinaDatos: the daily history of the same rates (no API key, with CORS).
// The whole CCL history comes in one response, asked for once per load.
const CCL_HISTORY_URL = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/contadoconliqui'
let cclHistory = null

const loadCclHistory = () => {
  cclHistory ??= fetch(CCL_HISTORY_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`ArgentinaDatos ${response.status}`)
      return response.json()
    })
    .then((rows) => new Map(rows.map((row) => [row.fecha, row.venta])))
    .catch((error) => {
      cclHistory = null
      throw error
    })
  return cclHistory
}

// The CCL dollar (selling price) of `day` ('YYYY-MM-DD', local): today's live one, or the
// closing one of that day or of the last business day before it.
export async function fetchCclOn(day) {
  // Swedish dates are 'YYYY-MM-DD'.
  if (day >= new Date().toLocaleDateString('sv-SE')) return (await fetchDollarRates()).ccl

  const rates = await loadCclHistory()
  const date = new Date(`${day}T12:00:00Z`)
  for (let i = 0; i < 10; i++, date.setUTCDate(date.getUTCDate() - 1)) {
    const rate = rates.get(date.toISOString().slice(0, 10))
    if (rate) return rate
  }
  throw new Error(`No CCL for ${day}`)
}
