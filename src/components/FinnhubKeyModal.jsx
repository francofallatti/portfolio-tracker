import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape.js'

// Enters, changes or removes the Finnhub key. `onSave` gets the key ('' removes it) and
// throws with the reason when it can't be saved.
export default function FinnhubKeyModal({ currentKey, onSave, onClose }) {
  const [key, setKey] = useState(currentKey)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pressedBackdrop = useRef(false)
  useCloseOnEscape(onClose)

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await onSave(key.trim())
    } catch (saveError) {
      setError(saveError.message)
      setSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => pressedBackdrop.current && event.target === event.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="finnhub-key-title">
        <div className="modal__header">
          <h3 id="finnhub-key-title">Key de Finnhub</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <form className="modal__form" onSubmit={submit}>
          <p className="modal__hint">
            Con una key gratis de Finnhub la app cotiza acciones y ETFs en vivo y los encuentra en el buscador. Sin
            key, cripto funciona igual. Se saca en un minuto en{' '}
            <a href="https://finnhub.io/register" target="_blank" rel="noreferrer">
              finnhub.io/register
            </a>
            : registrate y copiá la "API Key" del panel.
          </p>
          <label>
            Key
            <input
              type="text"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Pegá tu key acá"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </label>
          <p className="modal__hint">
            Se guarda en esta compu, junto a tus datos.{currentKey && ' Para quitarla, dejá el campo vacío y guardá.'}
          </p>
          {error && <p className="modal__error">{error}</p>}

          <div className="modal__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              {currentKey ? 'Cancelar' : 'Ahora no'}
            </button>
            <button type="submit" className="add-button" disabled={saving || key.trim() === currentKey}>
              {saving ? 'Verificando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
