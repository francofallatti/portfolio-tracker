// Entry point of the executable (`npm run build:exe`): starts the app and opens it in the
// browser. The data lives in a `data` folder next to the executable, so replacing the
// executable with a newer one keeps it.
//   PortfolioTracker.exe                 starts the app
//   PortfolioTracker.exe <backup.csv>    restores that backup first (the way back when a
//                                        broken JSON keeps the app from loading)
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { parseBackupCsv } from '../src/utils/backup.js'
import { restoreData } from '../scripts/restoreData.js'
import { APP_ID } from './api.js'
import { startServer } from './standalone.js'
// Written by scripts/build-exe.js: the built app, each file in base64.
import builtApp from './dist-assets.generated.js'

// Fixed, because the browser keeps preferences and the last quotes per address.
const FIRST_PORT = 4783
const PORT_ATTEMPTS = 10
const HOST = '127.0.0.1'
const JUST_STARTED = 15000

const dataDir = path.join(path.dirname(process.execPath), 'data')
const safetyDir = path.join(dataDir, 'backups')

function openBrowser(url) {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]]
  // No browser to open (a server without a desktop) is fine: the address is printed.
  spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {})
}

// The copy of this app already serving at `url` (`{ startedAt }`), or null if it's something else.
const runningCopy = async (url) => {
  try {
    const ping = await (await fetch(`${url}/api/ping`)).json()
    return ping.app === APP_ID ? ping : null
  } catch {
    return null
  }
}

function restoreFrom(file) {
  const backup = parseBackupCsv(fs.readFileSync(file, 'utf8'))
  const keptIn = restoreData(backup, { dataDir, safetyDir })
  console.log(`Restaurado: ${backup.transactions.length} transacciones y ${backup.assets.length} activos.`)
  console.log(`Los archivos anteriores quedaron en ${keptIn}\n`)
}

async function main() {
  const [backupFile] = process.argv.slice(2)
  if (backupFile) {
    fs.mkdirSync(dataDir, { recursive: true })
    restoreFrom(backupFile)
  }

  const assets = Object.fromEntries(
    Object.entries(builtApp).map(([file, { type, body }]) => [file, { type, body: Buffer.from(body, 'base64') }]),
  )

  for (let port = FIRST_PORT; port < FIRST_PORT + PORT_ATTEMPTS; port++) {
    const url = `http://${HOST}:${port}`
    try {
      await startServer({ dataDir, safetyDir, assets, port, host: HOST })
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error
      // Opened twice: the first copy is already serving, so just show it. Unless it has
      // only just started (a double click that landed twice): its own tab is opening.
      const copy = await runningCopy(url)
      if (!copy) continue
      if (Date.now() - copy.startedAt > JUST_STARTED) openBrowser(url)
      return
    }

    console.log(`Portfolio Tracker está corriendo en ${url}`)
    console.log(`Tus datos se guardan en ${dataDir}`)
    console.log('\nDejá esta ventana abierta mientras lo usás. Para apagarlo, cerrala.')
    openBrowser(url)
    return
  }
  throw new Error(`No hay un puerto libre entre ${FIRST_PORT} y ${FIRST_PORT + PORT_ATTEMPTS - 1}.`)
}

main().catch((error) => {
  console.error(error.code === 'ENOENT' ? `No existe el archivo ${error.path}` : error.message)
  // Opened with a double click, the window would close before the message can be read.
  console.error('\nApretá Enter para cerrar.')
  process.stdin.once('data', () => process.exit(1))
})
