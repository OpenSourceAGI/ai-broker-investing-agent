import React, { useEffect, useRef, useState } from 'react'
import { BarChart3, TrendingUp, Zap, Terminal, Play, Pause, Square, Settings as SettingsIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { apiClient } from '../api'
import { useWebSocket } from '../hooks/useWebSocket'
import { useDocumentVisible } from '../hooks/useDocumentVisible'

const NAV = [
  { name: 'Dashboard',   href: '/',            icon: <BarChart3  className="w-4 h-4" /> },
  { name: 'AI Analysis', href: '/positions',   icon: <TrendingUp className="w-4 h-4" /> },
  { name: 'Performance & History', href: '/performance', icon: <Zap className="w-4 h-4" /> },
  { name: 'Logs',        href: '/logs',        icon: <Terminal   className="w-4 h-4" /> },
  { name: 'Settings',    href: '/settings',    icon: <SettingsIcon className="w-4 h-4" /> },
]

export const Header: React.FC = () => {
  const location = useLocation()
  const [connected, setConnected]     = useState(false)
  const [botState, setBotState]       = useState<'play' | 'pause' | 'stop'>('stop')
  const [botLoading, setBotLoading]   = useState(false)
  const [mode, setMode]               = useState<'paper' | 'live'>('paper')
  const [modeLoading, setModeLoading] = useState(false)
  const docVisible = useDocumentVisible()
  const prevVisibleRef = useRef(docVisible)

  const { data: wsData } = useWebSocket('ws://localhost:8000/ws')

  useEffect(() => {
    if (!wsData) return
    if (wsData.type === 'bot_state') {
      const d = wsData.data as { state?: string } | undefined
      if (d?.state) setBotState(d.state as 'play' | 'pause' | 'stop')
    }
    if (wsData.type === 'mode_changed') {
      const d = wsData.data as { mode?: string } | undefined
      setMode(d?.mode === 'live' ? 'live' : 'paper')
    }
  }, [wsData])

  const refresh = async () => {
    if (!docVisible) return
    try {
      const [health, bot] = await Promise.all([apiClient.getHealth(), apiClient.getBotState()])
      setConnected(true)
      setMode(health.mode === 'live' ? 'live' : 'paper')
      setBotState(bot.state ?? 'stop')
    } catch {
      setConnected(false)
    }
  }

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 15_000)
    return () => clearInterval(id)
  }, [docVisible])

  // When returning to a foreground tab, refresh immediately (interval may have been skipping).
  useEffect(() => {
    const prev = prevVisibleRef.current
    prevVisibleRef.current = docVisible
    if (docVisible && !prev) void refresh()
  }, [docVisible])

  const handleSetState = async (state: 'play' | 'pause' | 'stop') => {
    setBotLoading(true)
    try {
      await apiClient.setBotState(state)
      setBotState(state)
    } finally {
      setBotLoading(false)
    }
  }

  const handleToggleMode = async () => {
    const next = mode === 'paper' ? 'live' : 'paper'
    if (next === 'live') {
      const ok = window.confirm(
        '⚠ Switch to LIVE trading?\n\nReal money will be used for all trades. ' +
        'Ensure your Kalshi API credentials are correct and risk settings are reviewed.',
      )
      if (!ok) return
    }
    setModeLoading(true)
    try {
      const res = await apiClient.setTradingMode(next)
      setMode(next)
      if (res.bot_state === 'stop') setBotState('stop')
    } catch {
      alert('Failed to switch trading mode. Check backend connection.')
    } finally {
      setModeLoading(false)
    }
  }

  return (
    <header className="bg-secondary border-b border-brand-muted/45 sticky top-0 z-50 shadow-lg shadow-black/40 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-4">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <img
                src="/flying-money.png"
                alt="Kalshi Vibe Bot"
                className="w-5 h-5 object-contain"
              />
            </div>
            <span className="font-bold text-white text-sm tracking-tight">
              Kalshi Vibe Bot
            </span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1">
            {NAV.map((link) => {
              const active = location.pathname === link.href
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition ${
                    active
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-white hover:bg-primary/40'
                  }`}
                >
                  {link.icon}
                  {link.name}
                </Link>
              )
            })}
          </nav>

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Live / Paper toggle */}
            <button
              onClick={handleToggleMode}
              disabled={modeLoading || !connected}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition border ${
                mode === 'live'
                  ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                  : 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30'
              } ${(modeLoading || !connected) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {modeLoading ? '…' : mode}
            </button>

            {/* Play / Pause / Stop */}
            <div className="flex gap-0.5 bg-primary/55 rounded-xl p-1 border border-brand-muted/35 shadow-inner shadow-black/40">
              {(['play', 'pause', 'stop'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleSetState(s)}
                  disabled={botLoading || !connected}
                  title={
                    s === 'play'  ? 'Play — scan markets and trade autonomously' :
                    s === 'pause' ? 'Pause — no new positions; exits still run for open trades' :
                                    'Stop — no scanning; automatic stop-loss exits are off'
                  }
                  className={`p-2 rounded-lg transition ${
                    botState === s
                      ? s === 'play'  ? 'bg-emerald-600 text-white'
                      : s === 'pause' ? 'bg-amber-500 text-white'
                                      : 'bg-brand-muted/50 text-white'
                      : 'text-white hover:text-white hover:bg-brand-muted/25'
                  } ${(botLoading || !connected) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {s === 'play'  ? <Play  className="w-3.5 h-3.5" fill={botState === s ? 'currentColor' : 'none'} /> :
                   s === 'pause' ? <Pause className="w-3.5 h-3.5" fill={botState === s ? 'currentColor' : 'none'} /> :
                                   <Square className="w-3.5 h-3.5" fill={botState === s ? 'currentColor' : 'none'} />}
                </button>
              ))}
            </div>

            {/* Backend status */}
            <div className="flex items-center gap-1.5 pl-1">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-xs text-white hidden lg:block">
                {connected ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

        </div>
      </div>
    </header>
  )
}

export default Header
