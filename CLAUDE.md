# Portfolio Tracker

Dashboard personal para seguir un portfolio de cripto y acciones. Proyecto 100% vibe-coded: Claude decide e implementa; el usuario dice qué quiere y revisa el resultado en el navegador.

## Cómo trabajar acá

- Respondé en español rioplatense (voseo). La UI va en español; código, nombres y comentarios en inglés.
- Tomá las decisiones vos: elegí el enfoque que recomendarías, implementalo y al final listá las decisiones para que el usuario pueda redirigir. Preguntá solo si el pedido es ambiguo de verdad.
- Actualizá este archivo cuando cambien la arquitectura, los datos, los comandos o el estilo.
- Verificá cada cambio con `npm test`, `npm run lint` y `npm run build`. Si el dev server está corriendo, mirá su log por errores de HMR.
- Si tocás un cálculo de `utils/portfolio.js` o `utils/history.js`, agregá o ajustá su test al lado (`*.test.js`).
- No dejes datos de prueba en `src/data/*.json`. Si probás un endpoint, respaldá el archivo y restauralo.
- Es un repo git (rama `main`, con remoto). Commiteá o pusheá solo cuando el usuario lo pida. `.env.local` y `src/data/history.json` no se commitean (están en `.gitignore`).

## Comandos

- `npm run dev`: dev server en http://127.0.0.1:5173. Es necesario para guardar datos.
- `npm run build`: build de producción.
- `npm test`: tests con Vitest (`vitest run`). Cubren `utils/portfolio.js` y `utils/history.js`, de donde sale toda la plata, y `utils/validation.js`, que decide qué se puede guardar. Los componentes no tienen tests.
- `npm run lint`: ESLint 9 (`eslint.config.js`): recomendadas de JS más las reglas de hooks de React (`rules-of-hooks` es error, `exhaustive-deps` es aviso).

## Stack

React 18 + Vite 5, JavaScript (sin TypeScript), Recharts 2 para gráficos, lucide-react para íconos. CSS plano en un único `src/App.css`.

## Estructura

```
src/
  App.jsx            estado principal y composición de la página
  components/        PortfolioHeader, LiveStatus, HistoryChart, AllocationChart, AssetsTable,
                     AssetDetail, CashDetail y CatalogPanel (paneles laterales), PriceChart (precio de un activo
                     con sus compras y ventas, dentro de AssetDetail), TransactionModal, AssetPicker,
                     ColorPicker, ConfirmButton (confirmación en dos clics para acciones destructivas),
                     CurrencyToggle (USD | ARS en el encabezado)
  hooks/             useLiveQuotes (cotizaciones), useSnapshots (guarda el historial),
                     useGroupHistory (serie del gráfico de historia por grupo), useAssetPrices (precios pasados
                     de un activo, para PriceChart), useCloseOnEscape,
                     useMoney (moneda de los montos y dólar CCL)
  services/          binanceStream (WebSocket cripto), binanceMarkets (lista de pares USDT),
                     binanceKlines (precios pasados, por hora o por día),
                     yahooChart (lo mismo para acciones, por el proxy del dev server),
                     finnhubQuotes (cotización, búsqueda y perfil de acciones), assetCatalog (arma activos nuevos),
                     dataStore (saveItem / deleteItems / updateItem → endpoints de escritura),
                     dolarApi (dólar CCL de hoy y de cualquier día),
                     quoteCache (últimas cotizaciones, en `localStorage`)
  utils/             portfolio.js (cálculos), history.js (snapshots y series de la historia),
                     format.js (moneda y fechas),
                     colors.js (paleta de activos y color del efectivo),
                     validation.js (validadores de los documentos JSON, los usa `vite.config.js`)
                     *.test.js: tests de Vitest al lado de cada archivo
  data/              documentos JSON (ver abajo)
vite.config.js       plugin `json-store` con los endpoints de escritura y el proxy `/api/yahoo`
eslint.config.js     reglas de ESLint
```

## Datos: documentos JSON en `src/data/`

