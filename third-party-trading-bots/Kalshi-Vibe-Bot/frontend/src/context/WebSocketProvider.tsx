import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws'

export interface WebSocketUpdate {
  type: string
  /** Parsed JSON payload from the backend (shape varies by `type`). */
  data?: unknown
}

type Subscriber = (message: WebSocketUpdate) => void

type MessageContextValue = {
  lastMessage: WebSocketUpdate | null
}

type ConnectionContextValue = {
  isConnected: boolean
  error: string | null
  subscribe: (fn: Subscriber) => () => void
}

const MessageContext = createContext<MessageContextValue | null>(null)
const ConnectionContext = createContext<ConnectionContextValue | null>(null)

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [lastMessage, setLastMessage] = useState<WebSocketUpdate | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const subscribersRef = useRef<Set<Subscriber>>(new Set())

  const subscribe = useCallback((fn: Subscriber) => {
    subscribersRef.current.add(fn)
    return () => {
      subscribersRef.current.delete(fn)
    }
  }, [])

  useEffect(() => {
    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      setIsConnected(true)
      setError(null)
    }

    ws.onerror = () => {
      setError('WebSocket error')
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketUpdate
        setLastMessage(message)
        subscribersRef.current.forEach((fn) => {
          try {
            fn(message)
          } catch (e) {
            console.error('WebSocket subscriber error:', e)
          }
        })
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    }

    return () => {
      ws.close()
    }
  }, [])

  const messageValue = useMemo(() => ({ lastMessage }), [lastMessage])

  const connectionValue = useMemo(
    () => ({ isConnected, error, subscribe }),
    [isConnected, error, subscribe],
  )

  return (
    <ConnectionContext.Provider value={connectionValue}>
      <MessageContext.Provider value={messageValue}>{children}</MessageContext.Provider>
    </ConnectionContext.Provider>
  )
}

export function useWebSocketMessageContext(): MessageContextValue {
  const ctx = useContext(MessageContext)
  if (!ctx) throw new Error('WebSocketProvider is missing (message context)')
  return ctx
}

export function useWebSocketConnectionContext(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext)
  if (!ctx) throw new Error('WebSocketProvider is missing (connection context)')
  return ctx
}
