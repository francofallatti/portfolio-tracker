const LABELS = {
  live: 'En vivo',
  connecting: 'Conectando…',
  offline: 'Sin conexión',
  error: 'Error',
  disabled: 'Sin API key (datos de ejemplo)',
}

const COLORS = {
  live: 'var(--up)',
  connecting: 'var(--accent)',
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

export default function LiveStatus({ cryptoStatus, stockStatus }) {
  return (
    <div className="live-status">
      <Item name="Cripto" status={cryptoStatus} />
      <Item name="Acciones" status={stockStatus} />
    </div>
  )
}
