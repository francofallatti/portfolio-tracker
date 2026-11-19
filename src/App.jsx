import { useCallback, useEffect, useMemo, useState } from 'react'
import initialAssets from './data/assets.json'
import initialTransactions from './data/transactions.json'
import initialSnapshots from './data/history.json'
import PortfolioHeader from './components/PortfolioHeader.jsx'
import HistoryChart from './components/HistoryChart.jsx'
import AllocationChart from './components/AllocationChart.jsx'
import AssetsTable from './components/AssetsTable.jsx'
import AssetDetail from './components/AssetDetail.jsx'
import BackupModal from './components/BackupModal.jsx'
import CashDetail from './components/CashDetail.jsx'
import CatalogPanel from './components/CatalogPanel.jsx'
import CurrencyToggle from './components/CurrencyToggle.jsx'
import LiveStatus from './components/LiveStatus.jsx'
import TransactionModal from './components/TransactionModal.jsx'
import { useGroupHistory } from './hooks/useGroupHistory.js'
import { useLiveQuotes } from './hooks/useLiveQuotes.js'
import { MoneyContext, useDollarRates } from './hooks/useMoney.js'
import { useSnapshots } from './hooks/useSnapshots.js'
import { deleteItems, restoreBackup, saveItem, updateItem } from './services/dataStore.js'
import { moneyFormatters } from './utils/format.js'
import { HISTORY_RANGES, annualizedReturn, lifetimeReturn, portfolioFlows } from './utils/history.js'
import {
  ASSET_GROUPS,
  CASH_SYMBOL,
  applyQuotes,
  buildClosedPositions,
  buildHoldings,
  expandTransactions,
  filterByGroup,
  findLedgerError,
  getAssetsWithMetrics,
  getContributions,
  getDayChange,
  getResults,
  getTotals,
  usedSymbols,
} from './utils/portfolio.js'

const CURRENCY_KEY = 'display-currency'

// Remembering the currency is a per-browser convenience; storage can be unavailable.
const readCurrency = () => {
  try {
    return localStorage.getItem(CURRENCY_KEY) === 'ARS' ? 'ARS' : 'USD'
  } catch {
    return 'USD'
  }
}

