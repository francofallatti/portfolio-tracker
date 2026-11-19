import { useRef, useState } from 'react'
import { Download, Upload, X } from 'lucide-react'
import ConfirmButton from './ConfirmButton.jsx'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape.js'
import { backupFileName, findBackupError, parseBackupCsv, summarizeRestore, toBackupCsv } from '../utils/backup.js'

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

// "2 nuevas, 1 distinta y 3 que no están en el backup", or null when nothing changes.
function describeChanges({ added, changed, removed }, { fresh, different }) {
  const parts = [
    added && plural(added, fresh[0], fresh[1]),
    changed && plural(changed, different[0], different[1]),
    removed && `${removed} que no ${removed === 1 ? 'está' : 'están'} en el backup`,
  ].filter(Boolean)
  if (!parts.length) return null
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`
}

const TRANSACTION_WORDS = { fresh: ['nueva', 'nuevas'], different: ['distinta', 'distintas'] }
const ASSET_WORDS = { fresh: ['nuevo', 'nuevos'], different: ['distinto', 'distintos'] }

// Exports the catalog and the transactions to a CSV, and restores them from one.
export default function BackupModal({ assets, transactions, onRestore, onClose }) {
  // The file chosen to restore: `{ name, backup, summary }`.
  const [chosen, setChosen] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [restoring, setRestoring] = useState(false)
  const fileInput = useRef(null)
  const pressedBackdrop = useRef(false)
  useCloseOnEscape(onClose)

  const exportBackup = () => {
    setNotice('')
    try {
      const name = backupFileName()
      download(name, toBackupCsv({ assets, transactions }))
      setError('')
      setNotice(`Se descargó ${name}. Guardalo fuera de esta compu (por ejemplo en Drive).`)
    } catch (exportError) {
      setError(exportError.message)
    }
  }

  const chooseFile = async (event) => {
    const [file] = event.target.files
    // Cleared so choosing the same file again (after fixing it) fires the event.
    event.target.value = ''
    if (!file) return

    setChosen(null)
    setNotice('')
    try {
      const backup = parseBackupCsv(await file.text())
      const backupError = findBackupError(backup)
      if (backupError) throw new Error(`No se puede restaurar: ${backupError}.`)
      setChosen({ name: file.name, backup, summary: summarizeRestore({ assets, transactions }, backup) })
      setError('')
    } catch (fileError) {
      setError(fileError.message)
    }
  }

  const restore = async () => {
    setRestoring(true)
    try {
      await onRestore(chosen.backup)
      setNotice(`Listo: se restauró ${chosen.name}. Lo que había antes quedó en la carpeta backups/.`)
      setChosen(null)
      setError('')
    } catch (restoreError) {
      setError(restoreError.message)
    } finally {
      setRestoring(false)
    }
  }

  const transactionChanges = chosen && describeChanges(chosen.summary.transactions, TRANSACTION_WORDS)
  const assetChanges = chosen && describeChanges(chosen.summary.assets, ASSET_WORDS)

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => pressedBackdrop.current && event.target === event.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="backup-title">
        <div className="modal__header">
          <h3 id="backup-title">Backup</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="backup">
          <section className="backup__section">
            <h4>Exportar</h4>
            <p className="modal__hint">
              Un CSV con {plural(transactions.length, 'transacción', 'transacciones')} y{' '}
              {plural(assets.length, 'activo', 'activos')} del catálogo: todo lo necesario para reconstruir el
              portfolio.
            </p>
            <button type="button" className="add-button backup__button" onClick={exportBackup}>
              <Download size={16} /> Descargar backup
            </button>
          </section>

          <section className="backup__section">
            <h4>Restaurar</h4>
            <p className="modal__hint">
              Reemplaza las transacciones y el catálogo por los de un backup exportado desde acá. No lo abras ni lo
              guardes con Excel: cambia los números.
            </p>
            <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={chooseFile} />
            <button type="button" className="ghost-button backup__button" onClick={() => fileInput.current.click()}>
              <Upload size={16} /> Elegir archivo…
            </button>

            {chosen && (
              <div className="backup__preview">
                <p>
                  <strong>{chosen.name}</strong> tiene{' '}
                  {plural(chosen.summary.transactions.total, 'transacción', 'transacciones')} y{' '}
                  {plural(chosen.summary.assets.total, 'activo', 'activos')}.
                </p>
                {transactionChanges || assetChanges ? (
                  <>
                    <p>Comparado con lo que hay ahora:</p>
                    <ul>
                      {transactionChanges && <li>Transacciones: {transactionChanges}.</li>}
                      {assetChanges && <li>Activos: {assetChanges}.</li>}
                    </ul>
                    {chosen.summary.transactions.removed > 0 && (
                      <p className="modal__error">
                        Se van a perder {plural(chosen.summary.transactions.removed, 'transacción', 'transacciones')}{' '}
                        que no {chosen.summary.transactions.removed === 1 ? 'está' : 'están'} en el backup.
                      </p>
                    )}
                    <ConfirmButton
                      className="danger-button backup__button"
                      confirmLabel="Confirmar: reemplazar todo"
                      onConfirm={restore}
                    >
                      {restoring ? 'Restaurando…' : 'Restaurar este backup'}
                    </ConfirmButton>
                  </>
                ) : (
                  <p>Es igual a lo que hay ahora: no hay nada para restaurar.</p>
                )}
              </div>
            )}
          </section>

          {notice && <p className="modal__hint backup__notice">{notice}</p>}
          {error && <p className="modal__error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
