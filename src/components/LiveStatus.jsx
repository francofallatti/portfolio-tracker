import { KeyRound } from 'lucide-react'

const LABELS = {
  live: 'En vivo',
  connecting: 'Conectando…',
  idle: 'Sin activos',
  offline: 'Sin conexión',
  error: 'Error',
  disabled: 'Sin key',
}

const COLORS = {
  live: 'var(--up)',
  connecting: 'var(--accent)',
  idle: 'var(--muted)',
  offline: 'var(--down)',
  error: 'var(--down)',
  disabled: 'var(--muted)',
}

function Item({ name, status }) {
  return (
    <span className="live-status__item">
      <span className="live-status__dot" style={{ background: COLORS[status] }} />
      {name}: {LABELS[status]}
    </span>
  )
}

// Stock quotes need the user's Finnhub key: `onEditKey` opens the form to enter or change it.
export default function LiveStatus({ cryptoStatus, stockStatus, onEditKey }) {
  return (
    <div className="live-status">
      <Item name="Cripto" status={cryptoStatus} />
      <Item name="Acciones" status={stockStatus} />
      <button type="button" className="live-status__key" onClick={onEditKey}>
        <KeyRound size={13} /> {stockStatus === 'disabled' ? 'Cargar key de Finnhub' : 'Key de Finnhub'}
      </button>
    </div>
  )
}