- `assets.json`: catálogo de activos (`symbol`, `name`, `type: crypto|stock`, `category`, `color`). `color` es hex `#rrggbb` (lo exige el validador y el selector nativo). `price` y `change24h` son el respaldo cuando no hay cotización en vivo. Una acción que también se compra en Argentina tiene `ratio` y, si es una acción local, `localSymbol` (ver "CEDEARs y acciones argentinas"). Se agranda solo: al guardar la primera transacción de un activo que no está, se agrega.
- `transactions.json`: fuente de verdad de las tenencias y del efectivo. Dos formas:
  - Órdenes: `{ id, date, type: buy|sell, symbol, quantity, price, fee, funding?, proceeds? }`. `funding` solo en compras: `cash` (se paga con el efectivo), `external` (plata nueva) o `usdt` (se paga con la tenencia de USDT; solo cripto). Sin `funding` cuenta como `external`. `proceeds` solo en ventas: `cash` (el neto va al efectivo) o `usdt` (el neto se recibe en USDT; solo cripto). Sin `proceeds` cuenta como `cash`.
  - Movimientos de efectivo: `{ id, date, type: deposit|withdrawal, amount }`.
  - Splits (solo acciones): `{ id, date, type: 'split', symbol, newShares, oldShares }`: cada `oldShares` acciones pasan a ser `newShares`. Un 4:1 es `newShares: 4, oldShares: 1`; un contrasplit 1:10, `newShares: 1, oldShares: 10`.
  - `date` (en todas) es hora local sin zona: `YYYY-MM-DDTHH:mm`, o `YYYY-MM-DD` si no se cargó la hora (las anteriores al 29/10/2026 no la tienen). Sin hora cuenta desde las 00:00 de ese día. Se ordenan como texto, así que en un mismo día van primero las que no tienen hora. El validador exige uno de los dos formatos y rechaza fechas futuras (el formulario tampoco las deja elegir): contarían como tenencia de hoy, pero la historia las ignoraría.
  - Rentas (dividendos, intereses, staking; en la UI, "Renta"): `{ id, date, type: 'income', symbol, amount }` si se cobró en efectivo (USD, suma al efectivo) o `{ id, date, type: 'income', symbol, quantity }` si se cobró en especie (unidades de `symbol` con costo 0). Exactamente uno de los dos. `symbol` es el activo que la pagó, salvo en una renta en especie cobrada en otro activo (staking de BTC pagado en NEXO): ahí `symbol` es el que se recibe (`NEXO`, el que crece) y `source` el que la generó (`BTC`), que solo se muestra ("Generada por BTC"). Ninguna cuenta como aporte, así que todo suma al beneficio. Al editar, la forma de cobro queda fija.
- `history.json`: snapshots del valor, `{ timestamp (ISO), value, byType: { crypto, stock, cash } }` (los arma `buildSnapshot`). Hoy son solo el respaldo del gráfico de historia, que se reconstruye con precios por hora (ver "Vistas por grupo"). Los anteriores al 27/10/2026 no tienen `byType`: solo cuentan para la vista "Todo". Es local: está en `.gitignore` porque cambia cada hora y ensuciaba los commits. En un clon nuevo, `vite.config.js` lo crea vacío. `assets.json` y `transactions.json` sí se versionan; en la rama `release` van vacíos (el catálogo, solo con USDT).

Reglas:

