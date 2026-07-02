import React, { useCallback, useEffect, useState } from 'react'
import { RotateCcw, RefreshCw, Save } from 'lucide-react'
import { apiClient, AiProvider, HealthResponse, TuningSnapshot } from '../api'
import { useWebSocket } from '../hooks/useWebSocket'

export const Settings: React.FC = () => {
  const [cur, setCur] = useState<TuningSnapshot | null>(null)
  const [minEdgeDraft, setMinEdgeDraft] = useState('')
  const [stopLossDraft, setStopLossDraft] = useState('')
  const [minAiWinDraft, setMinAiWinDraft] = useState('')
  const [maxOpenPositionsDraft, setMaxOpenPositionsDraft] = useState('')
  const [savingStrategy, setSavingStrategy] = useState(false)
  const [resettingConfigDefaults, setResettingConfigDefaults] = useState(false)
  const [toggleSavingStopLoss, setToggleSavingStopLoss] = useState(false)
  const [savingAiProvider, setSavingAiProvider] = useState(false)
  const [resettingHistory, setResettingHistory] = useState(false)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [kalshiReconciling, setKalshiReconciling] = useState(false)
  const [kalshiReconcileMsg, setKalshiReconcileMsg] = useState<string | null>(null)

  const { data: wsData } = useWebSocket('')

  const load = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([apiClient.getTuningState(), apiClient.getHealth()])
      setCur(c)
      setHealth(h)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!cur) return
    setMinEdgeDraft(String(Math.round(Number(cur.min_edge_to_buy_pct ?? 5))))
    setStopLossDraft(String(Math.round(Number(cur.stop_loss_drawdown_pct ?? 0.8) * 100)))
    setMinAiWinDraft(String(Math.round(Number(cur.min_ai_win_prob_buy_side_pct ?? 60))))
    setMaxOpenPositionsDraft(String(Math.round(Number(cur.max_open_positions ?? 30))))
  }, [cur])

  useEffect(() => {
    if (!wsData) return
    if (wsData.type === 'tuning_update') {
      const patch = wsData.data
      if (!patch || typeof patch !== 'object') return
      setCur((p) =>
        p ? { ...p, ...(patch as Partial<TuningSnapshot>) } : (patch as TuningSnapshot),
      )
    }
  }, [wsData])

  const saveStrategyKnobs = async () => {
    const me = Number(minEdgeDraft)
    const sl = Number(stopLossDraft)
    const ma = Number(minAiWinDraft)
    const mx = Number(maxOpenPositionsDraft)
    if (!Number.isFinite(me) || !Number.isFinite(sl) || !Number.isFinite(ma) || !Number.isFinite(mx)) {
      alert(
        'Enter whole numbers for minimum edge, stop-loss drawdown, min AI win % on the buy side, and max open positions.',
      )
      return
    }
    const mxI = Math.round(mx)
    if (mxI < 1 || mxI > 500) {
      alert('Max open positions must be between 1 and 500.')
      return
    }
    setSavingStrategy(true)
    try {
      const next = await apiClient.saveStrategyKnobs({
        min_edge_to_buy_pct: Math.round(me),
        stop_loss_drawdown_pct: sl / 100,
        min_ai_win_prob_buy_side_pct: Math.round(ma),
        max_open_positions: mxI,
      })
      setCur(next)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null
      alert(typeof msg === 'string' ? msg : 'Failed to save strategy settings.')
    } finally {
      setSavingStrategy(false)
    }
  }

  const runKalshiReconcile = async () => {
    if ((health?.mode ?? '').toLowerCase() !== 'live') return
    setKalshiReconciling(true)
    setKalshiReconcileMsg(null)
    try {
      const r = await apiClient.reconcileKalshiPortfolio()
      setKalshiReconcileMsg(
        `Open field updates: ${r.open_updates} · New opens imported from Kalshi: ${r.open_positions_imported} · ` +
          `Buy-order entry refreshes: ${r.open_entry_order_refreshes ?? 0} · Unrealized/mark refreshes: ${r.open_unrealized_refreshes ?? 0} · ` +
          `Portfolio settlement closes: ${r.settlement_portfolio_closes} · Settlement API closes: ${r.settlement_history_closes} · ` +
          `Flat-row reconciliations: ${r.flat_row_reconciliations} · ` +
          `Closure finalizations: ${r.closure_finalizations ?? 0}`,
      )
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail : null
      setKalshiReconcileMsg(typeof msg === 'string' ? msg : 'Reconcile failed (check backend logs).')
    } finally {
      setKalshiReconciling(false)
    }
  }

  const persistAiProvider = async (provider: AiProvider) => {
    if (!cur || cur.ai_provider === provider) return
    setSavingAiProvider(true)
    try {
      const next = await apiClient.setAiProvider(provider)
      setCur(next)
    } catch (e) {
      console.error('AI provider update error:', e)
      alert('Failed to update AI provider.')
    } finally {
      setSavingAiProvider(false)
    }
  }

  const persistStopLossToggle = async (enabled: boolean) => {
    if (!cur) return
    setToggleSavingStopLoss(true)
    try {
      const next = await apiClient.setStopLossSellingEnabled(enabled)
      setCur(next)
    } catch (e) {
      console.error('Stop-loss toggle error:', e)
      alert('Failed to update stop-loss setting.')
    } finally {
      setToggleSavingStopLoss(false)
    }
  }

  const restoreConfigurationDefaults = async () => {
    if (!cur) return
    const ok = window.confirm(
      'Restore strategy settings from your configuration file (.env) and built-in defaults?\n\n' +
        'The running bot picks these up immediately.',
    )
    if (!ok) return
    setResettingConfigDefaults(true)
    try {
      const next = await apiClient.resetTuningToConfigDefaults()
      setCur(next)
    } catch (e) {
      console.error('Restore configuration defaults error:', e)
      alert('Failed to restore defaults.')
    } finally {
      setResettingConfigDefaults(false)
    }
  }

  const resetHistory = async () => {
    const ok = window.confirm(
      'Reset history?\n\nThis deletes ALL closed positions and resets realized P&L + closed-position stats. ' +
        'Open positions and unrealized P&L are NOT affected.\n\nStrategy settings are also reset to configuration defaults.',
    )
    if (!ok) return
    setResettingHistory(true)
    try {
      await apiClient.resetHistory()
      await load()
    } catch (e) {
      console.error('Reset history error:', e)
      alert('Failed to reset history.')
    } finally {
      setResettingHistory(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-white mt-1 text-sm">Strategy knobs, Kalshi reconcile, and history tools</p>
      </div>

      <section className="ui-surface-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">Reconcile with Kalshi</h2>
            <p className="text-xs text-white mt-2 max-w-2xl">
              Runs the same one-shot sync as the bot and positions API: portfolio positions, settlement reconciliation,
              and flat-row alignment for closed rows.
            </p>
            {(health?.mode ?? '').toLowerCase() !== 'live' && (
              <p className="text-xs text-amber-400/90 mt-2">Switch to live trading mode to use this action.</p>
            )}
            {kalshiReconcileMsg && (
              <p className={`text-xs mt-2 ${kalshiReconcileMsg.includes('failed') ? 'text-red-400' : 'text-white'}`}>
                {kalshiReconcileMsg}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void runKalshiReconcile()}
            disabled={(health?.mode ?? '').toLowerCase() !== 'live' || kalshiReconciling}
            className={`shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition ${
              (health?.mode ?? '').toLowerCase() === 'live' && !kalshiReconciling
                ? 'bg-cyan-600/20 text-cyan-200 border-cyan-500/40 hover:bg-cyan-600/30'
                : 'bg-brand-muted/12 text-white border-brand-muted/30 cursor-not-allowed'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${kalshiReconciling ? 'animate-spin' : ''}`} aria-hidden />
            {kalshiReconciling ? 'Reconciling…' : 'Reconcile now'}
          </button>
        </div>
      </section>

      <section className="ui-surface-sm p-5 space-y-4">
        <h2 className="text-base font-semibold text-white">AI market analysis</h2>
        <p className="text-xs text-white/90 max-w-3xl">
          Choose which model analyzes incoming markets. Changes apply immediately to the running bot (no restart).
          Both providers bill your API account — set <code className="text-cyan-200/90">GEMINI_API_KEY</code> or{' '}
          <code className="text-cyan-200/90">XAI_API_KEY</code> in <code className="text-cyan-200/90">backend/.env</code>.
          When xAI is selected, optional Management API keys can show prepaid balance on the portfolio tile; Gemini has
          no balance API in this app (check billing in Google AI Studio).
        </p>
        {!cur ? (
          <p className="text-sm text-white">Loading…</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {(
              [
                {
                  id: 'gemini' as const,
                  label: 'Gemini (default)',
                  hint: `${cur.gemini_model ?? 'gemini-2.5-flash'} · GEMINI_API_KEY`,
                },
                {
                  id: 'xai' as const,
                  label: 'xAI (Grok)',
                  hint: `${cur.xai_model ?? 'grok-3'} · XAI_API_KEY`,
                },
              ] as const
            ).map((opt) => {
              const selected = (cur.ai_provider ?? 'gemini') === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={savingAiProvider}
                  onClick={() => void persistAiProvider(opt.id)}
                  className={`text-left px-4 py-3 rounded-lg border transition min-w-[10rem] ${
                    selected
                      ? 'bg-sky-600/20 text-sky-100 border-sky-500/45 ring-1 ring-sky-500/30'
                      : 'bg-primary/40 text-white border-brand-muted/30 hover:border-brand-muted/50'
                  } ${savingAiProvider ? 'opacity-60' : ''}`}
                >
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="text-[11px] text-white/65 mt-0.5">{opt.hint}</p>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="ui-surface-sm p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Trading strategy</h2>
          <p className="text-xs text-white/90">
            Position size uses <strong className="text-white">full Kelly</strong> from the active model&apos;s P(YES) and executable
            asks, capped by deployable cash and an automatic <strong className="text-white">5% of deployable cash</strong> maximum premium per entry.
            Buys require your minimum edge and AI win % on the purchased side, plus built-in guardrails you do not configure:
            edge capped at <strong className="text-white">22 pts</strong>, AI win % capped at <strong className="text-white">90%</strong> (stricter on mid-priced picks),
            no entries below <strong className="text-white">26¢</strong>, and a calibration block on mid-priced “very confident” picks.
            Sports markets use a higher volume floor at scan time and +5 minutes exit grace. Stop-loss compares{' '}
            <strong className="text-white">entry price</strong> to <strong className="text-white">Est. Value</strong> per contract after grace
            (sports get +5 minutes). Contrarian longshots still get a fixed stricter edge and AI floor in code.
          </p>
          <p className="text-xs text-amber-200/90 border border-amber-500/25 rounded-lg px-3 py-2 bg-amber-500/10">
            Numbers here are stored in the <strong className="text-white">database</strong> (per paper/live), not read
            live from <code className="text-cyan-200/90">backend/.env</code>. After editing <code className="text-cyan-200/90">.env</code>, use{' '}
            <strong className="text-white">Restore configuration defaults</strong> below so SQLite matches your file (e.g.{' '}
            <code className="text-cyan-200/90">STOP_LOSS_DRAWDOWN_PCT=0.80</code> → <strong className="text-white">80</strong> in this field), or type{' '}
            <strong className="text-white">85</strong> and <strong className="text-white">Save strategy settings</strong>.
          </p>

          {!cur ? (
            <p className="text-sm text-white">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
                <label className="flex min-h-0 flex-col gap-1">
                  <span className="block min-h-[3rem] text-xs leading-snug text-white/80">
                    Minimum edge to buy (percentage points)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={minEdgeDraft}
                    onChange={(e) => setMinEdgeDraft(e.target.value)}
                    className="w-full bg-primary/50 border border-brand-muted/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </label>
                <label className="flex min-h-0 flex-col gap-1">
                  <span className="block min-h-[3rem] text-xs leading-snug text-white/80">
                    Min AI win % on buy side (51–99)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={minAiWinDraft}
                    onChange={(e) => setMinAiWinDraft(e.target.value)}
                    className="w-full bg-primary/50 border border-brand-muted/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </label>
                <label className="flex min-h-0 flex-col gap-1">
                  <span className="block min-h-[3rem] text-xs leading-snug text-white/80">
                    Stop-loss drawdown (% below entry vs Est. Value)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={stopLossDraft}
                    onChange={(e) => setStopLossDraft(e.target.value)}
                    className="w-full bg-primary/50 border border-brand-muted/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </label>
                <label className="flex min-h-0 flex-col gap-1">
                  <span className="block min-h-[3rem] text-xs leading-snug text-white/80">
                    Max open positions (1–500)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={maxOpenPositionsDraft}
                    onChange={(e) => setMaxOpenPositionsDraft(e.target.value)}
                    className="w-full bg-primary/50 border border-brand-muted/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={savingStrategy}
                onClick={() => void saveStrategyKnobs()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border bg-blue-600/20 text-blue-100 border-blue-500/35 hover:bg-blue-600/30 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingStrategy ? 'Saving…' : 'Save strategy settings'}
              </button>
              <p className="text-[11px] text-white/70">
                Saved values apply immediately to the running bot. To match <code className="text-cyan-200/90">backend/.env</code> defaults
                (including <code className="text-cyan-200/90">BOT_MAX_OPEN_POSITIONS</code>,{' '}
                <code className="text-cyan-200/90">STOP_LOSS_DRAWDOWN_PCT</code>, or <code className="text-cyan-200/90">MIN_AI_WIN_PROB_BUY_SIDE_PCT</code>), use{' '}
                <strong className="text-white">Restore configuration defaults</strong> — editing the file alone does not overwrite what is already in the database.
              </p>

              <div className="pt-3 border-t border-brand-muted/25 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Stop-loss auto sells</p>
                  <p className="text-xs text-white/80 mt-0.5">
                    When enabled, the bot can exit when Est. Value has fallen far enough below your entry price (manual sells always work).
                  </p>
                </div>
                <button
                  type="button"
                  disabled={toggleSavingStopLoss}
                  onClick={() => void persistStopLossToggle(!(cur.stop_loss_selling_enabled === true))}
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                    cur.stop_loss_selling_enabled === true
                      ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/35'
                      : 'bg-brand-muted/18 text-white border-brand-muted/35'
                  } ${toggleSavingStopLoss ? 'opacity-50' : ''}`}
                >
                  {toggleSavingStopLoss ? 'Saving…' : cur.stop_loss_selling_enabled === true ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <button
                type="button"
                disabled={resettingConfigDefaults}
                onClick={() => void restoreConfigurationDefaults()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border bg-sky-500/15 text-sky-200 border-sky-500/35 hover:bg-sky-500/25 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${resettingConfigDefaults ? 'animate-spin' : ''}`} />
                {resettingConfigDefaults ? 'Restoring…' : 'Restore configuration defaults'}
              </button>
            </>
          )}
        </div>

        <div className="ui-surface-sm p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">History</h2>
          <p className="text-xs text-white/90">
            Deletes all closed positions for this mode. Open legs are untouched. Strategy settings reset to config
            defaults.
          </p>
          <button
            type="button"
            disabled={resettingHistory}
            onClick={() => void resetHistory()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/20 disabled:opacity-50"
          >
            <RotateCcw className={`w-4 h-4 ${resettingHistory ? 'animate-spin' : ''}`} />
            {resettingHistory ? 'Resetting…' : 'Reset closed-position history'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="w-full px-4 py-2.5 bg-secondary hover:bg-brand-muted/30 border border-brand-muted/25 text-white rounded-lg text-sm"
          >
            Refresh settings
          </button>
        </div>
      </section>
    </div>
  )
}

export default Settings
