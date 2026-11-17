import { useEffect, useState } from 'react'

const RESET_DELAY = 3000

// Two-step button for destructive actions: the first click arms it and shows
// `confirmLabel`, a second click within RESET_DELAY runs `onConfirm`.
export default function ConfirmButton({ onConfirm, confirmLabel, ariaLabel, className = '', children }) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), RESET_DELAY)
    return () => clearTimeout(timer)
  }, [armed])

  const handleClick = () => {
    if (!armed) return setArmed(true)
    setArmed(false)
    onConfirm()
  }

  return (
    <button
      type="button"
      className={`${className} ${armed ? 'is-armed' : ''}`}
      aria-label={armed ? confirmLabel : ariaLabel}
      onClick={handleClick}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}