- No se guarda nada derivado. Cantidad, PPC, valor, ganancia, asignación, efectivo y totales se calculan en `utils/portfolio.js`: `buildHoldings(applyQuotes(catalog, quotes), transactions)` → `getAssetsWithMetrics` → `getTotals(assets, getContributions(transactions))` / `getAllocation`. Las posiciones cerradas salen de `buildClosedPositions(catalog, transactions)` y el desglose del beneficio de `getResults(assets, closedPositions)`.
- El `symbol` identifica al activo en todo el código (cotizaciones, tenencias, catálogo). Un mismo símbolo no puede ser cripto y acción a la vez. `USD` está reservado para el efectivo.
- `buildLedger` reproduce las órdenes de un activo en orden de fecha y hora (empates: orden de inserción). Cada fila lleva la posición resultante (`quantityAfter`, `avgCostAfter`) y, en las ventas, el resultado realizado. `buildHoldings` y el detalle de la tenencia salen de ahí.
- Una operación liquidada en USDT se guarda como una sola transacción, pero `expandTransactions` le agrega su lado en USDT a $1 (`sourceId` apunta a la operación): una venta con `proceeds: 'usdt'` suma una compra de USDT por el neto (`funding: 'sale'`); una compra con `funding: 'usdt'` suma una venta de USDT por el total con comisión (`proceeds: 'purchase'`). Ese lado no mueve efectivo ni cuenta como aporte. `buildHoldings`, `findLedgerError` y `useGroupHistory` reciben las transacciones guardadas y expanden adentro; quien llame directo a `buildLedger` o `replayValue` tiene que pasarlas expandidas. En el detalle de USDT se ven ("Cobro de la venta de ETH", "Pago de la compra de SOL") pero no se editan ni se borran: se cambian desde la operación.
- Las cantidades llevan 8 decimales como máximo (`roundQuantity`, un satoshi): el formulario redondea al guardar y `buildLedger` redondea la posición después de cada movimiento. Así no quedan restos como `2.20889 - 2 = 0.2088899999999998`, y vender lo que queda cierra la posición.
- PPC = costo promedio ponderado de las compras, comisión incluida. Las ventas bajan la cantidad sin cambiar el PPC. Una renta en especie suma unidades a costo 0, así que baja el PPC. Un split multiplica la cantidad por `splitRatio` (`newShares / oldShares`) y divide el PPC por lo mismo: lo invertido no cambia, no mueve plata ni cuenta como aporte. Resultado realizado de una venta = (precio − PPC) × cantidad − comisión.
- `cashImpact` y `quantityImpact` dicen cuánto mueve cada transacción el efectivo y la cantidad de su símbolo. `buildLedger` y `replayValue` usan `quantityImpact`; para un tipo nuevo de transacción, empezá por esas dos. La excepción es el split: su efecto depende de lo que se tiene, así que `quantityImpact` da 0 y `buildLedger` y `replayValue` lo aplican aparte.
- Una posición con cantidad ≤ 1e-9 se considera cerrada: sale de las tenencias (tabla, torta, totales) y pasa a `buildClosedPositions` (cantidad 0, realizado, rentas y `lastDate`). En la tabla van abajo, en "Posiciones cerradas (N) · Realizado ±$X", colapsadas y filtradas por grupo, con su realizado en la columna +/-. Un activo sin transacciones no es ni una cosa ni la otra.
- Los tres archivos son arrays. Escritura: `POST /api/transactions`, `/api/history` y `/api/assets` agregan un ítem al array (responden 409 si ya existe: `/api/assets` por `symbol`, `/api/transactions` por `id`, así reimportar del broker no duplica órdenes). `DELETE /api/transactions` con `{ ids }` borra órdenes; `DELETE /api/assets` (ids = símbolos) borra activos y responde 409 si alguno tiene transacciones o es USDT (`findDeleteError`, con `usedSymbols`). `PATCH` con `{ id, changes }` modifica un ítem (un campo en `null` se quita): en `/api/assets` (id = `symbol`) `color`, `name`, `category` y `ratio` (símbolo y tipo no); en `/api/transactions`, `date`, `quantity`, `price`, `fee`, `funding`, `proceeds`, `amount`, `newShares` y `oldShares` (tipo y símbolo no: para eso se borra y se carga de nuevo). Solo existen con `npm run dev`; en un build de producción no hay dónde guardar. Rechazan con 403 los pedidos que traen un `Origin` distinto al del dev server (`isSameOrigin`), así otra web abierta en el navegador no puede tocar los datos.
- Antes de guardar o borrar, `findLedgerError` reproduce todo en orden de fecha y bloquea si alguna venta queda sin compras previas que la cubran o si el efectivo queda negativo en algún momento.
- Para hacer escribible un documento nuevo, sumalo a `STORES` en `vite.config.js` con su validador, que va en `utils/validation.js` con su test (los números tienen que ser números de verdad, no texto) (`uniqueKey` para evitar duplicados, `idKey` para habilitar DELETE, `findDeleteError` para bloquear borrados, `editable: { key, fields }` para habilitar PATCH sobre esos campos). Desde el front, usá `saveItem` / `deleteItems` / `updateItem` de `services/dataStore.js`.

## Vistas por grupo (Todo / Criptomonedas / Acciones)

