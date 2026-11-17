import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import AssetPicker from './AssetPicker.jsx'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape.js'
import { toCatalogAsset } from '../services/assetCatalog.js'
import { fetchCclOn } from '../services/dolarApi.js'
import { formatARS, formatQuantity, formatUSD } from '../utils/format.js'
import { STABLECOIN, deriveTradeField, fromPesos, roundQuantity, splitRatio } from '../utils/portfolio.js'

const TYPES = [
  { key: 'buy', label: 'Compra' },
  { key: 'sell', label: 'Venta' },
  { key: 'deposit', label: 'Depósito' },
  { key: 'withdrawal', label: 'Retiro' },
  { key: 'income', label: 'Renta' },
  { key: 'split', label: 'Split' },
]

// The current local date and time, split the way the date and time inputs hold them.
const now = () => {
  const current = new Date()
  const pad = (number) => String(number).padStart(2, '0')
  return {
    date: `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`,
    time: `${pad(current.getHours())}:${pad(current.getMinutes())}`,
  }
}

// A trade entered in pesos (see `inPesos`): units, price and fee in pesos, the ratio
// (empty: the asset's) and the CCL of the day.
const EMPTY_PESOS = { units: '', arsPrice: '', arsFee: '', ratio: '', ccl: '' }

// A trade in dollars has three tied fields (total = quantity × price). The two typed last
// (`tradeInputs`, oldest first) stay, and the third is calculated: quantity and price give
// the total, and typing what was paid gives the price (or the quantity).
const TRADE_FIELDS = ['quantity', 'price', 'total']
const TRADE_INPUTS = ['quantity', 'price']
const derivedField = (form) => TRADE_FIELDS.find((field) => !form.tradeInputs.includes(field))

// Fills in the calculated field; it stays empty until the other two are valid.
const solveTrade = (form) => {
  const field = derivedField(form)
  const value = deriveTradeField(field, {
    quantity: Number(form.quantity),
    price: Number(form.price),
    total: Number(form.total),
  })
  return { ...form, [field]: value === null ? '' : String(value) }
}

const setTradeField = (form, field, value) =>
  solveTrade({
    ...form,
    [field]: value,
    tradeInputs: [...form.tradeInputs.filter((item) => item !== field), field].slice(-2),
  })

// Inputs hold strings, so numbers go back to text to prefill the form.
// A saved date is 'YYYY-MM-DD', plus 'THH:mm' when it has a time of day.
const toForm = (transaction) => solveTrade({
  type: transaction.type,
  date: transaction.date.slice(0, 10),
  time: transaction.date.slice(11, 16),
  quantity: String(transaction.quantity ?? ''),
  price: String(transaction.price ?? ''),
  fee: transaction.fee ? String(transaction.fee) : '',
  amount: String(transaction.amount ?? ''),
  funding: transaction.funding ?? 'external',
  proceeds: transaction.proceeds ?? 'cash',
  payout: transaction.amount ? 'cash' : 'asset',
  newShares: String(transaction.newShares ?? ''),
  oldShares: String(transaction.oldShares ?? '1'),
  // Saved trades are in dollars, so they're edited in dollars.
  priceIn: 'usd',
  total: '',
  tradeInputs: TRADE_INPUTS,
  ...EMPTY_PESOS,
})

