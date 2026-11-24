import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createApi } from './server/api.js'

const at = (dir) => fileURLToPath(new URL(dir, import.meta.url))

// The local API (server/api.js) inside the dev server, over the documents in src/data.
// The key in .env.local is used until one is saved from the app.
function jsonStore(finnhubKey) {
  return {
    name: 'json-store',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createApi({ dataDir: at('./src/data'), safetyDir: at('./backups'), finnhubKey }))
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), jsonStore(loadEnv(mode, process.cwd()).VITE_FINNHUB_API_KEY)],
  build: {
    rollupOptions: {
      output: {
        // The charts library is most of the bundle and changes far less often than the app.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          return /node_modules\/(react|react-dom|scheduler|lucide-react)\//.test(id) ? 'vendor' : 'charts'
        },
      },
    },
  },
}))