- Las pestañas de la tabla filtran también la historia y la torta. El estado (`groupKey`) vive en `App`.
- La tabla se ordena por monto, de mayor a menor. Cada encabezado ordena por su columna (números de mayor a menor, nombres de la A a la Z; otro clic invierte) y el orden se recuerda en `localStorage`. El efectivo queda siempre abajo; las posiciones cerradas, la última cerrada primero.
- `ASSET_GROUPS` en `utils/portfolio.js` define qué tipos entran en cada grupo. El efectivo va con Acciones; USDT es cripto y queda en Criptomonedas.
- `filterByGroup` filtra las tenencias. Los pesos de la torta son relativos al grupo, pero la barra de peso de la tabla sigue siendo sobre el portfolio entero.
- La serie de la historia sale de `useGroupHistory`: los tres grupos se reconstruyen hora por hora (`replayValue` en `utils/history.js`) con las cantidades de cada momento según las transacciones y los precios por hora de los últimos 30 días. No tiene huecos aunque la app haya estado cerrada, y una transacción con fecha pasada corrige toda la serie.
  - Cripto: velas de Binance (`binanceKlines`), al precio de apertura de cada hora. USDT vale 1 y un símbolo sin velas usa su precio actual.
  - Acciones: barras de 60 min de Yahoo Finance (`yahooChart`; API no oficial, sin key). Yahoo no permite CORS, así que el navegador pide `/api/yahoo/...` y el dev server lo reenvía (`server.proxy` en `vite.config.js`, con User-Agent: sin él Yahoo responde 429). Cada barra aporta su apertura al empezar y su cierre al terminar; fuera de horario de mercado se mantiene el último precio (`alignPrices`). Los precios vienen ajustados por splits (antes de un 4:1 valen la cuarta parte), así que `replayValue` cuenta cada transacción en acciones post-split: su cantidad × el ratio de los splits posteriores. El precio de hoy, que usa el respaldo, también es post-split.
  - Los rangos largos (90D, 1A, Todo) usan la misma reconstrucción con un punto por día (00:00 UTC) desde la primera transacción: velas diarias de Binance (hasta 1000, unos 2.7 años; antes de eso usa el primer precio) y barras diarias de Yahoo. `HISTORY_RANGES` (`utils/history.js`) dice qué resolución usa cada rango (`hour` o `day`), `historyTimes` arma los tiempos y los servicios reciben `(symbol, resolution, from)`. El rango elegido vive en `App` (`rangeKey`), porque decide qué serie se pide. La serie diaria se pide recién al elegir un rango largo.
  - Los precios se piden solo para los grupos visibles (Todo pide los dos), con caché de 10 min, y se refrescan cada 10 min.
  - Respaldo: si falta el precio de alguna acción (Yahoo caído, o un build de producción sin proxy), "Todo" muestra los snapshots tal cual y "Acciones" estima con los precios de hoy hasta el primer snapshot con `byType` y después usa los snapshots (`getGroupHistory` suma su `byType`). El gráfico sombrea el tramo estimado y lo aclara abajo.
  - Una transacción cuenta desde su fecha y hora (`transactionTime` en `utils/history.js`); si no tiene hora, desde el inicio de su día. Como la serie es por hora, una operación de las 14:30 aparece en el punto de las 15:00.
- El encabezado (total y beneficio) siempre es del portfolio entero.
- Mientras se ve un grupo, los títulos de los gráficos lo nombran ("Historia · Acciones").

## Detalle de una tenencia

Click en una fila de la tabla → `AssetDetail` (panel lateral): en el encabezado, un punto con el color del activo (`ColorPicker`; en el detalle no se muestra la categoría) que al tocarlo despliega la paleta y un selector nativo, y guarda al elegir; resumen (cantidad, monto, PPC, invertido, resultado no realizado y realizado, rentas cobradas en efectivo si hay, peso), historial de movimientos (órdenes y rentas, la más nueva primero), editar o borrar una orden, borrar la tenencia completa (todas sus órdenes; el activo queda en el catálogo) y "Nueva orden" con el activo preseleccionado. Mientras el formulario está abierto, el panel se oculta y vuelve al cerrarlo. Una posición cerrada abre el mismo panel con la etiqueta "Posición cerrada" y solo el realizado y las rentas en el resumen. Vender todo deja el panel abierto (pasa a cerrada); borrar todas las transacciones lo cierra.

Entre el resumen y los movimientos va "Precio" (`PriceChart`), salvo en USDT, que vale siempre 1:

