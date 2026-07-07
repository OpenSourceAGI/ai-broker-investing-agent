import {
  useWebSocketConnectionContext,
  useWebSocketMessageContext,
  type WebSocketUpdate,
} from '../context/WebSocketProvider'

export type { WebSocketUpdate }

/** Single shared connection (see WebSocketProvider). `url` is ignored; use VITE_WS_URL if needed. */
export const useWebSocket = (url: string) => {
  void url
  const { lastMessage } = useWebSocketMessageContext()
  const { isConnected, error } = useWebSocketConnectionContext()
  return { data: lastMessage, isConnected, error }
}
