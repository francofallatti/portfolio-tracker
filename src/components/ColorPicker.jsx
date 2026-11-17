import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ASSET_COLORS } from '../utils/colors.js'

// Gap kept between the menu and the right edge of the window.
const EDGE_MARGIN = 16

// A dot with the current color. Clicking it opens the palette, plus a native
// picker for any other color.
export default function ColorPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const inputRef = useRef(null)
  const isCustom = !ASSET_COLORS.includes(value)

  const choose = (color) => {
    setOpen(false)
    if (color !== value) onChange(color)
  }

  // Outside clicks and Escape close the menu. Escape is caught on its way down,
  // before it reaches the drawer, which would close too.
  useEffect(() => {
    if (!open) return

    const closeOnOutsideClick = (event) => !rootRef.current.contains(event.target) && setOpen(false)
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [open])

  // The menu opens aligned with the dot; if that would overflow the window, it shifts left.
  useLayoutEffect(() => {
    if (!open) return
    const overflow = menuRef.current.getBoundingClientRect().right - (window.innerWidth - EDGE_MARGIN)
    if (overflow > 0) menuRef.current.style.left = `${-overflow}px`
  }, [open])

  // React's onChange fires on every move while dragging inside the native picker;
  // the native change event fires once, when it closes.
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const commit = () => choose(input.value)
    input.addEventListener('change', commit)
    return () => input.removeEventListener('change', commit)
  })

  return (
    <div className="color-picker" ref={rootRef}>
      <button
        type="button"
        className="color-picker__swatch color-picker__trigger"
        style={{ background: value }}
        title="Cambiar color"
        aria-label="Cambiar color"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      />

      {open && (
        <div ref={menuRef} className="color-picker__menu" role="group" aria-label="Colores">
          {ASSET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="color-picker__swatch"
              style={{ background: color }}
              aria-label={color}
              aria-pressed={color === value}
              onClick={() => choose(color)}
            />
          ))}

          {isCustom && <span className="color-picker__swatch is-selected" style={{ background: value }} title={value} />}

          <label className="color-picker__swatch color-picker__custom" title="Otro color">
            <input ref={inputRef} type="color" defaultValue={value} aria-label="Elegir otro color" />
          </label>
        </div>
      )}
    </div>
  )
}