// Adds a transaction, or edits `editing` (its type and asset stay fixed).
export default function TransactionModal({
  assets,
  holdings,
  cashBalance,
  initialAsset = null,
  initialType = 'buy',
  editing = null,
  onSubmit,
  onClose,
}) {
  const [asset, setAsset] = useState(initialAsset)
  // Income paid in another asset (staking BTC paid in NEXO): the one received.
  const [payoutAsset, setPayoutAsset] = useState(null)
  // Default to paying with cash only when there is some.
  const defaultFunding = cashBalance > 0 ? 'cash' : 'external'
  const [form, setForm] = useState(() =>
    editing
      ? toForm(editing)
      : {
          type: initialType,
          ...now(),
          quantity: '',
          price: initialAsset ? String(initialAsset.price) : '',
          total: '',
          tradeInputs: TRADE_INPUTS,
          fee: '',
          amount: '',
          funding: defaultFunding,
          proceeds: 'cash',
          // Income: null until chosen, so it follows the asset (see `payout`).
          payout: null,
          // Split: "you get `newShares` for every `oldShares`".
          newShares: '',
          oldShares: '1',
          // Trades: null until chosen, so it follows the asset (see `priceIn`).
          priceIn: null,
          ...EMPTY_PESOS,
        },
  )
  const [error, setError] = useState('')
  const [loadingAsset, setLoadingAsset] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cclStatus, setCclStatus] = useState('idle')
  useCloseOnEscape(onClose)
  // A click only closes the modal when it started on the backdrop: selecting text in a
  // field and releasing the mouse outside also ends as a click on the backdrop.
  const pressedBackdrop = useRef(false)

  const isTrade = form.type === 'buy' || form.type === 'sell'
  const isIncome = form.type === 'income'
  const isSplit = form.type === 'split'
  const hasAsset = isTrade || isIncome || isSplit
  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))
  const choose = (field, value) => () => setForm((prev) => ({ ...prev, [field]: value }))
  const updateTrade = (field) => (event) => setForm((prev) => setTradeField(prev, field, event.target.value))
  const derived = derivedField(form)
  const derivedNote = (field) => (derived === field ? ' · calculado' : '')

  // New assets come from a market search and need their catalog entry built
  // (name, category, current price) before they can be saved. `onPicked` gets
  // that entry, or null if it couldn't be loaded.
  const pickAsset = (onPicked) => async (option) => {
    setError('')
    if (!option.isNew) return onPicked(option)

    setLoadingAsset(true)
    try {
      onPicked(await toCatalogAsset(option, assets.map((item) => item.color)))
    } catch {
      onPicked(null)
      setError(`No se pudieron cargar los datos de ${option.symbol}. Probá de nuevo.`)
    } finally {
      setLoadingAsset(false)
    }
  }

  const selectAsset = pickAsset((entry) => {
    setAsset(entry)
    if (!entry) return
    setForm((prev) => {
      // A price already calculated from the quantity and the total paid beats the quote.
      if (derivedField(prev) === 'price' && prev.price) return prev
      return solveTrade({ ...prev, price: entry.price ? String(entry.price) : '' })
    })
  })
  const selectPayoutAsset = pickAsset(setPayoutAsset)

  // Crypto usually pays in kind (staking) and stocks in cash (dividends).
  const payout = form.payout ?? (asset?.type === 'crypto' ? 'asset' : 'cash')
  const paidInKind = isIncome && payout !== 'cash'
  // The asset the transaction is saved under: the one that grows. Only income paid in another asset differs.
  const received = paidInKind && payout === 'other' ? payoutAsset : asset

  const holding = holdings.find((item) => item.symbol === received?.symbol)
  const held = holding?.quantity ?? 0

  // A stock bought in Argentina (CEDEAR, or local share for its ADR) can be entered in
  // pesos, the way the broker shows it: it's saved in shares and dollars at the CCL
  // (fromPesos). Stocks with a known ratio start in pesos.
  const canUsePesos = isTrade && asset?.type === 'stock'
  const inPesos = canUsePesos && (form.priceIn ?? (asset.ratio ? 'ars' : 'usd')) === 'ars'
  const unitsLabel = asset?.localSymbol ? `Acciones ${asset.localSymbol}` : 'CEDEARs'
  const ratioText = form.ratio || (asset?.ratio ? String(asset.ratio) : '')
  const pesos = {
    units: Number(form.units),
    arsPrice: Number(form.arsPrice),
    arsFee: Number(form.arsFee || 0),
    ratio: Number(ratioText),
    ccl: Number(form.ccl),
  }
  const converted = inPesos ? fromPesos(pesos) : null
  // Selling every unit can land a hair off the shares held (8 decimals): it sells them all.
  const sellsAll = converted && form.type === 'sell' && Math.abs(converted.quantity - held) < 1e-6

  // Saved with 8 decimals at most, like every quantity.
  const quantity = inPesos ? (sellsAll ? held : converted.quantity) : roundQuantity(Number(form.quantity))
  const price = inPesos ? converted.price : Number(form.price)
  const fee = inPesos ? converted.fee : Number(form.fee || 0)
  const amount = Number(form.amount)
  const gross = quantity * price
  const split = { newShares: Number(form.newShares), oldShares: Number(form.oldShares) }

  // Crypto trades can settle in USDT instead of dollars (only once USDT is in the catalog).
  // Switching to an asset that can't falls back to the dollar options.
  const canUseUsdt =
    asset?.type === 'crypto' && asset.symbol !== STABLECOIN && assets.some((item) => item.symbol === STABLECOIN)
  const usdtHeld = holdings.find((holding) => holding.symbol === STABLECOIN)?.quantity ?? 0
  const proceeds = canUseUsdt ? form.proceeds : 'cash'
  const funding = canUseUsdt || form.funding !== 'usdt' ? form.funding : defaultFunding

  // The CCL of the order's day, to convert the pesos. It stays editable, in case the
  // broker's rate was another one.
  useEffect(() => {
    if (!inPesos) return
    let cancelled = false
    setCclStatus('loading')
    fetchCclOn(form.date)
      .then((rate) => {
        if (cancelled) return
        setForm((prev) => ({ ...prev, ccl: String(rate) }))
        setCclStatus('idle')
      })
      .catch(() => {
        if (!cancelled) setCclStatus('failed')
      })
    return () => {
      cancelled = true
    }
  }, [inPesos, form.date])

  const validate = () => {
    if (form.date > now().date) return 'La fecha no puede ser futura.'
    if (isTrade) {
      if (!asset) return 'Elegí un activo.'
      if (inPesos) {
        if (!(pesos.units > 0)) return 'La cantidad debe ser mayor a 0.'
        if (!(pesos.arsPrice > 0)) return 'El precio en pesos debe ser mayor a 0.'
        if (!(pesos.ratio > 0)) return `Falta el ratio: cuántos ${unitsLabel} hay por acción de ${asset.symbol}.`
        if (!(pesos.ccl > 0)) return 'Falta el dólar CCL de ese día.'
      }
      if (!(quantity > 0)) return 'La cantidad debe ser mayor a 0.'
      if (!(price > 0)) return 'El precio debe ser mayor a 0.'
      if (fee < 0) return 'La comisión no puede ser negativa.'
      if (form.type === 'sell' && quantity > held) return `No podés vender más de lo que tenés (${formatQuantity(held)} ${asset.symbol}).`
      return ''
    }

    if (isSplit) {
      if (!asset) return 'Elegí un activo.'
      if (asset.type !== 'stock') return 'Los splits son solo para acciones.'
      if (!(split.newShares > 0 && split.oldShares > 0)) return 'La proporción tiene que ser de números mayores a 0.'
      if (split.newShares === split.oldShares) return 'Con la misma cantidad de un lado y del otro no hay split.'
      if (!editing && held <= 0) return `No tenés ${asset.symbol}: un split solo cambia una tenencia.`
      return ''
    }

    if (isIncome && !asset) return 'Elegí un activo.'
    if (paidInKind && !received) return 'Elegí el activo que recibiste.'
    if (paidInKind) return quantity > 0 ? '' : 'La cantidad debe ser mayor a 0.'

    if (!(amount > 0)) return 'El monto debe ser mayor a 0.'
    if (form.type === 'withdrawal' && amount > cashBalance) {
      return `No podés retirar más que el efectivo disponible (${formatUSD(cashBalance)}).`
    }
    return ''
  }

  const buildTransaction = () => {
    // Without a time, it counts from the start of the day.
    const date = form.time ? `${form.date}T${form.time}` : form.date
    const base = { id: editing?.id ?? crypto.randomUUID(), date, type: form.type }
    if (isSplit) return { ...base, symbol: asset.symbol, ...split }
    if (isIncome && !paidInKind) return { ...base, symbol: asset.symbol, amount }
    if (isIncome) {
      // `source` remembers what generated it when it was paid in another asset.
      const source = received.symbol === asset.symbol ? {} : { source: asset.symbol }
      return { ...base, symbol: received.symbol, quantity, ...source }
    }
    if (!isTrade) return { ...base, amount }

    const trade = { ...base, symbol: asset.symbol, quantity, price, fee }
    return form.type === 'buy' ? { ...trade, funding } : { ...trade, proceeds }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const validationError = validate()
    if (validationError) return setError(validationError)

    setError('')
    setSaving(true)
    try {
      // A new stock entered in pesos remembers its ratio for the next time.
      const entry = inPesos && !received.ratio ? { ...received, ratio: pesos.ratio } : received
      await onSubmit(buildTransaction(), hasAsset ? entry : null)
    } catch (submitError) {
      setError(submitError.message)
      setSaving(false)
    }
  }

  const cashHint = () => {
    if (form.type === 'sell') {
      if (gross <= 0) return ''
      return proceeds === 'usdt'
        ? `Recibís ${formatQuantity(gross - fee)} ${STABLECOIN}; tu efectivo no cambia.`
        : `Se acreditan ${formatUSD(gross - fee)} en tu efectivo USD.`
    }
    if (form.type === 'buy') {
      if (funding === 'external') return 'Cuenta como plata nueva que entra al portfolio.'
      if (gross <= 0) return ''
      if (funding === 'usdt') {
        return `Se descuentan ${formatQuantity(gross + fee)} ${STABLECOIN} (${formatQuantity(usdtHeld)} disponibles); tu efectivo no cambia.`
      }
      return `Se descuentan ${formatUSD(gross + fee)} de tu efectivo (${formatUSD(cashBalance)} disponible).`
    }
    if (paidInKind) {
      return `Recompensas o intereses en cripto: suman ${received?.symbol ?? 'unidades del activo'} con costo 0 (baja el PPC) y todo su valor cuenta como ganancia.`
    }
    if (isIncome) return 'Dividendos o intereses: suman a tu efectivo y no cuentan como plata nueva, son ganancia.'
    if (isSplit) {
      const ratio = splitRatio(split)
      if (!(ratio > 0) || ratio === 1) return 'Cambia la cantidad y el PPC en la misma proporción. No mueve plata.'
      // While editing, the holding is the one without this split: show only the ratio.
      if (!holding || editing) {
        return `La cantidad se multiplica por ${formatQuantity(ratio)} y el PPC se divide por lo mismo. No mueve plata.`
      }
      const after = `${formatQuantity(roundQuantity(held * ratio))} ${asset.symbol}`
      const avgCosts = `${formatUSD(holding.avgCost)} a ${formatUSD(holding.avgCost / ratio)}`
      return `Pasás de ${formatQuantity(held)} a ${after}, y el PPC de ${avgCosts}. No mueve plata.`
    }
    if (form.type === 'deposit') return 'Suma a tu efectivo y cuenta como plata nueva que entra al portfolio.'
    return `Resta de tu efectivo (${formatUSD(cashBalance)} disponible).`
  }

  const typeLabel = TYPES.find((item) => item.key === form.type).label.toLowerCase()
  const title = editing ? `Editar ${typeLabel}${asset ? ` de ${asset.symbol}` : ''}` : 'Agregar transacción'

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => pressedBackdrop.current && event.target === event.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal__header">
          <h3 id="modal-title">{title}</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <form className="modal__form" onSubmit={handleSubmit}>
          {!editing && (
            <div className="segmented segmented--full" role="group" aria-label="Tipo de operación">
              {TYPES.map((item) => (
                <button key={item.key} type="button" aria-pressed={form.type === item.key} onClick={choose('type', item.key)}>
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {hasAsset && !editing && (
            <div className="field">
              Activo
              <AssetPicker catalog={assets} selected={asset} onSelect={selectAsset} />
            </div>
          )}

          <div className="modal__row">
            <label>
              Fecha
              <input type="date" value={form.date} max={now().date} onChange={update('date')} required />
            </label>
            <label>
              Hora (opcional)
              <input type="time" value={form.time} onChange={update('time')} />
            </label>
          </div>

          {isSplit ? (
            <div className="modal__row">
              <label>
                Recibís
                <input type="number" step="any" min="0" value={form.newShares} onChange={update('newShares')} required />
              </label>
              <label>
                Por cada
                <input type="number" step="any" min="0" value={form.oldShares} onChange={update('oldShares')} required />
              </label>
            </div>
          ) : isTrade ? (
            <>
              {canUsePesos && (
                <div className="field">
                  Precio en
                  <div className="segmented segmented--full" role="group" aria-label="Moneda de la orden">
                    <button type="button" aria-pressed={!inPesos} onClick={choose('priceIn', 'usd')}>
                      Dólares
                    </button>
                    <button type="button" aria-pressed={inPesos} onClick={choose('priceIn', 'ars')}>
                      Pesos (Argentina)
                    </button>
                  </div>
                </div>
              )}

              {inPesos ? (
                <>
                  <div className="modal__row">
                    <div className="field">
                      <span className="field__label">
                        {unitsLabel}
                        {form.type === 'sell' && held > 0 && pesos.ratio > 0 && (
                          <button
                            type="button"
                            className="field__action"
                            onClick={choose('units', String(roundQuantity(held * pesos.ratio)))}
                          >
                            Vender todo
                          </button>
                        )}
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        aria-label={unitsLabel}
                        value={form.units}
                        onChange={update('units')}
                        required
                      />
                    </div>
                    <label>
                      Precio en pesos
                      <input type="number" step="any" min="0" value={form.arsPrice} onChange={update('arsPrice')} required />
                    </label>
                  </div>

                  <div className="modal__row">
                    <label>
                      Ratio (por acción)
                      <input type="number" step="any" min="0" value={ratioText} onChange={update('ratio')} required />
                    </label>
                    <label>
                      Dólar CCL
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={form.ccl}
                        placeholder={cclStatus === 'loading' ? 'Cargando…' : ''}
                        onChange={update('ccl')}
                        required
                      />
                    </label>
                  </div>

                  <label>
                    Comisión (pesos, opcional)
                    <input type="number" step="any" min="0" value={form.arsFee} onChange={update('arsFee')} />
                  </label>

                  {cclStatus === 'failed' && (
                    <p className="modal__hint">No se pudo traer el dólar CCL de ese día: cargalo a mano.</p>
                  )}
                  {quantity > 0 && price > 0 && (
                    <p className="modal__hint">
                      Son {formatQuantity(quantity)} {asset.symbol} a {formatUSD(price)} por acción (dólar CCL{' '}
                      {formatARS(pesos.ccl)}).
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="modal__row">
                    <div className="field">
                      <span className="field__label">
                        Cantidad{derivedNote('quantity')}
                        {/* Closing a position sells all of it: no need to type the leftover decimals. */}
                        {form.type === 'sell' && held > 0 && (
                          <button
                            type="button"
                            className="field__action"
                            onClick={() => setForm((prev) => setTradeField(prev, 'quantity', String(held)))}
                          >
                            Vender todo
                          </button>
                        )}
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        aria-label="Cantidad"
                        value={form.quantity}
                        onChange={updateTrade('quantity')}
                        required
                      />
                    </div>
                    <label>
                      Precio unitario (USD){derivedNote('price')}
                      <input type="number" step="any" min="0" value={form.price} onChange={updateTrade('price')} required />
                    </label>
                  </div>

                  <div className="modal__row">
                    <label>
                      Total (USD){derivedNote('total')}
                      <input type="number" step="any" min="0" value={form.total} onChange={updateTrade('total')} />
                    </label>
                    <label>
                      Comisión (USD, opcional)
                      <input type="number" step="any" min="0" value={form.fee} onChange={update('fee')} />
                    </label>
                  </div>

                  <p className="modal__hint">
                    Cantidad, precio y total van atados: completá dos y el otro se calcula. El total no incluye la comisión.
                  </p>
                </>
              )}

              {form.type === 'buy' && (
                <div className="field">
                  Pagar con
                  <div className="segmented segmented--full" role="group" aria-label="Origen de la plata">
                    <button type="button" aria-pressed={funding === 'cash'} onClick={choose('funding', 'cash')}>
                      Efectivo ({formatUSD(cashBalance)})
                    </button>
                    {canUseUsdt && (
                      <button type="button" aria-pressed={funding === 'usdt'} onClick={choose('funding', 'usdt')}>
                        {STABLECOIN} ({formatQuantity(usdtHeld)})
                      </button>
                    )}
                    <button type="button" aria-pressed={funding === 'external'} onClick={choose('funding', 'external')}>
                      Plata nueva
                    </button>
                  </div>
                </div>
              )}

              {form.type === 'sell' && canUseUsdt && (
                <div className="field">
                  Recibir en
                  <div className="segmented segmented--full" role="group" aria-label="Destino de la plata">
                    <button type="button" aria-pressed={proceeds === 'cash'} onClick={choose('proceeds', 'cash')}>
                      Efectivo USD
                    </button>
                    <button type="button" aria-pressed={proceeds === 'usdt'} onClick={choose('proceeds', 'usdt')}>
                      {STABLECOIN}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Like type and asset, how income was paid stays fixed while editing. */}
              {isIncome && !editing && (
                <div className="field">
                  Recibir en
                  <div className="segmented segmented--full" role="group" aria-label="Forma de cobro">
                    <button type="button" aria-pressed={payout === 'cash'} onClick={choose('payout', 'cash')}>
                      Efectivo USD
                    </button>
                    <button type="button" aria-pressed={payout === 'asset'} onClick={choose('payout', 'asset')}>
                      {asset?.symbol ?? 'El activo'}
                    </button>
                    <button type="button" aria-pressed={payout === 'other'} onClick={choose('payout', 'other')}>
                      Otro activo
                    </button>
                  </div>
                </div>
              )}

              {isIncome && !editing && payout === 'other' && (
                <div className="field">
                  Activo recibido
                  <AssetPicker catalog={assets} selected={payoutAsset} onSelect={selectPayoutAsset} />
                </div>
              )}

              {paidInKind ? (
                <label>
                  Cantidad recibida
                  <input type="number" step="any" min="0" value={form.quantity} onChange={update('quantity')} required />
                </label>
              ) : (
                <label>
                  Monto (USD)
                  <input type="number" step="any" min="0" value={form.amount} onChange={update('amount')} required />
                </label>
              )}
            </>
          )}

          {loadingAsset && <p className="modal__hint">Cargando datos del activo…</p>}
          {/* While editing a buy, the holding without it isn't useful information. */}
          {hasAsset && received && !loadingAsset && (!editing || form.type === 'sell') && (
            <p className="modal__hint">
              {assets.some((item) => item.symbol === received.symbol)
                ? `Tenés ${formatQuantity(held)} ${received.symbol} disponibles${
                    inPesos && pesos.ratio > 0 ? ` (${formatQuantity(roundQuantity(held * pesos.ratio))} ${unitsLabel})` : ''
                  }.`
                : `${received.symbol} es nuevo: se va a agregar a tu catálogo de activos.`}
            </p>
          )}
          {cashHint() && <p className="modal__hint">{cashHint()}</p>}
          {error && <p className="modal__error">{error}</p>}

          <div className="modal__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="add-button" disabled={saving || loadingAsset}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