- Tiene los rangos de la historia (`HISTORY_RANGES`; el elegido es estado local y arranca en "Todo"). Los precios salen de `useAssetPrices`: los mismos servicios que la historia (`binanceKlines` o `yahooChart`, por hora hasta 30D y por día después), sin alinear, y el último punto es la cotización en vivo. "Todo" empieza 7 días antes de la primera orden. Si el rango no tiene barras (una acción en fin de semana, en 24H), arranca con el último precio anterior.
- Cada compra es un triángulo verde hacia arriba y cada venta uno rojo hacia abajo, en su fecha y al precio al que se hizo (`tradeMarkers` en `utils/history.js`). Como Yahoo ajusta los precios por splits, el precio de una orden anterior a un split se divide por el ratio. Rentas y splits no se marcan. El tooltip de un punto lista las órdenes más cercanas a él, con la cantidad y el precio guardados (en dólares).
- La línea punteada es el PPC de lo que se tiene (no aparece en una posición cerrada). El eje se estira para que entren el PPC y todas las órdenes del rango (`ifOverflow="extendDomain"`).
- El % del encabezado del gráfico ("Precio Todo: −51%") es el cambio del precio en el rango, no el rendimiento de la posición (por eso dice "Precio" y lo aclara en el `title`): con compras a distintos precios no coinciden. El eje y el precio del tooltip siguen la moneda elegida.
- Sin precios (Yahoo caído, o un build de producción sin proxy) avisa que no se pudieron cargar.

Editar una transacción reusa `TransactionModal` con `editing`: precarga los campos y oculta el tipo y el activo. App le pasa las tenencias y el efectivo calculados sin esa transacción, así lo "disponible" es lo que ella puede usar. Antes de guardar, `findLedgerError` valida el historial completo con el cambio.

## Catálogo de activos

`CatalogPanel` (panel lateral) lista todo `assets.json`, se tenga o no, en "Acciones y ETFs" y "Criptomonedas". Se abre con "Catálogo" en la barra de la tabla, o con el lápiz del encabezado de `AssetDetail`, que lo abre con ese activo en edición; al cerrarlo vuelve el detalle.

- El lápiz de cada fila abre un formulario en el lugar: nombre, categoría, ratio (solo acciones; vacío lo quita) y color (`ColorPicker`, guarda al elegir). Símbolo y tipo no se cambian. Escape cancela la edición; otro Escape cierra el panel.
- El tacho (dos clics, `ConfirmButton`) aparece solo en los activos sin órdenes, marcados "Sin órdenes". `usedSymbols(transactions)` (`utils/portfolio.js`) dice cuáles están en uso: cuenta el `symbol` y el `source` de cada transacción y el lado en USDT de las operaciones liquidadas en USDT. USDT siempre cuenta como en uso: habilita liquidar en USDT y el buscador no lo puede volver a agregar.
- Una acción que ya está en el catálogo sin `ratio` lo guarda con su primera orden en pesos (`addTransaction` en `App`). Si ya tiene uno, una orden cargada con otro ratio no lo pisa.

## Asignación (gráfico de torta)

- `getAllocation(assets, { grouped })`: agrupado muestra el top 5 por valor y suma el resto en "Otros" (con sus ítems en `members`); sin agrupar muestra todo. Si sobra un solo activo, no se agrupa (`canGroupAllocation`).
- Cada porción usa el `color` de su activo, el mismo del ícono en la tabla (el efectivo usa `CASH_COLOR`, fijo). "Otros" es gris.
- `AllocationChart` tiene el selector "Top 5 | Todos" (se recuerda en `localStorage`). Un clic en "Otros", en la torta o en la leyenda, expande. El tooltip de "Otros" lista su contenido.

## Efectivo (USD)

- Es una tenencia derivada, no está en `assets.json`: `cashImpact` define cómo mueve el saldo cada transacción. Las ventas suman su neto (cantidad × precio − comisión) salvo las cobradas en USDT, las compras con `funding: 'cash'` restan su total, las rentas en efectivo suman `amount` y los depósitos y retiros suman o restan `amount`. En `CashDetail` las rentas se ven ("Renta de SPY") pero se editan desde su activo.
- Aparece en la tabla (símbolo `USD`, `type: 'cash'`, con guiones en las columnas que no aplican) y en la torta en cuanto tiene algún movimiento. Su panel es `CashDetail`: saldo, aportes netos, movimientos con el saldo resultante, depositar o retirar, y editar o borrar depósitos y retiros (las órdenes se editan y borran desde su activo).
- Aportes (`getContributions`) = depósitos − retiros + compras con plata nueva.
- "Beneficio histórico" = valor total (con efectivo) − aportes. Debajo, `getResults` lo desglosa en no realizado (lo que se tiene; incluye las rentas en especie, que tienen costo 0), realizado (todas las ventas, de posiciones abiertas y cerradas) y rentas en efectivo. Las tres partes suman exactamente el beneficio: hay un test que lo comprueba.
- El % del beneficio histórico sale de los aportes fechados (`portfolioFlows` en `utils/history.js`: `getContributions` de cada transacción, como `{ time, amount }`), no de `getTotals`, que solo da valor, aportes y beneficio:
  - `lifetimeReturn`: el beneficio sobre lo máximo que se llegó a tener aportado (el pico de los aportes netos). Sin retiros es beneficio ÷ aportado. No divide por los aportes netos: un retiro lo inflaba, y con aportes netos en 0 o menos no se podía calcular. No pondera por tiempo, a propósito: con Modified Dietz (`periodReturn`, el del gráfico) sobre toda la historia, si la mayor parte de la plata entró hace poco el capital promedio es chico y el % exagera (una pérdida del 15% de lo aportado se podía leer como −40%). Por eso no coincide con el "Rendimiento Todo" del gráfico.
  - `annualizedReturn` ("−6.00% anual", debajo): XIRR, la tasa anual que aplicada a cada aporte desde su fecha da el valor de hoy. Se resuelve por bisección. Con menos de un año de historia no se muestra: anualizar extrapolaría una racha corta. Sí pondera por tiempo, así que con aportes recientes puede quedar lejos del % histórico (−15% histórico y −25% anual a la vez).
  - Si alguno no se puede calcular da `null` y no se muestra. Los dos se explican en el `title` de cada número.
