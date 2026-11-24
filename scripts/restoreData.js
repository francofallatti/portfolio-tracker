// Replaces the catalog and the transactions with a backup. Shared by the local API
// (`PUT /api/backup`), by `npm run restore` and by the executable, for when the app doesn't open.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findBackupError } from '../src/utils/backup.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DATA_DIR = path.join(ROOT, 'src', 'data')
const SAFETY_DIR = path.join(ROOT, 'backups')
const FILES = { assets: 'assets.json', transactions: 'transactions.json' }

// '2026-11-05T14-30-59': sorts by time and is a valid folder name on Windows.
const stamp = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replaceAll(':', '-')

// Throws if the backup can't be restored; nothing is written in that case.
// Returns the folder where the files it replaced were kept.
export function restoreData(backup, { dataDir = DATA_DIR, safetyDir = SAFETY_DIR, now = new Date() } = {}) {
  const error = findBackupError(backup)
  if (error) throw new Error(`No se puede restaurar: ${error}.`)

  // The files are copied as they are, without reading them: a broken JSON is kept too.
  const keptIn = path.join(safetyDir, `before-restore-${stamp(now)}`)
  fs.mkdirSync(keptIn, { recursive: true })
  for (const file of Object.values(FILES)) {
    const current = path.join(dataDir, file)
    if (fs.existsSync(current)) fs.copyFileSync(current, path.join(keptIn, file))
  }

  // Each file is written next to the real one and then swapped in, so a crash can't leave it half written.
  for (const [key, file] of Object.entries(FILES)) {
    const target = path.join(dataDir, file)
    fs.writeFileSync(`${target}.tmp`, JSON.stringify(backup[key], null, 2) + '\n')
    fs.renameSync(`${target}.tmp`, target)
  }
  return keptIn
}
