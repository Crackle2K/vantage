import { logger } from './logger'

type RealtimeTable = 'activity_feed' | 'activity_comments' | 'owner_events'
type RealtimeType = 'INSERT' | 'UPDATE' | 'DELETE'

export type RealtimePostgresChange<T> = {
  type: RealtimeType
  table: RealtimeTable
  record: T | null
  old_record: Partial<T> | null
}

type SubscribeOptions<T> = {
  table: RealtimeTable
  filter?: string
  onChange: (change: RealtimePostgresChange<T>) => void
}

type PhoenixMessage = {
  topic: string
  event: string
  payload?: {
    data?: {
      type?: string
      table?: string
      record?: unknown
      old_record?: unknown
    }
  } & Record<string, unknown>
  ref?: string
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
const HEARTBEAT_MS = 25_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const RECONNECT_MAX_ATTEMPTS = 10

export function realtimeConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && typeof WebSocket !== 'undefined')
}

export function subscribeToTable<T>({
  table,
  filter,
  onChange,
}: SubscribeOptions<T>): { unsubscribe: () => void } {
  if (!realtimeConfigured()) {
    return { unsubscribe: () => {} }
  }

  let socket: WebSocket | null = null
  let heartbeatId: number | undefined
  let reconnectId: number | undefined
  let closed = false
  let ref = 0
  let reconnectAttempts = 0

  const nextRef = () => String(++ref)
  const topic = `realtime:public:${table}`

  const send = (event: string, payload: Record<string, unknown>, targetTopic = topic) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ topic: targetTopic, event, payload, ref: nextRef() }))
    }
  }

  const clearTimers = () => {
    if (heartbeatId) window.clearInterval(heartbeatId)
    if (reconnectId) window.clearTimeout(reconnectId)
    heartbeatId = undefined
    reconnectId = undefined
  }

  const scheduleReconnect = () => {
    if (closed || reconnectId || reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) return
    const jitter = Math.random() * 1_000
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts + jitter, RECONNECT_MAX_MS)
    reconnectAttempts++
    reconnectId = window.setTimeout(() => {
      reconnectId = undefined
      connect()
    }, delay)
  }

  const connect = () => {
    clearTimers()
    const url = realtimeWebsocketUrl()
    if (!url) return

    socket = new WebSocket(url)
    socket.onopen = () => {
      reconnectAttempts = 0
      send('phx_join', {
        config: {
          postgres_changes: [
            {
              event: '*',
              schema: 'public',
              table,
              ...(filter ? { filter } : {}),
            },
          ],
          broadcast: { self: false },
          presence: { key: '' },
        },
      })
      heartbeatId = window.setInterval(() => {
        send('heartbeat', {}, 'phoenix')
      }, HEARTBEAT_MS)
    }

    socket.onmessage = (event) => {
      handleMessage<T>(event.data, table, onChange)
    }

    socket.onerror = (event) => {
      logger.warn('Supabase realtime socket error', { table, event })
    }

    socket.onclose = () => {
      clearTimers()
      socket = null
      scheduleReconnect()
    }
  }

  connect()

  return {
    unsubscribe: () => {
      closed = true
      clearTimers()
      if (socket?.readyState === WebSocket.OPEN) {
        send('phx_leave', {})
      }
      socket?.close()
      socket = null
    },
  }
}

function realtimeWebsocketUrl(): string | null {
  try {
    const url = new URL(SUPABASE_URL)
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
    url.pathname = '/realtime/v1/websocket'
    url.search = new URLSearchParams({
      apikey: SUPABASE_ANON_KEY,
      vsn: '1.0.0',
    }).toString()
    return url.toString()
  } catch {
    return null
  }
}

function handleMessage<T>(
  raw: string,
  expectedTable: RealtimeTable,
  onChange: (change: RealtimePostgresChange<T>) => void
) {
  let message: PhoenixMessage
  try {
    message = JSON.parse(raw) as PhoenixMessage
  } catch {
    return
  }

  if (message.event !== 'postgres_changes') return

  const data = message.payload?.data
  if (!data || data.table !== expectedTable) return
  if (data.type !== 'INSERT' && data.type !== 'UPDATE' && data.type !== 'DELETE') return

  onChange({
    type: data.type,
    table: expectedTable,
    record: (data.record ?? null) as T | null,
    old_record: (data.old_record ?? null) as Partial<T> | null,
  })
}
