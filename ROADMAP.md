# Hoja de ruta

Qué falta, qué mejorar y en qué orden. Arriba va lo pendiente y al final lo hecho, los dos con las mismas secciones numeradas. Al terminar algo, marcalo con `[x]`, pasalo a su sección dentro de "Hecho" y actualizá `CLAUDE.md` si cambió la arquitectura.

## Orden sugerido

1. Decidir si vale la pena publicarla para usarla desde el celular.

## Pendiente

### 2. Funcionalidad para un tracker completo

- [ ] **Intereses del efectivo** (los que paga el broker por el saldo en USD): hoy una renta tiene que venir de un activo del catálogo, y el efectivo no lo es.
- [ ] **Importar y exportar CSV**: cargar de una el historial de Binance o del broker, y tener un backup.

### 3. Historia y métricas

- [ ] **Comparar contra un benchmark** (SPY o BTC en el mismo período).

### 4. Usarla fuera de esta compu

Hoy solo funciona con `npm run dev` en esta PC. Es el cambio más grande; vale la pena solo si se va a usar desde otro lado (por ejemplo el celular).

- [ ] **Base de datos real** (por ejemplo Supabase) en lugar de los JSON.
- [ ] **Login**: son datos financieros.
- [ ] **Deploy** (Vercel o Netlify, gratis) con una función que esconda la key de Finnhub.
- [ ] **Snapshot programado del lado del servidor**, así la historia no depende de tener la pestaña abierta.

### 5. Calidad técnica

- [ ] **Snapshots duplicados con dos pestañas abiertas:** cada pestaña guarda su propio punto por hora.
- [ ] **Migrar Recharts a v3** y partir el bundle: el build avisa que pesa 631 kB.

Datos seguros:

- [ ] **Escritura atómica y backup**: `writeItems` (`vite.config.js`) pisa el archivo directo. Escribir a un temporal y renombrar, y guardar una copia `.bak` antes de cada escritura.
- [ ] **Cotizaciones de acciones frágiles**: en `useLiveQuotes`, si falla un símbolo se descarta toda la tanda (`Promise.all`), y Finnhub devuelve precio 0 para un símbolo desconocido, lo que valuaría la posición en $0. Usar `Promise.allSettled` e ignorar el precio 0.
- [ ] **Pasar a Vitest 5**: `npm audit` marca dos avisos críticos (tinypool) que solo se van con ese cambio, que es incompatible. Solo afectan al correr tests.

Rendimiento (sin medir, sale de leer el código):

- [ ] **Cada tick de Binance recalcula todo**: re-renderiza la app entera y reconstruye la historia, porque `useGroupHistory` depende del catálogo con precios en vivo y `HistoryChart` rearma sus datos en cada render. Agrupar las cotizaciones cada 1 o 2 segundos.
- [ ] **Cambiar un color reconecta el WebSocket** y reinicia el polling: los efectos de `useLiveQuotes` dependen del catálogo entero y no de la lista de símbolos.
- [ ] **Cotizaciones de activos que no se tienen**: se piden para todo el catálogo, lo que gasta cuota de Finnhub.

Mantenimiento:

- [ ] **Partir `TransactionModal.jsx`** (más de 600 líneas, cinco formularios en uno) por tipo de operación, y pasar los textos de ayuda a una función pura con tests.
- [ ] **Decidir qué hacer con los snapshots**: ya son el respaldo de un respaldo y arrastran bastante código (`useSnapshots`, `/api/history`, `getGroupHistory`, el tramo sombreado). Si quedan, podar los de más de 30 días: `history.json` crece siempre y entra al bundle.
- [ ] **Colores fijos en los componentes** (por ejemplo `HistoryChart.jsx`) que duplican los tokens de `App.css`.
- [ ] **Agregar `.gitattributes`**: git avisa de cambios de fin de línea (LF a CRLF) en varios archivos.
- [ ] **Limpieza chica:**
  - Quedan comentarios que hablan del MEP (`App.jsx`, `useMoney.js`), y `fetchDollarRates` falla si falta el MEP aunque solo se usa el CCL.
  - "Sin API key (datos de ejemplo)" en `LiveStatus` ya no es cierto: son datos reales con precios guardados.

### 6. Ideas extra

- [ ] **Asignación objetivo y rebalanceo:** definir por ejemplo "60% acciones / 40% cripto" (o un % por activo) y mostrar cuánto se desvió el portfolio y qué comprar para volver.
- [ ] **Alertas de precio.**

## Hecho

### 1. Datos reales

- [x] **Precio en pesos en el formulario:** "Pesos (Argentina)" convierte CEDEARs y precio en pesos a acciones y dólares con el ratio y el CCL del día.

### 2. Funcionalidad para un tracker completo

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

### 5. Calidad técnica

- [x] **El formulario ya no se cierra al soltar el mouse afuera**: solo cierra si el clic empieza y termina en el fondo, así seleccionar texto en un campo no pierde lo cargado.
- [x] **Validadores más estrictos**, en `utils/validation.js` con tests: números de verdad (no texto), comisión válida, sin fechas futuras e `id` único en las transacciones (reimportar no duplica).
- [x] **Dev server protegido:** Vite 5.4.21 y los endpoints de escritura rechazan pedidos de otro origen.
- [x] **Tests de `utils/portfolio.js` y `utils/history.js`** con Vitest (`npm test`).
- [x] **ESLint** con las reglas de hooks de React (`npm run lint`).
- [x] **Límite de Finnhub:** con muchos símbolos el refresco se espacia (1.5 s por símbolo, como mucho 40 consultas por minuto). Sigue consultando con el mercado cerrado.
- [x] **Decimales flotantes:** las cantidades llevan 8 decimales como máximo (`roundQuantity`), al guardar y en cada paso de `buildLedger`. Botón "Vender todo" en las ventas.

### 6. Ideas extra

- [x] **Ver los montos en pesos.** Selector "USD | ARS" en el encabezado, al dólar CCL de hoy de dolarapi.com (empezó con el MEP; el CCL coincide con los pesos del broker). Convierte los valores (total, tabla, gráficos, resúmenes); los registros de órdenes y movimientos quedan en dólares ("US$").
