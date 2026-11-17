import { useMoney } from '../hooks/useMoney.js'
import { formatPercent, trendClass } from '../utils/format.js'

// `dayChange` is how much the value moved today (getDayChange).
// `returns` is the gain in %: `lifetime` over the most that was ever put in,
// `annualized` per year (XIRR). Either is null when it can't be measured.
export default function PortfolioHeader({ totals, dayChange, results, returns, children }) {
  const money = useMoney()
  // What the gain is made of (getResults); together they add up to it.
  const breakdown = [
    { label: 'No realizado', value: results.unrealized },
    { label: 'Realizado', value: results.realized },
    ...(results.income ? [{ label: 'Rentas', value: results.income }] : []),
  ]

  return (
    <header className="header">
      <div className="header__aside">{children}</div>

      <div className="header__total">
        <span className="label">Panel de mi portfolio</span>
        <div className="header__value">
          <strong>{money.format(totals.value)}</strong>
        </div>
        {totals.value > 0 && (
          <span
            className={`header__change ${trendClass(dayChange.amount)}`}
            title="Cuánto cambió hoy el valor de lo que tenés: las cripto en las últimas 24 horas y las acciones contra el cierre anterior. No cuenta depósitos, retiros ni órdenes."
          >
            {money.formatSigned(dayChange.amount)} ({formatPercent(dayChange.percent)}) hoy
          </span>
        )}
      </div>

      <div className={`gain-card gain-card--${trendClass(totals.gain)}`}>
        <span className="label">Beneficio histórico</span>
        <strong>
          {money.formatSigned(totals.gain)}{' '}
          {returns.lifetime !== null && (
            <small title="El beneficio sobre lo máximo que llegaste a tener aportado. Sin retiros, es beneficio ÷ aportado.">
              {formatPercent(returns.lifetime)}
            </small>
          )}
        </strong>
        {returns.annualized !== null && (
          <span
            className={`gain-card__annualized ${trendClass(returns.annualized)}`}
            title="Rendimiento anualizado (XIRR): la tasa anual que, aplicada a cada aporte desde su fecha, da el valor de hoy. Tiene en cuenta cuánto tiempo estuvo invertida cada parte, así que con aportes recientes puede ser bastante mayor o menor que el % histórico."
          >
            {formatPercent(returns.annualized)} anual
          </span>
        )}
        <dl className="gain-card__breakdown">
          {breakdown.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd className={trendClass(item.value)}>{money.formatSigned(item.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  )
}
