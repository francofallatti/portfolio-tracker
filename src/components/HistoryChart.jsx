import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  formatDate,
  formatDateTime,
  formatDay,
  formatMonth,
  formatPercent,
  formatTime,
  trendClass,
} from '../utils/format.js'
import { useMoney } from '../hooks/useMoney.js'
import { HISTORY_RANGES, contributedUntil, periodReturn } from '../utils/history.js'

const DAY = 24 * 60 * 60 * 1000

// The X axis shows hours within a day, days up to a few months and months beyond that.
const tickFormatter = (span) => {
  if (span <= DAY) return formatTime
  return span <= 120 * DAY ? formatDay : formatMonth
}

const tooltipStyle = {
  background: '#1c1c24',
  border: '1px solid #2a2a33',
  borderRadius: 8,
}

// Plots the series for the selected range (`rangeKey`, one of HISTORY_RANGES; the series
// comes with a point per hour or per day to match it), ending at the live value, next to the money
// put in up to each point (the `flows` so far, the dashed "Aportado" line). The gap
// between both is the gain, so the range's result leaves deposits and withdrawals out.
// Its % is over the average capital at work in the range (periodReturn).
// `scope` names the group being shown when it's not the whole portfolio.
// Points before `estimatedUntil` (ms) are estimates: that stretch is shaded and explained.
export default function HistoryChart({
  rangeKey,
  onRangeChange,
  snapshots,
  currentValue,
  flows,
  loading = false,
  estimatedUntil = null,
  scope,
}) {
  const money = useMoney()
  const range = HISTORY_RANGES.find((item) => item.key === rangeKey)

  const now = Date.now()
  const data = [
    ...snapshots
      .map((snapshot) => ({ time: Date.parse(snapshot.timestamp), value: snapshot.value }))
      .filter((point) => now - point.time <= range.duration),
    { time: now, value: currentValue },
  ].map((point) => ({ ...point, contributed: contributedUntil(flows, point.time) }))
  const hasHistory = data.length > 1
  const daily = range.resolution === 'day'
  const formatTick = tickFormatter(data.at(-1).time - data[0].time)
  const gainOf = (point) => point.value - point.contributed
  const rangeResult = gainOf(data.at(-1)) - gainOf(data[0])
  const rangeReturn = hasHistory ? periodReturn(data[0], data.at(-1), flows) : null
  const isUp = rangeResult >= 0
  const color = isUp ? '#22c55e' : '#ef4444'
  const estimateEnd = Math.min(estimatedUntil ?? 0, now)
  const showEstimate = !loading && hasHistory && estimateEnd > data[0].time

  return (
    <div className="card">
      <div className="card__header">
        <h3>
          Historia {scope && <span className="card__scope">· {scope}</span>}
        </h3>
        <div className="segmented" role="group" aria-label="Rango temporal">
          {HISTORY_RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={rangeKey === item.key}
              onClick={() => onRangeChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && hasHistory && (
        <p
          className="chart__summary"
          title="Cuánto cambió el valor en el rango, sin contar lo que aportaste o retiraste. El % es sobre el capital promedio invertido en el rango."
        >
          Rendimiento {range.label}:{' '}
          <strong className={trendClass(rangeResult)}>
            {money.formatSigned(rangeResult)}
            {rangeReturn !== null && ` (${formatPercent(rangeReturn)})`}
          </strong>
          <span className="chart__legend">
            <span className="chart__dash" /> Aportado
          </span>
        </p>
      )}

      <div className="chart chart--area">
        {loading ? (
          <p className="chart__empty">Cargando historial…</p>
        ) : hasHistory ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="historyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2a2a33" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={formatTick}
                stroke="#8b8b96"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                minTickGap={32}
              />
              <YAxis
                domain={['dataMin - 50', 'dataMax + 50']}
                stroke="#8b8b96"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                width={70}
                tickFormatter={money.formatAxis}
              />
              <Tooltip
                formatter={(value) => money.format(value)}
                labelFormatter={(time) => (daily && time !== now ? formatDate(time) : formatDateTime(time))}
                contentStyle={tooltipStyle}
                labelStyle={{ color: '#a1a1aa' }}
              />
              {showEstimate && <ReferenceArea x1={data[0].time} x2={estimateEnd} fill="#ffffff" fillOpacity={0.04} />}
              <Area
                name="Valor"
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill="url(#historyFill)"
                dot={false}
              />
              {/* Money only moves on transaction days: a step, not a curve. */}
              <Area
                name="Aportado"
                type="stepAfter"
                dataKey="contributed"
                stroke="#8b8b96"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="chart__empty">
            Todavía no hay historial en este rango. Se guarda un punto por hora mientras la app está abierta.
          </p>
        )}
      </div>

      {showEstimate && (
        <p className="chart__note">
          No se pudieron cargar los precios históricos de las acciones: hasta el {formatDateTime(estimateEnd)}, el valor
          se calcula con los precios de hoy (zona sombreada).
        </p>
      )}
    </div>
  )
}
