import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Terminal, Trash2 } from 'lucide-react'
import { apiClient } from '../api'
import { useWebSocketConnectionContext } from '../context/WebSocketProvider'

interface LogEntry {
  timestamp: string
  level: string
  name: string
  message: string
}

const levelStyle = (level: string): string => {
  switch (level) {
    case 'ERROR':
      return 'text-red-400'
    case 'WARNING':
      return 'text-yellow-400'
    case 'INFO':
      return 'text-green-400'
    case 'DEBUG':
      return 'text-white'
    default:
      return 'text-white'
  }
}

export const Logs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const parentRef = useRef<HTMLDivElement>(null)
  const { isConnected, error, subscribe } = useWebSocketConnectionContext()

  const levelCounts = useMemo(() => {
    const c = { ERROR: 0, WARNING: 0, INFO: 0, DEBUG: 0 }
    for (const l of logs) {
      if (l.level in c) c[l.level as keyof typeof c]++
    }
    return c
  }, [logs])

  useEffect(() => {
    apiClient.getLogs(200).then((entries) => setLogs(entries)).catch(() => {})
  }, [])

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'log' && msg.data && typeof msg.data === 'object' && !Array.isArray(msg.data)) {
        setLogs((prev) => {
          const next = [...prev, msg.data as LogEntry]
          return next.length > 500 ? next.slice(-500) : next
        })
      }
    })
  }, [subscribe])

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 12,
  })

  useLayoutEffect(() => {
    if (!autoScroll || logs.length === 0) return
    virtualizer.scrollToIndex(logs.length - 1, { align: 'end', behavior: 'smooth' })
  }, [logs.length, autoScroll, virtualizer])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white">Backend Logs</h1>
          <p className="text-white mt-2">Real-time log stream from the trading bot</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-blue-500"
            />
            Auto-scroll
          </label>
          <button
            onClick={() => setLogs([])}
            className="flex items-center gap-2 rounded-lg border border-brand-muted/40 bg-secondary px-3 py-1.5 text-sm text-white shadow-md shadow-black/25 transition hover:bg-brand-muted/25"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-white">
              {isConnected ? 'Connected' : error ?? 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-4 text-sm">
        {(['ERROR', 'WARNING', 'INFO', 'DEBUG'] as const).map((lvl) => (
          <span key={lvl} className={`${levelStyle(lvl)}`}>
            {lvl}: {levelCounts[lvl]}
          </span>
        ))}
        <span className="text-white ml-auto">{logs.length} entries</span>
      </div>

      <div
        ref={parentRef}
        className="ui-surface h-[65vh] overflow-y-auto p-4 font-mono text-xs shadow-inner shadow-black/50"
      >
        {logs.length === 0 ? (
          <div className="flex items-center gap-2 text-white py-4">
            <Terminal className="w-4 h-4" />
            <span>No log entries yet — start the bot to see output here.</span>
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const entry = logs[virtualRow.index]
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className={`absolute left-0 top-0 flex w-full gap-2 rounded px-1 py-0.5 leading-5 transition-colors hover:brightness-[1.05] ${
                    virtualRow.index % 2 === 0 ? 'bg-secondary' : 'bg-stripe'
                  }`}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <span className="text-white shrink-0 w-40">{entry.timestamp}</span>
                  <span className={`shrink-0 w-16 font-semibold ${levelStyle(entry.level)}`}>
                    {entry.level}
                  </span>
                  <span className="text-white shrink-0 w-28 truncate" title={entry.name}>
                    {entry.name}
                  </span>
                  <span className="text-white break-all">{entry.message}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Logs
