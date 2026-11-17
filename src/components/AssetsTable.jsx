import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { ASSET_GROUPS } from '../utils/portfolio.js'
import { useMoney } from '../hooks/useMoney.js'
import { formatIsoDate, formatPercent, formatQuantity, trendClass } from '../utils/format.js'

function AssetName({ asset }) {
  return (
    <div className="asset-name">
      <span className="asset-icon" style={{ background: asset.color }}>
        {asset.type === 'cash' ? '$' : asset.symbol[0]}
      </span>
      <strong>{asset.name}</strong>
      <span className="ticker">{asset.symbol}</span>
      <span className="badge">{asset.category}</span>
    </div>
  )
}

// Keyboard access to the detail; clicks bubble up to the row's onClick.
const DetailButton = ({ symbol }) => (
  <button type="button" className="chevron-button" aria-label={`Ver detalle de ${symbol}`}>
    <ChevronRight size={18} />
  </button>
)

const Dash = () => <td className="num muted">—</td>

// Every column sorts the table by that field of the assets. Numbers start high to low; names A to Z.
const COLUMNS = [
  { key: 'name', label: 'Nombre' },
  { key: 'price', label: 'Precio', numeric: true },
  { key: 'change24h', label: '24h%', numeric: true },
  { key: 'quantity', label: 'Cantidad', numeric: true },
  { key: 'value', label: 'Monto actual', numeric: true },
  { key: 'avgCost', label: 'PPC', numeric: true },
  { key: 'gain', label: '+ / -', numeric: true },
  { key: 'gainPercent', label: '%', numeric: true },
]

const SORT_STORAGE_KEY = 'assets-sort'
const DEFAULT_SORT = { key: 'value', direction: 'desc' }

// Remembering the order is a per-browser convenience; storage can be unavailable.
const readSort = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY))
    const valid = COLUMNS.some((column) => column.key === saved?.key) && ['asc', 'desc'].includes(saved.direction)
    return valid ? saved : DEFAULT_SORT
  } catch {
    return DEFAULT_SORT
  }
}

const saveSort = (sort) => {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort))
  } catch {
    // Not persisted; the order still changes for this session.
  }
}

// Cash has no market price or cost basis, so it stays at the bottom whatever the order.
function sortAssets(assets, { key, direction }) {
  const sign = direction === 'asc' ? 1 : -1
  const compare = (a, b) =>
    sign * (typeof a[key] === 'string' ? a[key].localeCompare(b[key], 'es') : a[key] - b[key])
  const cash = assets.filter((asset) => asset.type === 'cash')
  return [...assets.filter((asset) => asset.type !== 'cash').sort(compare), ...cash]
}

// `assets` and `closedPositions` arrive already filtered by the selected group (`groupKey`).
// Holdings follow the order picked in the headers (by value at first). Closed positions (sold
// out) go below, collapsed and the latest closed first, with their realized result in the +/- column.
export default function AssetsTable({ assets, closedPositions, groupKey, onGroupChange, onAdd, onOpenCatalog, onSelect }) {
  const money = useMoney()
  const [showClosed, setShowClosed] = useState(false)
  const [sort, setSort] = useState(readSort)
  const closedRealized = closedPositions.reduce((sum, position) => sum + position.realized, 0)
  const sortedAssets = sortAssets(assets, sort)
  const sortedClosed = [...closedPositions].sort((a, b) => b.lastDate.localeCompare(a.lastDate))

  // The same column flips the direction; a new one starts in its natural one.
  const sortBy = (column) => {
    const next =
      sort.key === column.key
        ? { key: column.key, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, direction: column.numeric ? 'desc' : 'asc' }
    setSort(next)
    saveSort(next)
  }
  const SortArrow = sort.direction === 'asc' ? ArrowUp : ArrowDown

  return (
    <section className="assets">
      <div className="assets__toolbar">
        <h3>Activos</h3>

        <div className="tabs" role="tablist">
          {ASSET_GROUPS.map((group) => (
            <button
              key={group.key}
              type="button"
              role="tab"
              aria-selected={groupKey === group.key}
              onClick={() => onGroupChange(group.key)}
            >
              {group.label}
            </button>
          ))}
        </div>

        <div className="assets__actions">
          <button type="button" className="ghost-button" onClick={onOpenCatalog}>
            Catálogo
          </button>
          <button type="button" className="add-button" onClick={onAdd}>
            <Plus size={16} /> Agregar Transacción
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key
                return (
                  <th
                    key={column.key}
                    className={column.numeric ? 'num' : undefined}
                    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      className={`sort-button${active ? ' sort-button--active' : ''}`}
                      onClick={() => sortBy(column)}
                    >
                      {column.label}
                      {active && <SortArrow size={12} />}
                    </button>
                  </th>
                )
              })}
              <th />
            </tr>
          </thead>
          <tbody>
            {sortedAssets.map((asset) => {
              // Cash has no market price or cost basis, so those columns don't apply.
              const isCash = asset.type === 'cash'

              return (
                <tr key={asset.symbol} className="assets__row" onClick={() => onSelect(asset.symbol)}>
                  <td>
                    <AssetName asset={asset} />
                  </td>
                  <td className="num">{money.format(asset.price)}</td>
                  {isCash ? (
                    <>
                      <Dash />
                      <Dash />
                    </>
                  ) : (
                    <>
                      <td className={`num ${trendClass(asset.change24h)}`}>{formatPercent(asset.change24h)}</td>
                      <td className="num">
                        {formatQuantity(asset.quantity)} {asset.symbol}
                      </td>
                    </>
                  )}
                  <td className="num">
                    <strong>{money.format(asset.value)}</strong>
                    <div className="bar">
                      <span style={{ width: `${asset.weight}%` }} />
                    </div>
                  </td>
                  {isCash ? (
                    <>
                      <Dash />
                      <Dash />
                      <Dash />
                    </>
                  ) : (
                    <>
                      <td className="num">{money.format(asset.avgCost)}</td>
                      <td className={`num ${trendClass(asset.gain)}`}>{money.formatSigned(asset.gain)}</td>
                      <td className={`num ${trendClass(asset.gainPercent)}`}>{formatPercent(asset.gainPercent)}</td>
                    </>
                  )}
                  <td>
                    <DetailButton symbol={asset.symbol} />
                  </td>
                </tr>
              )
            })}
            {assets.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">
                  No hay activos en esta categoría.
                </td>
              </tr>
            )}

            {closedPositions.length > 0 && (
              <tr className="assets__closed">
                <td colSpan={9}>
                  <button type="button" aria-expanded={showClosed} onClick={() => setShowClosed((prev) => !prev)}>
                    {showClosed ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    Posiciones cerradas ({closedPositions.length}) · Realizado{' '}
                    <span className={trendClass(closedRealized)}>{money.formatSigned(closedRealized)}</span>
                  </button>
                </td>
              </tr>
            )}
            {showClosed &&
              sortedClosed.map((position) => (
                <tr key={position.symbol} className="assets__row" onClick={() => onSelect(position.symbol)}>
                  <td>
                    <AssetName asset={position} />
                  </td>
                  <td className="num">{money.format(position.price)}</td>
                  <td className={`num ${trendClass(position.change24h)}`}>{formatPercent(position.change24h)}</td>
                  <td className="num muted">Cerrada el {formatIsoDate(position.lastDate)}</td>
                  <Dash />
                  <Dash />
                  <td className={`num ${trendClass(position.realized)}`}>{money.formatSigned(position.realized)}</td>
                  <Dash />
                  <td>
                    <DetailButton symbol={position.symbol} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