- Con cripto (si USDT está en el catálogo), el formulario ofrece liquidar en USDT: al vender, "Recibir en: Efectivo USD | USDT"; al comprar, "Pagar con: Efectivo | USDT | Plata nueva". Con USDT, se suma o se resta de la tenencia de USDT y el efectivo no cambia.

## Agregar activos nuevos

Escape cierra el formulario sin guardar (`useCloseOnEscape`), igual que la X, "Cancelar" o un clic afuera; si la lista de `AssetPicker` está abierta, el primer Escape cierra solo la lista.

La fecha y la hora del formulario arrancan en el momento actual (hora local); la hora es opcional y se puede borrar. En una venta, "Vender todo" (al lado de "Cantidad") completa la cantidad con todo lo disponible. Una compra o venta de acciones se puede cargar en "Dólares" o en "Pesos (Argentina)": CEDEARs (o acciones locales), precio unitario en pesos, total en pesos, ratio (del catálogo) y dólar CCL del día (se completa solo y se puede corregir). Unidades, precio y total en pesos van atados igual que en dólares (ver abajo), así se puede cargar lo que se pagó en vez del precio de cada CEDEAR. Muestra en cuántas acciones y a qué precio en dólares queda, y se guarda así (`fromPesos`). Arranca en pesos si la acción tiene `ratio`. Vender en pesos todas las unidades vende todas las acciones. Una acción nueva cargada en pesos guarda su ratio. El tipo "Split" pide la proporción ("Recibís 4 por cada 1"), solo acepta acciones que tengas y avisa cómo quedan la cantidad y el PPC. En el detalle del activo se ve como "Split 4:1 → 40 AAPL · PPC $50.00". En los historiales de los paneles se ve la hora cuando la hay ("28/10/2026 14:30"); "Cerrada el" en la tabla muestra solo el día.

El precio unitario del formulario se precarga con la cotización del momento: en vivo si ya llegó, si no el respaldo de `assets.json` (por eso el formulario recibe el catálogo con cotizaciones, `pricedCatalog`). Se puede editar. Al editar una transacción, arranca con su precio guardado.

Una compra o venta en dólares tiene tres campos atados: cantidad, precio unitario y "Total (USD)" (cantidad × precio, sin comisión). Quedan los dos que se escribieron últimos y el tercero se calcula (`deriveTradeField` en `utils/portfolio.js`; el formulario lo marca "· calculado"): con cantidad y precio sale el total; con cantidad y total pagado sale el precio; con precio y total sale la cantidad. El total no se guarda: la transacción sigue siendo `quantity` y `price`. En pesos pasa lo mismo con CEDEARs, precio unitario y "Total (ARS)" (`ARS_TRADE` en `TransactionModal`).

El formulario nunca es más alto que la ventana (`max-height` en `.modal`): si no entra, hace scroll adentro y "Guardar" queda al alcance.

En el formulario de transacción, `AssetPicker` busca primero en el catálogo y después en el mercado:

