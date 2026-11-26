import { KeyRound } from 'lucide-react'

const LABELS = {
  live: 'En vivo',
  connecting: 'Conectando…',
  idle: 'Sin activos',
  offline: 'Sin conexión',
  partial: 'Parcial',
  error: 'Error',
  disabled: 'Sin key',
}

const COLORS = {
  live: 'var(--up)',
  connecting: 'var(--accent)',
  idle: 'var(--muted)',
  offline: 'var(--down)',
  partial: 'var(--accent)',
  error: 'var(--down)',
  disabled: 'var(--muted)',
}

// `detail` goes after the label; `hint` is the tooltip.
function Item({ name, status, detail, hint }) {
  return (
    <span className="live-status__item" title={hint}>
      <span className="live-status__dot" style={{ background: COLORS[status] }} />
      {name}: {LABELS[status]}
      {detail && ` (${detail})`}
    </span>
  )
}

// Up to three symbols by name; the rest as a count.
const listSymbols = (symbols) =>
  symbols.length > 3 ? `${symbols.slice(0, 3).join(', ')} y ${symbols.length - 3} más` : symbols.join(', ')

// Stock quotes need the user's Finnhub key: `onEditKey` opens the form to enter or change it.
// `failedStocks` are the ones the last refresh couldn't quote: named while only some failed.
export default function LiveStatus({ cryptoStatus, stockStatus, failedStocks = [], onEditKey }) {
  const partial = stockStatus === 'partial' && failedStocks.length > 0

  return (
    <div className="live-status">
      <Item name="Cripto" status={cryptoStatus} />
      <Item
        name="Acciones"
        status={stockStatus}
        detail={partial ? `sin ${listSymbols(failedStocks)}` : null}
        hint={
          partial
            ? `No se pudo cotizar: ${failedStocks.join(', ')}. Siguen con su último precio.`
            : undefined
        }
      />
      <button type="button" className="live-status__key" onClick={onEditKey}>
        <KeyRound size={13} /> {stockStatus === 'disabled' ? 'Cargar key de Finnhub' : 'Key de Finnhub'}
      </button>
    </div>
  )
}
