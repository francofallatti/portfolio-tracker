import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { loadData } from './services/dataStore.js'
import { setFinnhubKey } from './services/finnhubQuotes.js'
import './App.css'

const root = createRoot(document.getElementById('root'))

// The data is read from the local server on start, not built into the app: the same
// build works for any portfolio and carries none.
loadData()
  .then(({ settings, ...data }) => {
    setFinnhubKey(settings.finnhubKey)
    root.render(
      <StrictMode>
        <App initial={data} keyAsked={settings.keyAsked} />
      </StrictMode>,
    )
  })
  .catch((error) => {
    root.render(
      <div className="load-error">
        <h1>No se pudieron cargar tus datos</h1>
        <p>{error.message}</p>
        <p>Si un archivo de datos quedó roto, restaurá un backup (ver README).</p>
      </div>,
    )
  })
