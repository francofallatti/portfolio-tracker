// npm run build:exe
// Packs the app into one executable that runs without Node (dist-exe/): the production
// build, the local server and the Bun runtime. Needs Bun installed (https://bun.com).
// The executable carries no data and no API key: it creates its `data` folder where it runs.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = path.join(ROOT, 'dist')
const GENERATED = path.join(ROOT, 'server', 'dist-assets.generated.js')
const OUT_FILE = path.join('dist-exe', 'PortfolioTracker')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const filesIn = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? filesIn(file) : [file]
  })

await build({ root: ROOT, logLevel: 'warn' })

// The built app goes inside the executable as a module: '/assets/index-abc.js' → its content.
const assets = Object.fromEntries(
  filesIn(DIST).map((file) => [
    `/${path.relative(DIST, file).replaceAll(path.sep, '/')}`,
    {
      type: TYPES[path.extname(file)] ?? 'application/octet-stream',
      body: fs.readFileSync(file).toString('base64'),
    },
  ]),
)
fs.writeFileSync(GENERATED, `export default ${JSON.stringify(assets)}\n`)

try {
  execSync(`bun build --compile server/exe.js --outfile ${OUT_FILE}`, { cwd: ROOT, stdio: 'inherit' })
} catch {
  console.error('\nNo se pudo armar el ejecutable. ¿Está instalado Bun? https://bun.com')
  process.exit(1)
}
