# Portfolio Tracker

Dashboard personal para seguir un portfolio de cripto y acciones, con cotizaciones en vivo. Corre en tu computadora: los datos quedan en archivos JSON locales y no se suben a ningún lado.

## Qué hace

- **Total, beneficio histórico y variación del día**, con el desglose en no realizado, realizado y rentas, y el rendimiento anualizado.
- **Historia del portfolio** reconstruida con precios pasados (24H a Todo), separando lo que aportaste de lo que rindió.
- **Tabla de tenencias** con cantidad, PPC, resultado y peso; posiciones cerradas aparte.
- **Detalle de cada activo**: gráfico de precio con tus compras y ventas marcadas, y el historial de órdenes.
- **Compras, ventas, rentas (dividendos, staking), splits, depósitos y retiros**, con efectivo en USD y liquidación en USDT para cripto.
- **CEDEARs y acciones argentinas**: cargás la orden en pesos y se convierte a acciones de EE.UU. y dólares con el ratio y el dólar CCL del día.
- **Montos en USD o en pesos** (al CCL de hoy).

## Cómo correrlo

Necesitás [Node.js](https://nodejs.org) 18 o más nuevo.

```bash
npm install
cp .env.example .env.local   # opcional: completá la key de Finnhub
npm run dev
```

Abrí http://127.0.0.1:5173 y cargá tu primera operación con "Agregar transacción". El buscador encuentra cualquier cripto con par USDT en Binance y, con la key de Finnhub, acciones y ETFs de EE.UU.

La app necesita el dev server (`npm run dev`) para guardar: no está pensada para deployarse.

## De dónde salen los precios

| Qué | Fuente | Key |
| --- | --- | --- |
| Cripto en vivo y precios pasados | Binance (API pública) | No |
| Acciones y ETFs en vivo, buscador | [Finnhub](https://finnhub.io) (plan gratis) | Sí, en `.env.local` |
| Precios pasados de acciones | Yahoo Finance (API no oficial, por el proxy del dev server) | No |
| Dólar CCL | dolarapi.com y argentinadatos.com | No |

## Tus datos

- `src/data/transactions.json`: todas tus operaciones. Es la fuente de verdad; cantidades, PPC y resultados se calculan a partir de ahí.
- `src/data/assets.json`: el catálogo de activos (se agranda solo al cargar un activo nuevo).
- `src/data/history.json`: snapshots del valor, de respaldo. Se crea solo y git lo ignora.

Para hacer un backup, usá el botón "Backup" de la tabla: descarga un CSV con tus operaciones y el catálogo. Guardalo fuera de la compu (por ejemplo en Drive) y no lo abras con Excel, que cambia los números. Para volver a ese punto, "Backup" → "Elegir archivo…"; si la app no abre, `npm run restore -- <backup.csv>`. Lo que la restauración reemplaza queda en `backups/`.

Si subís tu copia a un repo público, **no commitees `assets.json` ni `transactions.json` con tus datos**.

## Comandos

- `npm run dev`: la app, en http://127.0.0.1:5173.
- `npm test`: tests de los cálculos (Vitest).
- `npm run restore -- <backup.csv>`: restaura un backup sin abrir la app.
- `npm run lint`: ESLint.
- `npm run build`: build de producción (solo lectura: sin dev server no hay dónde guardar).

## Para seguir desarrollando

El proyecto está hecho con [Claude Code](https://claude.com/claude-code). `CLAUDE.md` explica la arquitectura, los datos y las reglas de cálculo; `ROADMAP.md`, lo pendiente y lo hecho.

Stack: React 18, Vite 5, Recharts 2 y CSS plano, en JavaScript.
