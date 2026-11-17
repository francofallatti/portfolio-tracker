import { useEffect, useRef, useState } from 'react'
import { saveItem } from '../services/dataStore.js'
import { buildSnapshot } from '../utils/history.js'

const SNAPSHOT_INTERVAL = 60 * 60 * 1000
const CHECK_INTERVAL = 60 * 1000

// Saves the portfolio value (total and by asset type) to src/data/history.json
// at most once per SNAPSHOT_INTERVAL, only while live quotes are loaded (`ready`).
export function useSnapshots(initialSnapshots, assets, ready) {
  const [snapshots, setSnapshots] = useState(initialSnapshots)
  const latest = useRef({ assets, snapshots })
  const saving = useRef(false)

  latest.current = { assets, snapshots }

  useEffect(() => {
    if (!ready) return

    const check = async () => {
      const lastSnapshot = latest.current.snapshots.at(-1)
      const isDue = !lastSnapshot || Date.now() - Date.parse(lastSnapshot.timestamp) >= SNAPSHOT_INTERVAL
      if (!isDue || saving.current) return

      saving.current = true
      const snapshot = buildSnapshot(latest.current.assets, new Date().toISOString())
      try {
        await saveItem('/api/history', snapshot)
        setSnapshots((prev) => [...prev, snapshot])
      } catch {
        // Without the dev server there is nowhere to save; retry on the next check.
      } finally {
        saving.current = false
      }
    }

    check()
    const timer = setInterval(check, CHECK_INTERVAL)
    return () => clearInterval(timer)
  }, [ready])

  return snapshots
}
