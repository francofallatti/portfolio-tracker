import { useMemo, useState } from 'react'
import { Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts'
import { TOP_ALLOCATION_ITEMS, canGroupAllocation, getAllocation } from '../utils/portfolio.js'
import { useMoney } from '../hooks/useMoney.js'

const STORAGE_KEY = 'allocation-expanded'
// Past this many items the legend splits into two columns.
const LEGEND_COLUMN_LIMIT = 7

const VIEWS = [
  { expanded: false, label: `Top ${TOP_ALLOCATION_ITEMS}` },
  { expanded: true, label: 'Todos' },
]

// Remembering the view is a per-browser convenience; storage can be unavailable.
const readExpanded = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const saveExpanded = (expanded) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(expanded))
  } catch {
    // Not persisted; the view still changes for this session.
  }
}

const formatWeight = (item) => `${item.weight.toFixed(2)}%`

function AllocationTooltip({ active, payload }) {
  const money = useMoney()
  if (!active || !payload?.length) return null
  const item = payload[0].payload

  return (
    <div className="chart-tooltip">
      <strong>{item.name}</strong> · {money.format(item.value)} · {formatWeight(item)}
      {item.members && (
        <ul>
          {item.members.map((member) => (
            <li key={member.name}>
              <span className="legend__dot" style={{ background: member.color }} />
              {member.name} · {money.format(member.value)} · {formatWeight(member)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// `scope` names the group being shown when it's not the whole portfolio.
export default function AllocationChart({ assets, scope }) {
  const [expanded, setExpanded] = useState(readExpanded)
  const canGroup = canGroupAllocation(assets)
  const data = useMemo(() => getAllocation(assets, { grouped: !expanded }), [assets, expanded])

  const changeView = (value) => {
    setExpanded(value)
    saveExpanded(value)
  }

  // Clicking "Otros" (slice or legend) opens it up.
  const expandIfGroup = (item) => item.members && changeView(true)

  return (
    <div className="card">
      <div className="card__header">
        <h3>
          Asignación {scope && <span className="card__scope">· {scope}</span>}
        </h3>
        {canGroup && (
          <div className="segmented" role="group" aria-label="Vista de la asignación">
            {VIEWS.map((view) => (
              <button
                key={view.label}
                type="button"
                aria-pressed={expanded === view.expanded}
                onClick={() => changeView(view.expanded)}
              >
                {view.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <p className="chart__empty">No hay tenencias en esta categoría.</p>
      ) : (
        <div className="allocation">
          <div className="chart chart--donut">
            <ResponsiveContainer width="100%" aspect={1}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="90%"
                  paddingAngle={2}
                  stroke="none"
                  // Every live quote changes the data, and Recharts 3 restarts the animation
                  // each time: with a busy stream the slices would never finish drawing.
                  isAnimationActive={false}
                  onClick={(_, index) => expandIfGroup(data[index])}
                  shape={(props) => (
                    <Sector
                      {...props}
                      fill={props.payload.color}
                      style={{ cursor: props.payload.members ? 'pointer' : 'default' }}
                    />
                  )}
                />
                <Tooltip content={<AllocationTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
  
          <ul className={`legend ${data.length > LEGEND_COLUMN_LIMIT ? 'legend--columns' : ''}`}>
            {data.map((item) => {
              const content = (
                <>
                  <span className="legend__dot" style={{ background: item.color }} />
                  <span>{item.name}</span>
                  <span>{formatWeight(item)}</span>
                </>
              )
  
              return (
                <li key={item.name}>
                  {item.members ? (
                    <button
                      type="button"
                      className="legend__toggle"
                      title={`Ver el detalle: ${item.members.map((member) => member.name).join(', ')}`}
                      onClick={() => expandIfGroup(item)}
                    >
                      {content}
                    </button>
                  ) : (
                    content
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