- Cripto: todos los pares `XXXUSDT` de Binance (`data-api.binance.vision`, se pide una vez por carga). Solo USDT porque es lo que soporta el stream de precios. El nombre queda igual al símbolo.
- Acciones y ETFs: búsqueda de Finnhub (requiere key). Se descartan símbolos con `.` (otras bolsas, el plan gratis solo cotiza EE.UU.). Al elegir uno, `toCatalogAsset` trae precio y perfil (nombre e industria; los ETFs no tienen perfil).
- El color de un activo nuevo sale de la paleta de `utils/colors.js` (`pickColor`): uno fijo por símbolo, salteando los que ya usan otros activos o el efectivo mientras quede alguno libre. Después se cambia desde el detalle.

## Cotizaciones en vivo

- Cripto: WebSocket público de Binance (`data-stream.binance.vision`), sin API key. USDT queda fijo en 1.
- Acciones y ETFs: Finnhub REST cada 15 s, o más espaciado con muchos símbolos (1.5 s por símbolo, para no pasar el límite gratis de 60 consultas por minuto). Requiere `VITE_FINNHUB_API_KEY` en `.env.local` (ver `.env.example`). La key queda expuesta en el navegador. Sin key se usan los precios de `assets.json`.
- Sin cripto para seguir (catálogo solo con USDT, como en la release), el stream no se abre y el estado es `idle` ("Cripto: Sin activos"), no "Conectando…".
- `ready` (de `useLiveQuotes`) es true cuando todos los símbolos con feed recibieron cotización en vivo.
- Últimas cotizaciones guardadas (`services/quoteCache.js`): `useLiveQuotes` guarda en `localStorage` (`last-quotes`, como mucho cada 5 s) la última cotización de cada símbolo y arranca con ellas, así al abrir el total usa los precios de la última visita y no el `price` de `assets.json`. Es por navegador: en uno nuevo, o para un activo que nunca cotizó, sigue el respaldo de `assets.json`. Las guardadas no cuentan para `ready`, así que no se guarda un snapshot con precios viejos. No se escriben en `assets.json` porque está versionado y cambiaría en cada commit.
- Variación del día (encabezado, debajo del total: "+$120.50 (+1.20%) hoy"): `getDayChange(assets)` (`utils/portfolio.js`) suma lo que movió cada tenencia según su `change24h` (cripto: últimas 24 horas; acciones: contra el cierre anterior), sobre lo que valía todo antes. El efectivo no cambia. No mira las transacciones: una compra de hoy cuenta con la variación de todo el día.

## CEDEARs y acciones argentinas

- Todo se ve en acciones de EE.UU. y dólares, como si se hubiera comprado afuera: el CEDEAR es solo el vehículo. 120 CEDEARs de MELI (ratio 120) son 1 MELI, valuadas al precio de MELI en EE.UU. Así una compra hecha por un broker argentino y una hecha afuera (Interactive Brokers, en dólares) suman a la misma posición, y el PPC se compara con la cotización real.
- Una acción argentina va por su ADR: 150 YPFD son 15 YPF (10 locales por ADR). Su símbolo es el del ADR (`YPF`, `PAM`, `TGS`, `EDN`, `GGAL`) y `localSymbol` guarda el de BYMA (`YPFD`, `PAMP`, `TGSU2`, `EDN`, `GGAL`).
- En `assets.json`, `ratio` es cuántas unidades argentinas (CEDEARs, o acciones locales por ADR) hay por acción, hoy. No se usa para valuar: solo para convertir una orden en pesos.
- Una orden en pesos se convierte con `fromPesos` (`utils/portfolio.js`): acciones = unidades ÷ ratio; precio en dólares = precio en pesos × ratio ÷ CCL del día. Al revés, `toLocalUnits` dice cuántos CEDEARs son las acciones que se tienen ("100 CEDEARs" disponibles, "Vender todo"), sin el resto que dejan los 8 decimales. Se usa el CCL porque es el dólar con el que cotiza el CEDEAR: con el MEP, cada compra arrancaría con ~5% de pérdida contra el precio de EE.UU. El CCL de un día sale de `fetchCclOn` (`services/dolarApi.js`): hoy, el de dolarapi en vivo; antes, el histórico de argentinadatos.com (`/v1/cotizaciones/dolares/contadoconliqui`, se pide una vez por carga).
- Un cambio de ratio de un CEDEAR (SPY pasó de 20 a 60 el 29/05/2026) o un split local (YPFD 10:1 el 03/08/2026) no cambia las acciones reales: no se carga nada, solo cambia el `ratio` del catálogo (se edita en el panel "Catálogo"). Cada orden se convirtió con el ratio de su momento.

