import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAssetPrices } from '../hooks/useAssetPrices.js'
import { useMoney } from '../hooks/useMoney.js'
import {
  formatDate,
  formatDateTime,
  formatDay,
  formatMonth,
  formatPercent,
  formatQuantity,
  formatTime,
  trendClass,
} from '../utils/format.js'
import { HISTORY_RANGES, firstTransactionTime, tradeMarkers } from '../utils/history.js'

const DAY = 24 * 60 * 60 * 1000
// "Todo" starts a bit before the first trade, so its mark isn't stuck to the edge.
const LEAD = 7 * DAY
const UP = '#22c55e'
const DOWN = '#ef4444'
const TRADE_LABELS = { buy: 'Compra', sell: 'Venta' }

// The X axis shows hours within a day, days up to a few months and months beyond that.
const tickFormatter = (span) => {
  if (span <= DAY) return formatTime
  return span <= 120 * DAY ? formatDay : formatMonth
}

// A trade's mark: a green triangle pointing up for a buy, a red one pointing down for a sell.
function TradeMark({ cx, cy, type }) {
  const size = 6
  const tip = type === 'buy' ? cy - size : cy + size
  const base = type === 'buy' ? cy + size * 0.7 : cy - size * 0.7
  return (
    <polygon
      points={`${cx},${tip} ${cx - size},${base} ${cx + size},${base}`}
      fill={type === 'buy' ? UP : DOWN}
      stroke="#15151c"
      strokeWidth={1.5}
    />
  )
}

// The price at the hovered point and the trades made around it (the records stay in dollars).
function PriceTooltip({ active, payload, symbol, tradesAt, formatLabel, money }) {
  if (!active || !payload?.length) return null
  const { time, price } = payload[0].payload
  const trades = tradesAt.get(time) ?? []

  return (
    <div className="chart-tooltip">
      <span className="muted">{formatLabel(time)}</span>
      <br />
      <strong>{money.format(price)}</strong>
      {trades.length > 0 && (
        <ul>
          {trades.map(({ id, type, transaction }) => (
            <li key={id}>
              <span className={type === 'buy' ? 'up' : 'down'}>{TRADE_LABELS[type]}</span>
              {formatQuantity(transaction.quantity)} {symbol} a {money.formatUSD(transaction.price)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// The asset's price over the selected range, ending at the live price, with its buys and
// sells marked at the price they were made at (tradeMarkers, split-adjusted like the
// prices) and the average cost (PPC) of what is held as a dashed line.
// `transactions` are the asset's own.
export default function PriceChart({ asset, transactions }) {
  const money = useMoney()
  const [rangeKey, setRangeKey] = useState('all')
  const range = HISTORY_RANGES.find((item) => item.key === rangeKey)
  const daily = range.resolution === 'day'

  const firstTime = useMemo(() => firstTransactionTime(transactions), [transactions])
  const from = useMemo(() => {
    const now = Date.now()
    if (Number.isFinite(range.duration)) return now - range.duration
    return Number.isFinite(firstTime) ? firstTime - LEAD : now - 90 * DAY
  }, [range, firstTime])
  const { points, loading, failed } = useAssetPrices(asset, range.resolution, from)
  const markers = useMemo(() => tradeMarkers(transactions), [transactions])

  const now = Date.now()
  const data = [...points.filter((point) => point.time < now), { time: now, price: asset.price }]
  const hasPrices = data.length > 1
  const start = data[0]
  const visibleMarkers = hasPrices ? markers.filter((marker) => marker.time >= start.time) : []

  // Each trade shows in the tooltip of the point closest to it.
  const tradesAt = new Map()
  for (const marker of visibleMarkers) {
    const closest = data.reduce((best, point) =>
      Math.abs(point.time - marker.time) < Math.abs(best.time - marker.time) ? point : best,
    )
    tradesAt.set(closest.time, [...(tradesAt.get(closest.time) ?? []), marker])
  }

  const change = start.price > 0 ? (asset.price / start.price - 1) * 100 : null
  const color = (change ?? 0) >= 0 ? UP : DOWN
  const showAvgCost = asset.quantity > 0 && asset.avgCost > 0
  // Cheap assets need the cents on the axis.
  const formatPrice = Math.max(...data.map((point) => point.price)) < 100 ? money.format : money.formatAxis
  const formatLabel = (time) => (daily && time !== now ? formatDate(time) : formatDateTime(time))

  return (
    <section className="drawer__section">
      <div className="drawer__section-header">
        <h4>Precio</h4>
        <div className="segmented" role="group" aria-label="Rango temporal">
          {HISTORY_RANGES.map((item) => (
            <button key={item.key} type="button" aria-pressed={rangeKey === item.key} onClick={() => setRangeKey(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && hasPrices && (
        <p
          className="chart__summary chart__summary--price"
          title="Cuánto cambió el precio del activo en el rango. No es el resultado de tu posición: ese depende de a qué precio compraste cada vez y está arriba, en “Resultado no realizado”."
        >
          {change !== null && (
            <>
              Precio {range.label}: <strong className={trendClass(change)}>{formatPercent(change)}</strong>
            </>
          )}
          <span className="chart__legend">
            <span className="chart__mark chart__mark--buy" /> Compra
            <span className="chart__mark chart__mark--sell" /> Venta
            {showAvgCost && (
              <>
                <span className="chart__dash" /> PPC
              </>
            )}
          </span>
        </p>
      )}

      <div className="chart chart--price">
        {loading ? (
          <p className="chart__empty">Cargando precios…</p>
        ) : hasPrices ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2a2a33" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={tickFormatter(now - start.time)}
                stroke="#8b8b96"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                minTickGap={32}
              />
              <YAxis
                domain={['auto', 'auto']}
                stroke="#8b8b96"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                width={70}
                tickFormatter={formatPrice}
              />
              <Tooltip
                content={<PriceTooltip symbol={asset.symbol} tradesAt={tradesAt} formatLabel={formatLabel} money={money} />}
              />
              <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#priceFill)" dot={false} />
              {showAvgCost && (
                <ReferenceLine
                  y={asset.avgCost}
                  stroke="#8b8b96"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                />
              )}
              {visibleMarkers.map((marker) => (
                <ReferenceDot
                  key={marker.id}
                  x={marker.time}
                  y={marker.price}
                  ifOverflow="extendDomain"
                  shape={(props) => <TradeMark {...props} type={marker.type} />}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="chart__empty">
            {failed ? 'No se pudieron cargar los precios históricos.' : 'No hay precios en este rango.'}
          </p>
        )}
      </div>
    </section>
  )
}
