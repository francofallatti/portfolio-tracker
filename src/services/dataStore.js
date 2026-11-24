// Talks to the local API (server/api.js), which runs inside the dev server or the executable.
const NO_SERVER = 'No se pudo completar la operación. ¿Está corriendo la app (el ejecutable o `npm run dev`)?'

async function request(route, method, body) {
  const response = await fetch(route, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}))
    throw new Error(error ?? NO_SERVER)
  }
}

async function read(route) {
  const response = await fetch(route)
  // Without the server (a static build), the answer is a page or a 404, not the document.
  const body = await response.json().catch(() => null)
  if (!response.ok || body === null || typeof body !== 'object') throw new Error(body?.error ?? NO_SERVER)
  return body
}

// Everything the app starts with: the three documents and the settings.
export async function loadData() {
  const [assets, transactions, snapshots, settings] = await Promise.all(
    ['/api/assets', '/api/transactions', '/api/history', '/api/settings'].map(read),
  )
  return { assets, transactions, snapshots, settings }
}

export const saveItem = (route, item) => request(route, 'POST', item)

export const deleteItems = (route, ids) => request(route, 'DELETE', { ids })

export const updateItem = (route, id, changes) => request(route, 'PATCH', { id, changes })

// Replaces the catalog and every transaction with `{ assets, transactions }`.
export const restoreBackup = (backup) => request('/api/backup', 'PUT', backup)

export const saveSettings = (settings) => request('/api/settings', 'PUT', settings)