export default function App() {
  const [catalog, setCatalog] = useState(initialAssets)
  const [transactions, setTransactions] = useState(initialTransactions)
  // null when closed; `asset` and `type` preselect the form when opened from a detail panel.
  const [modal, setModal] = useState(null)
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  // null when closed; `editing` is the symbol whose form starts open (from a detail panel).
  const [catalogPanel, setCatalogPanel] = useState(null)
  const [backupOpen, setBackupOpen] = useState(false)
  // The table tab; it also filters both charts.
  const [groupKey, setGroupKey] = useState('all')
  // The range of the history chart: it decides whether the series is hourly or daily.
  const [rangeKey, setRangeKey] = useState('30d')
  const { resolution } = HISTORY_RANGES.find((range) => range.key === rangeKey)
  const { quotes, cryptoStatus, stockStatus, ready } = useLiveQuotes(catalog)
  // Everything is kept in dollars; 'ARS' only shows values in pesos at the MEP dollar.
  const [currency, setCurrency] = useState(readCurrency)
  // Pesos at the CCL dollar: the one CEDEARs follow, so values match the broker's in pesos.
  const dollar = useDollarRates(currency === 'ARS')
  const money = useMemo(() => moneyFormatters(currency === 'ARS' ? dollar.rates?.ccl : null), [currency, dollar.rates])

  const changeCurrency = (next) => {
    setCurrency(next)
    try {
      localStorage.setItem(CURRENCY_KEY, next)
    } catch {
      // Not persisted; the currency still changes for this session.
    }
  }

  const pricedCatalog = useMemo(() => applyQuotes(catalog, quotes), [catalog, quotes])
  const holdings = useMemo(() => buildHoldings(pricedCatalog, transactions), [pricedCatalog, transactions])
  const assets = useMemo(() => getAssetsWithMetrics(holdings), [holdings])
  const contributions = useMemo(() => getContributions(transactions), [transactions])
  const totals = useMemo(() => getTotals(assets, contributions), [assets, contributions])
  const dayChange = useMemo(() => getDayChange(assets), [assets])
  // The gain in %: over the most that was ever put in, and per year.
  const returns = useMemo(() => {
    const flows = portfolioFlows(transactions)
    const end = { time: Date.now(), value: totals.value }
    return { lifetime: lifetimeReturn(flows, end), annualized: annualizedReturn(flows, end) }
  }, [transactions, totals.value])
  const closedPositions = useMemo(() => buildClosedPositions(pricedCatalog, transactions), [pricedCatalog, transactions])
  const results = useMemo(() => getResults(assets, closedPositions), [assets, closedPositions])
  const snapshots = useSnapshots(initialSnapshots, assets, ready)

  const groupAssets = useMemo(() => filterByGroup(assets, groupKey), [assets, groupKey])
  const groupHistory = useGroupHistory(groupKey, { snapshots, transactions, catalog: pricedCatalog, resolution })
  const groupValue = groupAssets.reduce((sum, asset) => sum + asset.value, 0)
  // Shown next to the chart titles while they show only part of the portfolio.
  const groupLabel = groupKey === 'all' ? null : ASSET_GROUPS.find((group) => group.key === groupKey).label

  const selectedAsset =
    assets.find((asset) => asset.symbol === selectedSymbol) ??
    closedPositions.find((position) => position.symbol === selectedSymbol)
  // Expanded, so USDT also lists what crypto sales paid out in it.
  const selectedTransactions = useMemo(
    () => expandTransactions(transactions).filter((transaction) => transaction.symbol === selectedSymbol),
    [transactions, selectedSymbol],
  )

  // Selling out keeps the detail open (as a closed position); deleting every transaction closes it.
  useEffect(() => {
    if (selectedSymbol && !selectedAsset) setSelectedSymbol(null)
  }, [selectedSymbol, selectedAsset])

  const closeDetail = useCallback(() => setSelectedSymbol(null), [])
  const closeModal = useCallback(() => setModal(null), [])
  const closeCatalog = useCallback(() => setCatalogPanel(null), [])
  const closeBackup = useCallback(() => setBackupOpen(false), [])
  const symbolsInUse = useMemo(() => usedSymbols(transactions), [transactions])

  // While editing, the form sees the portfolio without the transaction being edited,
  // so what it shows as available is what that transaction can use.
  const editingId = modal?.transaction?.id
  const formHoldings = useMemo(
    () => (editingId ? buildHoldings(pricedCatalog, transactions.filter((item) => item.id !== editingId)) : holdings),
    [editingId, pricedCatalog, transactions, holdings],
  )
  const cashBalance = formHoldings.find((holding) => holding.symbol === CASH_SYMBOL)?.quantity ?? 0

  const startEdit = (id) => {
    const transaction = transactions.find((item) => item.id === id)
    const asset = catalog.find((item) => item.symbol === transaction.symbol) ?? null
    setModal({ transaction, asset, type: transaction.type })
  }

  // `asset` is null for cash movements. Assets found in a market search are
  // added to the catalog before their first transaction.
  const addTransaction = async (transaction, asset) => {
    const ledgerError = findLedgerError([...transactions, transaction])
    if (ledgerError) throw new Error(`No se puede guardar: ${ledgerError}.`)

    const known = asset && catalog.find((item) => item.symbol === asset.symbol)
    if (asset && !known) {
      await saveItem('/api/assets', asset)
      setCatalog((prev) => [...prev, asset])
    }
    // A known stock entered in pesos for the first time keeps the ratio it was given.
    if (known && asset.ratio && !known.ratio) await updateAsset(asset.symbol, { ratio: asset.ratio })

    await saveItem('/api/transactions', transaction)
    setTransactions((prev) => [...prev, transaction])
    setModal(null)
  }

  const editTransaction = async (edited) => {
    // Merged like the PATCH does, so fields the form doesn't send (an income's `source`) stay.
    const updated = transactions.map((transaction) =>
      transaction.id === edited.id ? { ...transaction, ...edited } : transaction,
    )
    const ledgerError = findLedgerError(updated)
    if (ledgerError) throw new Error(`No se puede guardar: ${ledgerError}.`)

    const { id, type, symbol, ...changes } = edited
    await updateItem('/api/transactions', id, changes)
    setTransactions(updated)
    setModal(null)
  }

  const deleteOrders = async (ids) => {
    const remaining = transactions.filter((transaction) => !ids.includes(transaction.id))
    const ledgerError = findLedgerError(remaining)
    if (ledgerError) throw new Error(`No se puede borrar: ${ledgerError}.`)

    await deleteItems('/api/transactions', ids)
    setTransactions(remaining)
  }

  // Merged like the PATCH does: a field set to null is removed.
  const updateAsset = async (symbol, changes) => {
    await updateItem('/api/assets', symbol, changes)
    const merge = (asset) =>
      Object.fromEntries(Object.entries({ ...asset, ...changes }).filter(([, value]) => value !== null))
    setCatalog((prev) => prev.map((asset) => (asset.symbol === symbol ? merge(asset) : asset)))
  }

  // Only assets no transaction uses; the endpoint checks it again.
  const deleteAsset = async (symbol) => {
    if (symbolsInUse.has(symbol)) throw new Error(`No se puede borrar ${symbol}: tiene transacciones.`)
    await deleteItems('/api/assets', [symbol])
    setCatalog((prev) => prev.filter((asset) => asset.symbol !== symbol))
  }

  // Replaces the catalog and every transaction with the ones in a backup.
  const restore = async (backup) => {
    await restoreBackup(backup)
    setCatalog(backup.assets)
    setTransactions(backup.transactions)
  }

  return (
    <MoneyContext.Provider value={money}>
      <div className="app">
        <PortfolioHeader totals={totals} dayChange={dayChange} results={results} returns={returns}>
          <LiveStatus cryptoStatus={cryptoStatus} stockStatus={stockStatus} />
          <CurrencyToggle currency={currency} rates={dollar.rates} failed={dollar.failed} onChange={changeCurrency} />
        </PortfolioHeader>

        <section className="charts">
          <HistoryChart
            rangeKey={rangeKey}
            onRangeChange={setRangeKey}
            snapshots={groupHistory.history}
            currentValue={groupValue}
            flows={groupHistory.flows}
            loading={groupHistory.loading}
            estimatedUntil={groupHistory.estimatedUntil}
            scope={groupLabel}
          />
          <AllocationChart assets={groupAssets} scope={groupLabel} />
        </section>

        <AssetsTable
          assets={groupAssets}
          closedPositions={filterByGroup(closedPositions, groupKey)}
          groupKey={groupKey}
          onGroupChange={setGroupKey}
          onAdd={() => setModal({ asset: null, type: 'buy' })}
          onOpenCatalog={() => setCatalogPanel({ editing: null })}
          onOpenBackup={() => setBackupOpen(true)}
          onSelect={setSelectedSymbol}
        />

        {/* The modal and the catalog replace the detail while open; the detail comes back when they close. */}
        {selectedAsset && !modal && !catalogPanel && selectedAsset.type === 'cash' && (
          <CashDetail
            cash={selectedAsset}
            transactions={transactions}
            contributions={contributions}
            onClose={closeDetail}
            onAddMovement={(type) => setModal({ asset: null, type })}
            onEditMovement={startEdit}
            onDeleteOrders={deleteOrders}
          />
        )}

        {selectedAsset && !modal && !catalogPanel && selectedAsset.type !== 'cash' && (
          <AssetDetail
            asset={selectedAsset}
            transactions={selectedTransactions}
            onClose={closeDetail}
            onEditAsset={() => setCatalogPanel({ editing: selectedAsset.symbol })}
            onAddOrder={() => setModal({ asset: selectedAsset, type: 'buy' })}
            onEditOrder={startEdit}
            onDeleteOrders={deleteOrders}
            onChangeColor={(color) => updateAsset(selectedAsset.symbol, { color })}
          />
        )}

        {catalogPanel && (
          <CatalogPanel
            assets={catalog}
            usedSymbols={symbolsInUse}
            initialEditing={catalogPanel.editing}
            onClose={closeCatalog}
            onUpdate={updateAsset}
            onDelete={deleteAsset}
          />
        )}

        {backupOpen && (
          <BackupModal assets={catalog} transactions={transactions} onRestore={restore} onClose={closeBackup} />
        )}

        {modal && (
          <TransactionModal
            assets={pricedCatalog}
            holdings={formHoldings}
            cashBalance={cashBalance}
            initialAsset={modal.asset}
            initialType={modal.type}
            editing={modal.transaction}
            onSubmit={modal.transaction ? editTransaction : addTransaction}
            onClose={closeModal}
          />
        )}
      </div>
    </MoneyContext.Provider>
  )
}
