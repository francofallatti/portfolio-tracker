// Talks to the dev-server json-store endpoints (see vite.config.js).
async function request(route, method, body) {
  const response = await fetch(route, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}))
    throw new Error(error ?? 'No se pudo completar la operación. ¿Está corriendo el dev server?')
  }
}

export const saveItem = (route, item) => request(route, 'POST', item)

export const deleteItems = (route, ids) => request(route, 'DELETE', { ids })

export const updateItem = (route, id, changes) => request(route, 'PATCH', { id, changes })
