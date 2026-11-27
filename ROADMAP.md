# Hoja de ruta

Qué falta, qué mejorar y en qué orden. Arriba va lo pendiente y al final lo hecho, los dos con las mismas secciones numeradas. Al terminar algo, marcalo con `[x]`, pasalo a su sección dentro de "Hecho" y actualizá `CLAUDE.md` si cambió la arquitectura.

## Pendiente

### 2. Funcionalidad para un tracker completo

- [ ] **Importar el historial de Binance o del broker** desde sus exports, de una. Baja prioridad: el backup propio ya está (ver "Hecho").

### 3. Historia y métricas

- [ ] **Comparar contra un benchmark** (SPY o BTC en el mismo período).

### 5. Calidad técnica

- [ ] **Snapshots duplicados con dos pestañas abiertas:** cada pestaña guarda su propio punto por hora.

Datos seguros:

- [ ] **Escritura atómica y backup**: `writeItems` (`vite.config.js`) pisa el archivo directo. Escribir a un temporal y renombrar, y guardar una copia `.bak` antes de cada escritura.

Mantenimiento:

- [ ] **Partir `TransactionModal.jsx`** (más de 600 líneas, cinco formularios en uno) por tipo de operación, y pasar los textos de ayuda a una función pura con tests.
- [ ] **Decidir qué hacer con los snapshots**: ya son el respaldo de un respaldo y arrastran bastante código (`useSnapshots`, `/api/history`, `getGroupHistory`, el tramo sombreado). Si quedan, podar los de más de 30 días: `history.json` crece siempre y entra al bundle.
- [ ] **Colores fijos en los componentes** (por ejemplo `HistoryChart.jsx`) que duplican los tokens de `App.css`.
- [ ] **Agregar `.gitattributes`**: git avisa de cambios de fin de línea (LF a CRLF) en varios archivos.
- [ ] **Limpieza chica:**
  - "Sin API key (datos de ejemplo)" en `LiveStatus` ya no es cierto: son datos reales con precios guardados.

### 6. Ideas extra

- [ ] **Asignación objetivo y rebalanceo:** definir por ejemplo "60% acciones / 40% cripto" (o un % por activo) y mostrar cuánto se desvió el portfolio y qué comprar para volver.
- [ ] **Alertas de precio.**

## Hecho

### 1. Datos reales

- [x] **Precio en pesos en el formulario:** "Pesos (Argentina)" convierte CEDEARs y precio en pesos a acciones y dólares con el ratio y el CCL del día.

### 2. Funcionalidad para un tracker completo

- [x] **Backup en CSV.** Botón "Backup": descarga un CSV con las transacciones y el catálogo, y restaura desde uno (reemplaza todo, mostrando antes qué cambia). Para guardarlo fuera de la compu. Si un JSON roto no deja abrir la app, `npm run restore -- <backup.csv>`. Lo reemplazado queda en `backups/`.
- [x] **Editar el catálogo desde la UI.** Panel "Catálogo" (botón en la barra de la tabla, o el lápiz del detalle de un activo): nombre, categoría, ratio y color de cualquier activo, y borrar los que no tienen órdenes. Una acción del catálogo sin ratio lo guarda con su primera orden en pesos.
- [x] **Escape cierra el formulario de transacción**, como ya cierra los paneles laterales. Con la lista del buscador de activos abierta, el primer Escape cierra solo la lista.
- [x] **Total pagado en el formulario.** Campo "Total (USD)" atado a cantidad y precio: se completan dos y el tercero se calcula, así una compra de US$1,000 se carga con lo que se pagó y lo que se recibió.
- [x] **Editar transacciones.** Lápiz en cada orden (detalle del activo) y en cada depósito o retiro (detalle del efectivo). Abre el mismo formulario precargado; tipo y activo quedan fijos.
- [x] **Dividendos, intereses y recompensas.** Tipo "Renta" (`type: 'income'`): en efectivo suma al efectivo sin contar como aporte; en especie suma cantidad con costo 0.
- [x] **Posiciones cerradas y resultado realizado total.** Sección colapsable "Posiciones cerradas" debajo de la tabla, con su detalle e historial. El beneficio histórico se desglosa en no realizado, realizado y rentas.
- [x] **"Recibir en USDT" al vender cripto**, en vez de efectivo USD. Campo `proceeds: 'usdt'` en la venta; el USDT recibido se deriva (`expandTransactions`).
- [x] **"Pagar con USDT" al comprar cripto**: `funding: 'usdt'` en la compra; el USDT gastado se deriva (`expandTransactions`).
- [x] **Splits de acciones.** Tipo `split` con `newShares` y `oldShares` (4:1, contrasplit 1:10): multiplica la cantidad y divide el PPC, sin mover plata. La historia cuenta las acciones previas en unidades post-split, porque Yahoo ajusta los precios.
- [x] **Hora en las transacciones.** `date` admite `YYYY-MM-DDTHH:mm` (hora local, opcional). La historia de cripto y la línea "Aportado" cuentan cada operación desde su hora, y el orden dentro de un día también la respeta.

