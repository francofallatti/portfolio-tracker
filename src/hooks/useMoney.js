import { createContext, useContext, useEffect, useState } from 'react'
import { fetchDollarRates } from '../services/dolarApi.js'
import { moneyFormatters } from '../utils/format.js'

const REFRESH_INTERVAL = 10 * 60 * 1000

// The formatters for the display currency (moneyFormatters). App provides them;
// without a provider, amounts show in dollars.
export const MoneyContext = createContext(moneyFormatters(null))

export const useMoney = () => useContext(MoneyContext)

// The MEP and CCL dollars (`{ mep, ccl, updatedAt }`, fetchDollarRates), or null until
// they load or if they fail. Fetched only while `enabled`, and refreshed every 10 minutes.
export function useDollarRates(enabled) {
  const [rates, setRates] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const load = async () => {
      try {
        const latest = await fetchDollarRates()
        if (cancelled) return
        setRates(latest)
        setFailed(false)
      } catch {
        // Keeps the last rates, if there were any.
        if (!cancelled) setFailed(true)
      }
    }

    load()
    const timer = setInterval(load, REFRESH_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled])

  // Loading: wanted, not here yet and not failed.
  return { rates, failed, loading: enabled && !rates && !failed }
}
