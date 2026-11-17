import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Pencil, Trash2, X } from 'lucide-react'
import ConfirmButton from './ConfirmButton.jsx'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape.js'
import { useMoney } from '../hooks/useMoney.js'
import { buildCashLedger } from '../utils/portfolio.js'
import { formatQuantity, formatTransactionDate, trendClass } from '../utils/format.js'

const TYPE_LABELS = { deposit: 'Depósito', withdrawal: 'Retiro', buy: 'Compra', sell: 'Venta', income: 'Renta' }

// Amounts stay in dollars (`money.formatUSD`): each movement is a record of what happened.
function describe(movement, money) {
  if (movement.type === 'income') return `Renta de ${movement.symbol}`
  if (movement.symbol) return `${formatQuantity(movement.quantity)} ${movement.symbol} a ${money.formatUSD(movement.price)}`
  return 'Movimiento de efectivo'
}

// Side panel for the USD cash balance: every movement that changed it, newest first.
export default function CashDetail({ cash, transactions, contributions, onClose, onAddMovement, onEditMovement, onDeleteOrders }) {
  const money = useMoney()
  const [error, setError] = useState('')
  const movements = useMemo(() => buildCashLedger(transactions).reverse(), [transactions])

  useCloseOnEscape(onClose)

  const deleteMovement = async (id) => {
    setError('')
    try {
      await onDeleteOrders([id])
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer__header">
          <div className="asset-name">
            <span className="asset-icon" style={{ background: cash.color }}>
              $
            </span>
            <h3 id="drawer-title">{cash.name}</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="drawer__price">
          <strong>{money.format(cash.quantity)}</strong>
          <span className="label">disponible</span>
        </div>

        <dl className="stats">
          <div>
            <dt>Peso en el portfolio</dt>
            <dd>{cash.weight.toFixed(2)}%</dd>
          </div>
          <div>
            <dt>Aportes netos al portfolio</dt>
            <dd>{money.format(contributions)}</dd>
          </div>
        </dl>

        <div className="drawer__actions">
          <button type="button" className="add-button add-button--small" onClick={() => onAddMovement('deposit')}>
            <ArrowDownToLine size={14} /> Depositar
          </button>
          <button type="button" className="ghost-button" onClick={() => onAddMovement('withdrawal')}>
            <ArrowUpFromLine size={14} /> Retirar
          </button>
        </div>

        <section className="drawer__section">
          <div className="drawer__section-header">
            <h4>Movimientos ({movements.length})</h4>
          </div>

          {error && <p className="modal__error">{error}</p>}

          <ul className="orders">
            {movements.map((movement) => (
              <li key={movement.id} className="order">
                <span className={`order__type order__type--${movement.type}`}>{TYPE_LABELS[movement.type]}</span>
                <div className="order__main">
                  <strong>{describe(movement, money)}</strong>
                  <span className="order__meta">
                    {formatTransactionDate(movement.date)} · Saldo {money.formatUSD(movement.balanceAfter)}
                  </span>
                </div>
                <span className={`order__result ${trendClass(movement.cashAmount)}`}>
                  {money.formatSignedUSD(movement.cashAmount)}
                </span>
                {movement.symbol ? (
                  // Trades belong to their asset; changing them here would hide that side effect.
                  <span className="order__delete-placeholder" />
                ) : (
                  <div className="order__actions">
                    <button
                      type="button"
                      className="order__edit"
                      aria-label="Editar movimiento"
                      onClick={() => onEditMovement(movement.id)}
                    >
                      <Pencil size={16} />
                    </button>
                    <ConfirmButton
                      className="order__delete"
                      ariaLabel="Borrar movimiento"
                      confirmLabel="¿Borrar?"
                      onConfirm={() => deleteMovement(movement.id)}
                    >
                      <Trash2 size={16} />
                    </ConfirmButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div className="drawer__footer">
          <p className="modal__hint">
            Las ventas y las rentas en efectivo acreditan acá su neto, y las compras pagadas con efectivo lo descuentan.
            Para editar o borrar una compra, venta o renta, hacelo desde el detalle de su activo.
          </p>
        </div>
      </aside>
    </div>
  )
}
