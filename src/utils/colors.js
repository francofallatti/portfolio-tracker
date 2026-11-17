// Offered by the color picker and assigned to new assets. Light tones, so the
// dark initial on the asset icon stays readable.
export const ASSET_COLORS = [
  '#f87171',
  '#fb923c',
  '#f59e0b',
  '#facc15',
  '#a3e635',
  '#4ade80',
  '#34d399',
  '#2dd4bf',
  '#22d3ee',
  '#38bdf8',
  '#60a5fa',
  '#818cf8',
  '#a78bfa',
  '#c084fc',
  '#e879f9',
  '#f472b6',
  '#fb7185',
]

export const CASH_COLOR = '#a3e635'

// Stable per symbol, skipping colors other assets (or cash) already use while any is free.
export function pickColor(symbol, usedColors = []) {
  const taken = [CASH_COLOR, ...usedColors]
  const start = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0) % ASSET_COLORS.length
  const rotated = [...ASSET_COLORS.slice(start), ...ASSET_COLORS.slice(0, start)]
  return rotated.find((color) => !taken.includes(color)) ?? rotated[0]
}
