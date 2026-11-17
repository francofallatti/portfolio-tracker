import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import ColorPicker from './ColorPicker.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import PriceChart from './PriceChart.jsx'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape.js'
import { useMoney } from '../hooks/useMoney.js'
import { STABLECOIN, buildLedger } from '../utils/portfolio.js'
import {
  formatPercent,
  formatQuantity,
  formatTransactionDate,
  trendClass,
} from '../utils/format.js'

const TYPE_LABELS = { buy: 'Compra', sell: 'Venta', income: 'Renta', split: 'Split' }

// What an order row says: its size and price, for income what was received,
// and for a split its ratio and the quantity it left. Amounts stay in dollars (`money.formatUSD`).
function describe(order, symbol, money) {
  if (order.type === 'split') {
    return `${formatQuantity(order.newShares)}:${formatQuantity(order.oldShares)} → ${formatQuantity(order.quantityAfter)} ${symbol}`
  }
  if (order.type === 'income') {
    return order.amount ? `${money.formatUSD(order.amount)} en efectivo` : `${formatQuantity(order.quantity)} ${symbol} con costo 0`
  }
  return `${formatQuantity(order.quantity)} ${symbol} a ${money.formatUSD(order.price)}`
}

// Side panel with a holding's summary and its full order history.
export default function AssetDetail({
  asset,
  transactions,
  onClose,
  onEditAsset,
  onAddOrder,
  onEditOrder,
  onDeleteOrders,
  onChangeColor,
}) {
  const money = useMoney()
  const [error, setError] = useState('')

  // Newest first for reading; the ledger itself is computed oldest first.
  const orders = useMemo(() => buildLedger(transactions).reverse(), [transactions])
  // The USDT side of a trade settled in USDT (`sourceId`) belongs to that trade: it's edited or deleted from there.
  const ownOrders = orders.filter((order) => !order.sourceId)

  useCloseOnEscape(onClose)

  // Runs a save or delete and shows why it failed, if it does.
  const attempt = async (action) => {
    setError('')
    try {
      await action()
    } catch (actionError) {
      setError(actionError.message)
    }
  }

  const deleteOrders = (ids) => attempt(() => onDeleteOrders(ids))
  const changeColor = (color) => attempt(() => onChangeColor(color))

  // A closed position (sold out, quantity 0) only keeps what it left: its realized result and income.
  const closed = asset.quantity === 0
  const results = [
    { label: 'Resultado realizado', value: money.formatSigned(asset.realized), trend: asset.realized },
    // Dividends and interest paid in cash; income paid in kind is already in the unrealized result (cost 0).
    ...(asset.income > 0 ? [{ label: 'Rentas cobradas', value: money.formatSigned(asset.income), trend: asset.income }] : []),
  ]
  const stats = closed
    ? results
    : [
        { label: 'Cantidad', value: `${formatQuantity(asset.quantity)} ${asset.symbol}` },
        { label: 'Monto actual', value: money.format(asset.value) },
        { label: 'PPC', value: money.format(asset.avgCost) },
        { label: 'Invertido', value: money.format(asset.cost) },
        {
          label: 'Resultado no realizado',
          value: `${money.formatSigned(asset.gain)} (${formatPercent(asset.gainPercent)})`,
          trend: asset.gain,
        },
        ...results,
        { label: 'Peso en el portfolio', value: `${asset.weight.toFixed(2)}%` },
      ]

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
            <span className="asset-icon" style={{ background: asset.color }}>
              {asset.symbol[0]}
            </span>
            <h3 id="drawer-title">{asset.name}</h3>
            <span className="ticker">{asset.symbol}</span>
            <ColorPicker value={asset.color} onChange={changeColor} />
            <button
              type="button"
              className="order__edit"
              title="Editar nombre, categoría y ratio"
              aria-label="Editar activo"
              onClick={onEditAsset}
            >
              <Pencil size={16} />
            </button>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="drawer__price">
          <strong>{money.format(asset.price)}</strong>
          <span className={trendClass(asset.change24h)}>{formatPercent(asset.change24h)} 24h</span>
          {closed && <span className="badge">Posición cerrada</span>}
        </div>

        <dl className="stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd className={stat.trend === undefined ? '' : trendClass(stat.trend)}>{stat.value}</dd>
            </div>
          ))}
        </dl>

        {/* The stablecoin is always worth 1: nothing to plot. */}
        {asset.symbol !== STABLECOIN && <PriceChart asset={asset} transactions={transactions} />}

        <section className="drawer__section">
          <div className="drawer__section-header">
            <h4>Movimientos ({orders.length})</h4>
            <button type="button" className="add-button add-button--small" onClick={onAddOrder}>
              <Plus size={14} /> Nueva orden
            </button>
          </div>

          {error && <p className="modal__error">{error}</p>}

          <ul className="orders">
            {orders.map((order) => {
              const fee = order.fee ?? 0
              const gross = order.quantity * order.price
              const total = order.type === 'buy' ? gross + fee : gross - fee

              return (
                <li key={order.id} className="order">
                  <span className={`order__type order__type--${order.type}`}>{TYPE_LABELS[order.type]}</span>
                  <div className="order__main">
                    <strong>{describe(order, asset.symbol, money)}</strong>
                    <span className="order__meta">
                      {formatTransactionDate(order.date)}
                      {(order.type === 'buy' || order.type === 'sell') && ` · Total ${money.formatUSD(total)}`}
                      {order.type === 'split' && ` · PPC ${money.formatUSD(order.avgCostAfter)}`}
                      {fee > 0 && ` · Comisión ${money.formatUSD(fee)}`}
                      {order.source && ` · Generada por ${order.source}`}
                      {order.proceeds === 'usdt' && ' · Cobrada en USDT'}
                      {order.funding === 'usdt' && ' · Pagada con USDT'}
                      {order.sourceSymbol &&
                        ` · ${order.type === 'buy' ? 'Cobro de la venta' : 'Pago de la compra'} de ${order.sourceSymbol}`}
                    </span>
                  </div>
                  {order.realized !== null && (
                    <span className={`order__result ${trendClass(order.realized)}`}>
                      {money.formatSignedUSD(order.realized)}
                    </span>
                  )}
                  {order.sourceId ? (
                    <span className="order__delete-placeholder" />
                  ) : (
                    <div className="order__actions">
                      <button type="button" className="order__edit" aria-label="Editar orden" onClick={() => onEditOrder(order.id)}>
                        <Pencil size={16} />
                      </button>
                      <ConfirmButton
                        className="order__delete"
                        ariaLabel="Borrar orden"
                        confirmLabel="¿Borrar?"
                        onConfirm={() => deleteOrders([order.id])}
                      >
                        <Trash2 size={16} />
                      </ConfirmButton>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {ownOrders.length > 0 && (
          <div className="drawer__footer">
            <p className="modal__hint">
              Borra todas las órdenes de {asset.symbol}, como si nunca la hubieras tenido. Si la vendiste, registrá una venta.
            </p>
            <ConfirmButton
              className="danger-button"
              confirmLabel={`¿Borrar ${ownOrders.length} órdenes?`}
              onConfirm={() => deleteOrders(ownOrders.map((order) => order.id))}
            >
              <Trash2 size={16} /> Eliminar tenencia
            </ConfirmButton>
          </div>
        )}
      </aside>
    </div>
  )
}
