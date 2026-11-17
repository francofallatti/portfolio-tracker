import { useState } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'
import ColorPicker from './ColorPicker.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape.js'
import { formatQuantity } from '../utils/format.js'

const GROUPS = [
  { type: 'stock', label: 'Acciones y ETFs' },
  { type: 'crypto', label: 'Criptomonedas' },
]

// What changed between the asset and the form, as the PATCH expects it:
// an emptied ratio is sent as null, which removes it.
function changesFrom(asset, form) {
  const changes = {}
  const name = form.name.trim()
  const category = form.category.trim()
  if (name !== asset.name) changes.name = name
  if (category !== (asset.category ?? '')) changes.category = category
  if (asset.type === 'stock') {
    const ratio = form.ratio === '' ? null : Number(form.ratio)
    if (ratio !== (asset.ratio ?? null)) changes.ratio = ratio
  }
  return changes
}

function AssetForm({ asset, onSave, onChangeColor, onCancel }) {
  const [form, setForm] = useState({
    name: asset.name,
    category: asset.category ?? '',
    ratio: asset.ratio ? String(asset.ratio) : '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))

  const attempt = async (action) => {
    setError('')
    try {
      await action()
    } catch (actionError) {
      setError(actionError.message)
      setSaving(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!form.name.trim()) return setError('Falta el nombre.')
    if (form.ratio !== '' && !(Number(form.ratio) > 0)) return setError('El ratio tiene que ser mayor a 0.')

    const changes = changesFrom(asset, form)
    if (!Object.keys(changes).length) return onCancel()

    setSaving(true)
    attempt(() => onSave(changes))
  }

  return (
    <form
      className="modal__form catalog__form"
      onSubmit={handleSubmit}
      // Escape leaves the form; stopping it here keeps the panel open.
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onCancel()
      }}
    >
      <div className="asset-name">
        <span className="asset-icon" style={{ background: asset.color }}>
          {asset.symbol[0]}
        </span>
        <strong>{asset.symbol}</strong>
        <ColorPicker value={asset.color} onChange={(color) => attempt(() => onChangeColor(color))} />
      </div>

      <label>
        Nombre
        <input type="text" value={form.name} onChange={update('name')} autoFocus required />
      </label>
      <label>
        Categoría
        <input type="text" value={form.category} onChange={update('category')} />
      </label>
      {asset.type === 'stock' && (
        <label>
          Ratio (CEDEARs o acciones locales por acción)
          <input
            type="number"
            step="any"
            min="0"
            placeholder="Vacío si no se compra en Argentina"
            value={form.ratio}
            onChange={update('ratio')}
          />
        </label>
      )}
      {asset.type === 'stock' && (
        <p className="modal__hint">
          El ratio solo convierte las órdenes nuevas en pesos. Las ya cargadas no cambian: se convirtieron con el de su
          momento.
        </p>
      )}

      {error && <p className="modal__error">{error}</p>}

      <div className="modal__actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="add-button" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

// Side panel with every asset of the catalog, held or not: edit its name, category,
// ratio and color, and delete the ones no transaction uses (`usedSymbols`).
export default function CatalogPanel({ assets, usedSymbols, initialEditing = null, onClose, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(initialEditing)
  const [error, setError] = useState('')

  useCloseOnEscape(onClose)

  const remove = async (symbol) => {
    setError('')
    try {
      await onDelete(symbol)
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  const describe = (asset) =>
    [
      asset.category,
      asset.ratio && `Ratio ${formatQuantity(asset.ratio)}`,
      asset.localSymbol && `BYMA ${asset.localSymbol}`,
      !usedSymbols.has(asset.symbol) && 'Sin órdenes',
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer__header">
          <h3 id="catalog-title">Catálogo de activos</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <p className="modal__hint">
          Todos los activos que conoce la app, los tengas o no. Solo se puede borrar uno sin órdenes; el símbolo y el
          tipo no se cambian.
        </p>

        {error && <p className="modal__error">{error}</p>}

        {GROUPS.map((group) => {
          const items = assets
            .filter((asset) => asset.type === group.type)
            .sort((a, b) => a.symbol.localeCompare(b.symbol))
          if (!items.length) return null

          return (
            <section key={group.type} className="drawer__section">
              <div className="drawer__section-header">
                <h4>
                  {group.label} ({items.length})
                </h4>
              </div>

              <ul className="orders">
                {items.map((asset) =>
                  editing === asset.symbol ? (
                    <li key={asset.symbol} className="catalog__editing">
                      <AssetForm
                        asset={asset}
                        onSave={async (changes) => {
                          await onUpdate(asset.symbol, changes)
                          setEditing(null)
                        }}
                        onChangeColor={(color) => onUpdate(asset.symbol, { color })}
                        onCancel={() => setEditing(null)}
                      />
                    </li>
                  ) : (
                    <li key={asset.symbol} className="order">
                      <span className="asset-icon" style={{ background: asset.color }}>
                        {asset.symbol[0]}
                      </span>
                      <div className="order__main">
                        <strong>
                          {asset.symbol} <span className="catalog__name">{asset.name}</span>
                        </strong>
                        <span className="order__meta">{describe(asset)}</span>
                      </div>
                      <div className="order__actions">
                        <button
                          type="button"
                          className="order__edit"
                          aria-label={`Editar ${asset.symbol}`}
                          onClick={() => setEditing(asset.symbol)}
                        >
                          <Pencil size={16} />
                        </button>
                        {usedSymbols.has(asset.symbol) ? (
                          <span className="catalog__no-delete" />
                        ) : (
                          <ConfirmButton
                            className="order__delete"
                            ariaLabel={`Borrar ${asset.symbol}`}
                            confirmLabel="¿Borrar?"
                            onConfirm={() => remove(asset.symbol)}
                          >
                            <Trash2 size={16} />
                          </ConfirmButton>
                        )}
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </section>
          )
        })}
      </aside>
    </div>
  )
}