## Moneda (USD / ARS)

- Todo se guarda y se calcula en dólares. El selector "USD | ARS" del encabezado (`CurrencyToggle`) solo cambia cómo se muestran los montos; se recuerda en `localStorage`.
- ARS = el dólar CCL de hoy (precio de venta) de dolarapi.com (`/v1/dolares`, sin key, con CORS), en `services/dolarApi.js`. Es el dólar con el que cotizan los CEDEARs, así los valores en pesos coinciden con los del broker. `useDollarRates` lo pide solo con ARS elegido y lo refresca cada 10 min. Mientras no llega, o si falla, los montos siguen en dólares y el selector lo avisa.
- Se convierten los valores: total, beneficio y su desglose, tabla, torta, historia (eje, tooltip y rendimiento) y los resúmenes de los paneles. Todo al CCL de hoy, también la historia: la curva se escala, no usa el CCL de cada día. Los % no cambian.
- Quedan en dólares los registros de lo que pasó: precio, total y comisión de cada orden, el resultado de cada venta, depósitos, retiros y el saldo de cada movimiento. En modo pesos dicen "US$". El formulario de transacción es siempre en dólares.
- En el código: `useMoney()` (de `MoneyContext`, que provee `App`) da `format`, `formatSigned` y `formatAxis` en la moneda elegida, y `formatUSD` y `formatSignedUSD` para los registros (`moneyFormatters` en `utils/format.js`). Un componente nuevo que muestre plata usa `useMoney()`, no `formatUSD` directo; la excepción es `TransactionModal`.

## Historial

- `useSnapshots` guarda un punto por hora (total y desglose por tipo) mientras la app está abierta y `ready` es true.
- `HistoryChart` filtra la serie por rango (24H/7D/30D por hora; 90D/1A/Todo por día) y agrega el valor actual como último punto. Con `estimatedUntil` sombrea el tramo estimado; con `loading` muestra "Cargando historial…".
- Línea punteada "Aportado": la plata que entró al grupo hasta cada punto. `useGroupHistory` entrega los flujos del grupo (`flows`, de `groupFlows` → `flowInto` en `utils/history.js`, que recibe transacciones expandidas: `{ time, amount }`) y `contributedUntil(flows, time)` los suma hasta cada punto. Cuenta lo que entra desde afuera del portfolio y lo que se mueve entre grupos: el efectivo gastado en cripto entra a Criptomonedas y sale de Acciones. Las rentas no son aportes. En "Todo" coincide con `getContributions`, y la suma de los dos grupos da "Todo".
- "Rendimiento 24H/7D/30D" = (valor − aportado) al final − lo mismo al principio del rango, o sea, el cambio sin contar depósitos ni retiros. El color de la curva sigue ese número, no el valor.
- Al lado va en %, con Modified Dietz (`periodReturn`): ese mismo resultado sobre el capital promedio invertido en el rango (valor inicial + cada flujo ponderado por la parte del rango en que estuvo invertido). Siempre tiene el mismo signo que el número en dólares. Si el grupo arranca el rango en 0, el período empieza con el primer flujo; sin capital, no se muestra. Hereda las limitaciones del número en dólares (ver abajo).
- Solo con el respaldo de snapshots: si cargás una transacción con fecha pasada, el aportado se corre hacia atrás pero los snapshots no, y en ese tramo la distancia entre las líneas no es la ganancia real. Además, hay huecos en los períodos en que la app estuvo cerrada. Con la serie reconstruida no pasa ninguna de las dos cosas.

## Estilo

- Tokens de color en `:root` de `App.css` (`--bg`, `--surface`, `--up`, `--down`, `--accent`, …). Solo tema oscuro.
- Clases con BEM liviano: `block__element`, `block--modifier`.
- Moneda en USD con formato en-US (`$6,351.61`); pesos en es-AR sin decimales (`$ 27.456.188`, compacto en el eje: `$27,5 M`); fechas en es-AR.
- Layout ancho (max-width 1800px, padding lateral chico) y responsive hasta mobile. La tabla de activos hace scroll horizontal.

## Pendientes

Están en `ROADMAP.md`, con prioridad y notas: arriba "Pendiente" y al final "Hecho", los dos con las mismas secciones numeradas por tema. Al terminar un ítem, marcalo con `[x]` y pasalo a su sección dentro de "Hecho" (si la sección no está en "Hecho", agregala respetando la numeración).
