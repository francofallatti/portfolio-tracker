// npm run restore -- <backup.csv>
// Restores a backup without the app: the way back when a broken JSON keeps it from opening.
import fs from 'node:fs'
import { parseBackupCsv } from '../src/utils/backup.js'
import { restoreData } from './restoreData.js'

const [file] = process.argv.slice(2)
if (!file) {
  console.error('Uso: npm run restore -- <backup.csv>')
  process.exit(1)
}

try {
  const backup = parseBackupCsv(fs.readFileSync(file, 'utf8'))
  const keptIn = restoreData(backup)
  console.log(`Restaurado: ${backup.transactions.length} transacciones y ${backup.assets.length} activos.`)
  console.log(`Los archivos anteriores quedaron en ${keptIn}`)
} catch (error) {
  console.error(error.code === 'ENOENT' ? `No existe el archivo ${file}` : error.message)
  process.exit(1)
}
