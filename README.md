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

## Cómo usarlo (Windows, sin instalar nada)

1. Bajá `PortfolioTracker.exe` de la [última versión](https://github.com/francofallatti/portfolio-tracker/releases/latest) y guardalo en una carpeta propia (por ejemplo `Documentos\PortfolioTracker`).
2. Abrilo con doble clic. La primera vez Windows avisa que no conoce el programa: "Más información" → "Ejecutar de todas formas".
3. Se abre el navegador con la app. Cargá tu primera operación con "Agregar transacción".

Queda abierta una ventana negra: es la app corriendo. Dejala abierta mientras la usás y cerrala para apagarla.

Para cotizar y buscar acciones y ETFs hace falta una key gratis de [Finnhub](https://finnhub.io/register): la app la pide la primera vez y se puede cargar o cambiar después desde "Key de Finnhub", arriba a la izquierda. Sin key, cripto funciona igual.

Tus datos quedan en la carpeta `data`, al lado del ejecutable. Para actualizar, reemplazá el `.exe` por el nuevo: los datos no se tocan.

## Cómo correrlo desde el código

Necesitás [Node.js](https://nodejs.org) 22.12 o más nuevo.

```bash
npm install
npm run dev
```

Abrí http://localhost:5173. El buscador encuentra cualquier cripto con par USDT en Binance y, con la key de Finnhub, acciones y ETFs de EE.UU.

La app necesita su servidor local (el ejecutable o `npm run dev`) para leer y guardar: no está pensada para deployarse.

## De dónde salen los precios

| Qué | Fuente | Key |
| --- | --- | --- |
| Cripto en vivo y precios pasados | Binance (API pública) | No |
| Acciones y ETFs en vivo, buscador | [Finnhub](https://finnhub.io) (plan gratis) | Sí, se carga en la app |
| Precios pasados de acciones | Yahoo Finance (API no oficial, por el servidor local) | No |
| Dólar CCL | dolarapi.com y argentinadatos.com | No |

## Tus datos

Con el ejecutable están en la carpeta `data`, a su lado; desde el código, en `src/data`.

- `transactions.json`: todas tus operaciones. Es la fuente de verdad; cantidades, PPC y resultados se calculan a partir de ahí.
- `assets.json`: el catálogo de activos (se agranda solo al cargar un activo nuevo).
- `history.json`: snapshots del valor, de respaldo. Se crea solo y git lo ignora.
- `settings.json`: tu key de Finnhub, si la cargaste desde la app. Git lo ignora.

Para hacer un backup, usá el botón "Backup" de la tabla: descarga un CSV con tus operaciones y el catálogo. Guardalo fuera de la compu (por ejemplo en Drive) y no lo abras con Excel, que cambia los números. Para volver a ese punto, "Backup" → "Elegir archivo…"; si la app no abre, arrastrá el CSV sobre `PortfolioTracker.exe` (o, desde el código, `npm run restore -- <backup.csv>`). Lo que la restauración reemplaza queda en `backups/`.

Si subís tu copia a un repo público, **no commitees `assets.json` ni `transactions.json` con tus datos**.

## Comandos

- `npm run dev`: la app, en http://localhost:5173.
- `npm test`: tests de los cálculos (Vitest).
- `npm run restore -- <backup.csv>`: restaura un backup sin abrir la app.
- `npm run lint`: ESLint.
- `npm run build`: build de producción (la app sola, sin su servidor local).
- `npm run build:exe`: arma el ejecutable en `dist-exe/`. Necesita [Bun](https://bun.com).

## Para seguir desarrollando

El proyecto está hecho con [Claude Code](https://claude.com/claude-code). `CLAUDE.md` explica la arquitectura, los datos y las reglas de cálculo; `ROADMAP.md`, lo pendiente y lo hecho.

Stack: React 18, Vite 8, Recharts 3 y CSS plano, en JavaScript. El ejecutable se compila con Bun.