### 3. Historia y métricas

- [x] **Variación del día en el encabezado**, en monto y %, debajo del total ("+$120.50 (+1.20%) hoy"): lo que movió cada tenencia según su `change24h`.
- [x] **Total con precios viejos al abrir.** La última cotización de cada activo se guarda en el navegador (`localStorage`) y la app abre con esas hasta que llegan las nuevas, en vez de usar el `price` de `assets.json`.
- [x] **Gráfico de precio en el detalle de cada activo.** Sección "Precio" del panel, con los mismos rangos que la historia (arranca en "Todo"): triángulo verde en cada compra y rojo en cada venta, al precio al que se hizo, y el PPC como línea punteada. El tooltip dice qué orden fue.
- [x] **Rendimiento anualizado (XIRR) y "% histórico" corregido.** El % del beneficio histórico ya no divide por los aportes netos (un retiro lo inflaba, y daba 0 con aportes netos en 0 o menos): es sobre lo máximo que se llegó a tener aportado (sin retiros, beneficio ÷ aportado). Debajo va el anualizado (XIRR), con al menos un año de historia.
- [x] **Rangos largos en la historia (90D / 1A / Todo)**, con un punto por día desde la primera transacción (velas diarias de Binance y de Yahoo). Antes el gráfico mostraba 30 días como máximo.
- [x] **Separar aportes de rendimiento.** Línea punteada "Aportado" en la historia (por grupo) y "Rendimiento 30D" sin depósitos ni retiros.
- [x] **Precios históricos de acciones** con la API de gráficos de Yahoo Finance (no oficial, sin key), por un proxy del dev server porque no permite CORS. "Todo", "Acciones" y "Criptomonedas" se reconstruyen hora por hora con `replayValue`; los snapshots quedan de respaldo.
- [x] **"Todo" sin huecos:** sale de lo anterior, la serie reconstruida no depende de que la app esté abierta.
- [x] **Rendimiento en %** en el rango, al lado del número en dólares. Modified Dietz (`periodReturn`): el resultado sobre el capital promedio invertido, así el % siempre acompaña al número en dólares.

### 4. Usarla fuera de esta compu

- [x] **Ejecutable que corre sin Node** (`npm run build:exe`, con Bun): un `.exe` que se abre con doble clic, guarda los datos en una carpeta `data/` a su lado y se publica en los Releases del repo público. La API local salió de `vite.config.js` a `server/api.js`, que usan el dev server y el ejecutable, y la app ya no importa los JSON: los pide al arrancar.
- [x] **Key de Finnhub desde la app**: se carga en pantalla (la primera vez se pide sola), se verifica contra Finnhub y se guarda con los datos. Ya no hace falta `.env.local`, que sigue sirviendo en desarrollo.

