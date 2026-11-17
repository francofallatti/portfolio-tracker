import { formatARS, formatDateTime } from '../utils/format.js'

// Picks the display currency: dollars, or pesos at the CCL dollar (`rates`, null until they load).
// Amounts in pesos wait in dollars until the rate arrives.
export default function CurrencyToggle({ currency, rates, failed, onChange }) {
  const rateLabel = () => {
    if (rates) return `Dólar CCL ${formatARS(rates.ccl)}`
    return failed ? 'No se pudo cargar el dólar CCL' : 'Cargando dólar CCL…'
  }

  return (
    <div className="currency-toggle">
      <div className="segmented" role="group" aria-label="Moneda">
        <button type="button" aria-pressed={currency === 'USD'} onClick={() => onChange('USD')}>
          USD
        </button>
        <button type="button" aria-pressed={currency === 'ARS'} onClick={() => onChange('ARS')}>
          ARS
        </button>
      </div>
      {currency === 'ARS' && (
        <span title={rates ? `Venta, actualizado el ${formatDateTime(rates.updatedAt)}` : undefined}>{rateLabel()}</span>
      )}
    </div>
  )
}
