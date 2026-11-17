// Public market data stream (no API key needed).
const BASE_URL = 'wss://data-stream.binance.vision/stream'
const RECONNECT_DELAY = 3000

export function connectBinanceTickers(symbols, { onQuote, onStatus }) {
  const streams = symbols.map((symbol) => `${symbol.toLowerCase()}usdt@ticker`).join('/')
  let socket
  let retryTimer
  let closed = false

  const connect = () => {
    onStatus('connecting')
    socket = new WebSocket(`${BASE_URL}?streams=${streams}`)

    socket.onopen = () => onStatus('live')

    socket.onmessage = (event) => {
      const { data } = JSON.parse(event.data)
      onQuote(data.s.replace(/USDT$/, ''), {
        price: Number(data.c),
        change24h: Number(data.P),
      })
    }

    socket.onclose = () => {
      if (closed) return
      onStatus('offline')
      retryTimer = setTimeout(connect, RECONNECT_DELAY)
    }
  }

  connect()

  return () => {
    closed = true
    clearTimeout(retryTimer)
    socket?.close()
  }
}