### 5. Calidad técnica

- [x] **El dólar ya no depende del MEP.** `fetchDollarRates` pide solo el CCL, que es el único que se usa (antes fallaba si dolarapi no traía el MEP), y los comentarios que lo nombraban quedaron al día.
- [x] **Las acciones de posiciones cerradas no se cotizan hasta abrir la sección.** Cada una es una consulta a Finnhub por refresco (el plan gratis da 60 por minuto). Al desplegar "Posiciones cerradas" empiezan a cotizar y siguen actualizándose como las demás.
- [x] **Las acciones del catálogo que no se tienen ya no se cotizan.** Solo cotizan en vivo las acciones con tenencia. Al elegir en el formulario una que no se tiene, su precio se pide una sola vez en ese momento.
- [x] **Cambiar un color o un nombre ya no reconecta el WebSocket** ni reinicia las consultas de acciones: `useLiveQuotes` sigue la lista de símbolos, no el catálogo entero.
- [x] **Cotizaciones de acciones más firmes.** Si una acción no puede cotizar, las demás se actualizan igual y esa sigue con su último precio (antes se descartaba toda la tanda). Un precio 0 de Finnhub (símbolo que no conoce) se ignora en vez de valuar la posición en $0. El estado dice cuál falta: "Acciones: Parcial (sin AAPL)".
- [x] **Cada cotización de Binance ya no recalcula todo.** Las cotizaciones de cripto se juntan y se aplican cada 2 segundos (antes, una actualización por moneda por segundo). La historia ya no se reconstruye con cada cotización: solo sigue los precios en vivo si a algún activo le faltan precios pasados. `HistoryChart` conserva los puntos pasados y solo cambia el último.
- [x] **Recharts 3 y bundle partido.** Recharts pasó de 2.13 a 3.11. El build sale en tres archivos (la app, React con los íconos, y los gráficos) y ya no avisa por el tamaño. La torta usa `shape` en vez de `Cell`, que Recharts 4 va a sacar, y no se anima: cada cotización reiniciaba la animación.
- [x] **El formulario ya no se cierra al soltar el mouse afuera**: solo cierra si el clic empieza y termina en el fondo, así seleccionar texto en un campo no pierde lo cargado.
- [x] **Validadores más estrictos**, en `utils/validation.js` con tests: números de verdad (no texto), comisión válida, sin fechas futuras e `id` único en las transacciones (reimportar no duplica).
- [x] **Dev server protegido:** Vite 5.4.21 y los endpoints de escritura rechazan pedidos de otro origen.
- [x] **Vitest 5 y Vite 8.** Vitest pasó de 3.2 a 5.1, que pide Vite 6.4 o más nuevo, así que Vite pasó de 5.4 a 8.4 (y `@vitejs/plugin-react` a 6.3). `npm audit` quedó en 0 avisos (antes 5, dos críticos). Piden Node 22.12 o más nuevo.
- [x] **Tests de `utils/portfolio.js` y `utils/history.js`** con Vitest (`npm test`).
- [x] **ESLint** con las reglas de hooks de React (`npm run lint`).
- [x] **Límite de Finnhub:** con muchos símbolos el refresco se espacia (1.5 s por símbolo, como mucho 40 consultas por minuto). Sigue consultando con el mercado cerrado.
- [x] **Decimales flotantes:** las cantidades llevan 8 decimales como máximo (`roundQuantity`), al guardar y en cada paso de `buildLedger`. Botón "Vender todo" en las ventas.

### 6. Ideas extra

- [x] **Ver los montos en pesos.** Selector "USD | ARS" en el encabezado, al dólar CCL de hoy de dolarapi.com (empezó con el MEP; el CCL coincide con los pesos del broker). Convierte los valores (total, tabla, gráficos, resúmenes); los registros de órdenes y movimientos quedan en dólares ("US$").
