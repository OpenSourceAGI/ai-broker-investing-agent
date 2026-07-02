import axios from 'axios'

/** Override in `.env` as `VITE_API_BASE_URL=http://host:port` when the UI is not on localhost:3000. */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface KalshiRestingOrderPreview {
  order_id?: string
  ticker?: string
  action?: string
  side?: string
  type?: string
  remaining_count_fp?: string
  yes_price_dollars?: string
  no_price_dollars?: string
}

export interface Portfolio {
  balance: number
  /** Total uninvested cash before vault is applied (USD). */
  uninvested_cash?: number
  /** Cash reserved (locked) away from trading (USD). */
  vault_balance?: number
  positions: number
  invested_amount: number
  /** Sum of closed ``Position.realized_pnl`` (not raw sell ledger rows). */
  realized_pnl: number
  /** Closed realized + open unrealized (position accounting). */
  total_pnl: number
  /** Open legs only — uses Kalshi YES last trade when available (dashboard display). */
  unrealized_pnl: number
  total_value: number
  timestamp: string
  /** xAI prepaid remaining this billing cycle (USD); server uses Management API invoice preview. */
  xai_prepaid_balance_usd?: number | null
  kalshi_resting_order_count?: number
  resting_buy_collateral_estimate_usd?: number
  kalshi_resting_orders_preview?: KalshiRestingOrderPreview[]
  /** Active AI provider for market analysis (``gemini`` | ``xai``). */
  ai_provider?: AiProvider
  /** True when the bot would fetch markets and run AI analysis this tick (Play + gates in scan_eligibility). */
  order_search_active?: boolean
  /** Short status for the dashboard scan indicator. */
  order_search_label?: string
  /** False disables bot stop-loss exits; manual sells still allowed. */
  stop_loss_selling_enabled?: boolean
}

export interface VaultTransferResponse {
  balance: number
  uninvested_cash: number
  vault_balance: number
}

export interface Position {
  id: string
  market_id: string
  market_title: string
  side: string
  quantity: number
  entry_price: number
  /** Total cost basis in dollars (Kalshi source-of-truth in live mode). */
  entry_cost?: number
  /** Best bid on held side — liquidation mark (matches ``current_price`` when refreshed). */
  bid_price?: number | null
  /** Kalshi YES ``last_price_dollars`` (NO → 1−YES); display P&L uses this when Kalshi sends a last trade. */
  estimated_price?: number | null
  current_price: number
  /** Display unrealized P&L; ``null`` → Outcome Pending (post-close, resolution unknown). */
  unrealized_pnl?: number | null
  /** Post-close: Kalshi ``status`` is ``closed`` (trading stopped) and yes/no not yet available for display. */
  resolution_outcome_pending?: boolean
  /** Post-close: outcome yes/no known and Kalshi ``determined`` (settlement pending per API). */
  resolution_awaiting_payout?: boolean
  /** Post-close: Kalshi ``finalized`` / ``settled`` — exchange reports payouts complete (local row may still be open until reconcile). */
  resolution_kalshi_payout_complete?: boolean
  /** Live: cumulative fees from Kalshi portfolio API for this market position. */
  fees_paid?: number
  opened_at: string
  close_time?: string
  /** Kalshi expected event/market end — dashboard "Ends" prefers this over contractual ``close_time``. */
  expected_expiration_time?: string | null
  /** Server-computed ISO for the Ends column (mirrors ``position_display_ends_iso``). */
  ends_at?: string | null
  /** Option C: provisional peg passed — Ends shows contractual ``close_time`` (UI may show an amber hint). */
  ends_at_contract_fallback?: boolean
  awaiting_settlement?: boolean
  /** Live: no native bids on last exit check; dashboard shows Dead Market. */
  dead_market?: boolean
  /** Open cash basis (notional + buy-side fees) — same total used for stop-loss vs Est. Value. */
  cash_basis?: number
  /** Kalshi GET /markets ``status`` (e.g. active, closed, determined, finalized). */
  kalshi_market_status?: string | null
  /** Contract resolution ``yes`` / ``no`` (Kalshi ``result`` / inferred settlement) when known. */
  kalshi_market_result?: string | null
  /** Audit: fractional threshold stored at open (may differ from current policy). */
  stop_loss_drawdown_pct_at_entry?: number | null
  /** Current stop-loss drawdown fraction used by bot + dashboard (Settings / tuning / .env). */
  stop_loss_drawdown_effective?: number
  /** Minutes after open before auto stop-loss applies — matches bot ``EXIT_GRACE_MINUTES``. */
  exit_grace_minutes?: number
  /** ``DecisionLog.id`` for the bot gate that opened this leg (entry-time AI snapshot). */
  entry_decision_log_id?: string | null
  /** Full serialized decision row for this leg when ``entry_decision_log_id`` resolves. */
  entry_analysis?: DecisionAnalysis | null
}

export interface ClosedPosition {
  id: string
  market_id: string
  market_title: string
  side: string
  /** Whole contracts (Kalshi ``count``); bot never records fractional lots. */
  quantity: number
  entry_price: number
  /** Contract notional at open (excl. fees); invested $ = open_cash_basis(entry_cost, entry_price, qty, fees_paid). */
  entry_cost?: number
  /** Avg exit $/contract (gross, Kalshi VWAP on the sell leg). */
  exit_price: number
  /** Buy + sell (and settlement) fees on this leg — same field as open rows, summed for the round trip. */
  fees_paid?: number
  realized_pnl: number
  opened_at: string | null
  closed_at: string | null
  exit_reason?: string | null
  /** Kalshi official outcome (`yes` / `no`) when known; omit or null if unknown yet. */
  kalshi_market_result?: 'yes' | 'no' | null
  /** Last seen Kalshi GET /markets ``status`` for this close row (e.g. finalized). */
  kalshi_market_status?: string | null
  /** True when ``kalshi_market_result`` is not yet a canonical yes/no (backfill or API lag). */
  kalshi_outcome_pending?: boolean
  /** ``DecisionLog.id`` for the gate that opened this closed leg. */
  entry_decision_log_id?: string | null
  /** Serialized decision row for this close row when ``entry_decision_log_id`` resolves. */
  entry_analysis?: DecisionAnalysis | null
}

export interface XAIAnalysis {
  provider: string
  model: string
  decision: string
  confidence?: number
  yes_confidence?: number
  no_confidence?: number
  ai_probability_yes_pct?: number
  reasoning: string
  real_time_context: string
  key_factors: string[]
  edge?: number
  error?: string
  /** One model call compared sibling Kalshi markets under the same event. */
  event_batch?: boolean
  event_ticker?: string
  event_leg_count?: number
  /** Market ids included in that batch AI call (partition-aware cooldown). */
  event_batch_market_ids?: string[]
  /** When legs are mutually exclusive (e.g. 1X2), model P(YES) per market_id (sums ~100%). */
  outcome_probability_pct_by_market_id?: Record<string, number>
}

export type AnalysisActionTaken =
  | { status: 'skipped'; summary?: string; reason?: string }
  | { status: 'no_trade'; summary?: string; reason?: string; signal?: string }
  | { status: 'executed'; side: string; quantity: number; price: number; cost: number; at: string }

export interface DecisionAnalysis {
  decision_id: string
  /** Present when logged after this feature; matches paper/live trading mode. */
  trade_mode?: 'paper' | 'live'
  decision: 'BUY_YES' | 'BUY_NO' | 'SKIP'
  confidence: number
  /** AI subjective P(YES) at settlement, 0–100. */
  ai_probability_yes_pct?: number
  /** Market-implied probability (%) for the buy side at analysis time (executable ask). */
  market_implied_probability_pct?: number
  /** Edge in percentage points (AI side prob minus market-implied). */
  edge_pct?: number
  /** Full Kelly contract count at analysis time and deployable cash snapshot. */
  kelly_contracts?: number
  yes_confidence: number
  no_confidence: number
  reasoning: string
  real_time_context: string
  key_factors: string[]
  market_id: string
  market_title: string
  timestamp: string
  escalated_to_xai: boolean
  /** Same as ``escalated_to_xai`` (provider-neutral name). */
  escalated_to_ai?: boolean
  /** Model provider for this row (``gemini`` | ``xai``); set by API when blob omits it. */
  ai_provider?: AiProvider
  /** Legacy field: same as ``edge_pct`` when present. */
  edge: number
  /** LLM response blob (legacy key name; used for Gemini and xAI). */
  xai_analysis?: XAIAnalysis
  /** Alias of ``xai_analysis``. */
  ai_analysis?: XAIAnalysis
  action_taken?: AnalysisActionTaken
  /** Mid prices / liquidity snapshot at analysis time (when persisted). */
  yes_price?: number
  no_price?: number
  volume?: number
  expires_in_days?: number | null
}

export interface ClosedPositionsResponse {
  positions: ClosedPosition[]
  /** Latest saved ``DecisionLog`` per ticker on this page (fallback when a row has no ``entry_analysis``). */
  position_analyses: Record<string, DecisionAnalysis>
}

export interface AnalysesStats {
  since_hours: number
  total_analyses: number
  /** LLM-escalated analyses (legacy API key; same count as ``escalated_to_ai``). */
  escalated_to_xai: number
  /** LLM-escalated analyses (Gemini or xAI). */
  escalated_to_ai?: number
}

/** Human label for an analysis provider id (``xai_analysis.provider`` or settings). */
export function aiProviderDisplayName(provider?: string | null): string {
  const p = String(provider || '').toLowerCase()
  if (p === 'xai') return 'xAI'
  if (p === 'gemini') return 'Gemini'
  return 'AI'
}

/** Provider that produced a saved analysis row (top-level field, blob, or optional fallback). */
export function analysisAiProviderId(
  a: Pick<DecisionAnalysis, 'xai_analysis' | 'ai_analysis' | 'ai_provider' | 'escalated_to_xai' | 'escalated_to_ai'>,
  fallback?: AiProvider | null,
): AiProvider | null {
  const top = String(a.ai_provider ?? '').toLowerCase()
  if (top === 'xai' || top === 'gemini') return top
  const blob = a.xai_analysis ?? a.ai_analysis
  const p = String(blob?.provider ?? '').toLowerCase()
  if (p === 'xai' || p === 'gemini') return p
  const model = String(blob?.model ?? '').toLowerCase()
  if (model.includes('gemini')) return 'gemini'
  if (model.includes('grok')) return 'xai'
  // Legacy rows without provider/model: escalated_to_xai meant Grok only (pre-Gemini).
  if (a.escalated_to_xai || a.escalated_to_ai) return 'xai'
  if (fallback) return fallback
  return null
}

export interface BotStateInfo {
  state: 'play' | 'pause' | 'stop'
  updated_at: string
}

export interface PerformanceStats {
  /** Every row in the trade ledger (opens + closes). */
  fills_total: number
  buy_count: number
  /** Sell ledger rows (can exceed closed positions when IOC exits partial-fill multiple times). */
  sell_count: number
  /** Closed Position rows — source of truth for realized P&L / win rate (Kalshi-synced in live). */
  closed_positions_count?: number
  closed_wins_count?: number
  closed_losses_count?: number
  closed_breakeven_count?: number
  total_invested: number
  total_realized_pnl: number
  /** Dollar sum of realized_pnl for all closed positions > 0. */
  total_gained?: number
  /** Dollar sum of realized_pnl for all closed positions <= 0 (will be 0 or negative). */
  total_lost?: number
  win_rate: number
  /** Cumulative realized P&L by close date (from closed positions). */
  daily_pnl: Array<{ date: string; pnl: number }>
  timestamp: string
}

export interface LogEntry {
  timestamp: string
  level: string
  name: string
  message: string
}

export type AiProvider = 'gemini' | 'xai'

export interface TuningSnapshot {
  stop_loss_drawdown_pct: number
  min_edge_to_buy_pct: number
  /** When false, the bot never auto-exits for stop-loss drawdown. */
  stop_loss_selling_enabled?: boolean
  /** Minimum AI win probability (0–100) on the purchased side; clamped >50% server-side. */
  min_ai_win_prob_buy_side_pct?: number
  /** Max open legs before new-entry market scan + AI analysis pauses. */
  max_open_positions?: number
  /** Active provider for market analysis: Gemini (default) or xAI (Grok). */
  ai_provider?: AiProvider
  /** Model ids from server config (for Settings hints). */
  gemini_model?: string
  xai_model?: string
  updated_at?: string | null
}

export interface ResetHistoryResponse {
  success: boolean
  trade_mode: string
  closed_positions_deleted: number
  tuning: TuningSnapshot
}

// ── Axios client ───────────────────────────────────────────────────────────────

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 45000,
})

// ── API methods ────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string
  mode: string
  version?: string
  timestamp?: string
}

export const apiClient = {
  getHealth: async (): Promise<HealthResponse> => {
    const { data } = await client.get('/health')
    return data
  },

  // Portfolio
  getPortfolio: async (): Promise<Portfolio> => {
    const { data } = await client.get('/portfolio')
    return data
  },

  /** Single reconcile + tiles + open legs (dashboard coordinated polling). */
  getDashboardBundle: async (): Promise<{
    portfolio: Portfolio
    positions: Position[]
    reconcile_outcome: string
    /** Latest saved analysis per open ``market_id`` (full decision log row). */
    position_analyses?: Record<string, DecisionAnalysis>
  }> => {
    const { data } = await client.get('/dashboard/bundle')
    return data
  },

  vaultTransfer: async (direction: 'to_vault' | 'to_cash', amount: number): Promise<VaultTransferResponse> => {
    const { data } = await client.post('/vault/transfer', { direction, amount })
    return data
  },

  cancelKalshiRestingOrders: async (): Promise<{
    cancelled_count: number
    cancelled_order_ids: string[]
    failed_order_ids: string[]
  }> => {
    const { data } = await client.post('/portfolio/live/cancel-resting-orders')
    return data
  },

  /** Live only: portfolio snapshot, open imports, buy-order entry + unrealized refresh, settlements, flat-row patches. */
  reconcileKalshiPortfolio: async (): Promise<{
    success: boolean
    open_updates: number
    open_positions_imported: number
    settlement_portfolio_closes: number
    settlement_history_closes: number
    flat_row_reconciliations: number
    closure_finalizations: number
    open_entry_order_refreshes?: number
    open_unrealized_refreshes?: number
  }> => {
    const { data } = await client.post('/portfolio/live/reconcile')
    return data
  },

  getPositions: async (): Promise<Position[]> => {
    const { data } = await client.get('/positions')
    return data
  },

  /** DB-only open legs for instant table paint; follow with ``getPositions()`` for Kalshi-fresh marks. */
  getPositionsSnapshot: async (): Promise<Position[]> => {
    const { data } = await client.get('/positions/snapshot')
    return data
  },

  getClosedPositions: async (limit = 50): Promise<ClosedPositionsResponse> => {
    const { data } = await client.get('/positions/closed', { params: { limit } })
    return data
  },

  /** Kalshi GET /markets for recent closed rows — fills ``kalshi_market_result`` when determined. */
  refreshClosedPositionsResolution: async (
    limit = 50,
    tradeMode?: 'paper' | 'live',
    onlyMissingResult?: boolean,
  ): Promise<{
    examined: number
    updated: number
    unchanged: number
    market_fetch_failed: number
  }> => {
    const { data } = await client.post('/positions/closed/refresh-resolution', null, {
      params: {
        limit,
        ...(tradeMode ? { trade_mode: tradeMode } : {}),
        ...(onlyMissingResult ? { only_missing_result: true } : {}),
      },
    })
    return data
  },

  closePosition: async (positionId: string): Promise<{ success: boolean; realized_pnl: number }> => {
    const { data } = await client.post(`/positions/${positionId}/close`)
    return data
  },

  // Analysis
  analyzeMarket: async (
    marketId: string,
    title: string,
    description: string,
    yesPrice: number,
    noPrice: number,
    volume: number,
    expiresInDays: number,
    closeTime?: string,
  ): Promise<DecisionAnalysis> => {
    const { data } = await client.post('/analyze', null, {
      params: {
        market_id: marketId,
        market_title: title,
        market_description: description,
        yes_price: yesPrice,
        no_price: noPrice,
        volume,
        expires_in_days: expiresInDays,
        close_time: closeTime,
      },
    })
    return data
  },

  getAnalyses: async (limit = 50): Promise<DecisionAnalysis[]> => {
    const { data } = await client.get('/analyses', { params: { limit } })
    return data
  },

  getAnalysesStats: async (sinceHours = 168): Promise<AnalysesStats> => {
    const { data } = await client.get('/analyses/stats', { params: { since_hours: sinceHours } })
    return data
  },

  // Trades
  placeTrade: async (
    marketId: string,
    side: string,
    quantity: number,
    limitPrice: number,
  ) => {
    const { data } = await client.post('/trade', null, {
      params: { market_id: marketId, side, quantity, limit_price: limitPrice },
    })
    return data
  },

  // Performance
  getPerformance: async (): Promise<PerformanceStats> => {
    const { data } = await client.get('/performance')
    return data
  },

  // Trading mode
  setTradingMode: async (mode: 'paper' | 'live'): Promise<{ mode: string; bot_state?: string }> => {
    const { data } = await client.post('/settings/mode', { mode })
    return data
  },

  // Bot state
  getBotState: async (): Promise<BotStateInfo> => {
    const { data } = await client.get('/bot/state')
    return data
  },

  setBotState: async (state: 'play' | 'pause' | 'stop'): Promise<{ state: string }> => {
    const { data } = await client.post('/bot/state', { state })
    return data
  },

  // Logs
  getLogs: async (limit = 200): Promise<LogEntry[]> => {
    const { data } = await client.get('/logs', { params: { limit } })
    return data
  },

  // Strategy tuning: min edge, stop-loss drawdown, min AI win % on buy side, stop-loss master switch
  getTuningState: async (): Promise<TuningSnapshot> => {
    const { data } = await client.get('/tuning/state')
    return data
  },

  saveStrategyKnobs: async (body: {
    min_edge_to_buy_pct?: number
    stop_loss_drawdown_pct?: number
    min_ai_win_prob_buy_side_pct?: number
    max_open_positions?: number
  }): Promise<TuningSnapshot> => {
    const { data } = await client.post('/tuning/strategy-knobs', body)
    return data
  },

  setStopLossSellingEnabled: async (enabled: boolean): Promise<TuningSnapshot> => {
    const { data } = await client.post('/tuning/stop-loss-selling', { enabled })
    return data
  },

  resetTuningToConfigDefaults: async (): Promise<TuningSnapshot> => {
    const { data } = await client.post('/tuning/reset-to-config-defaults')
    return data
  },

  setAiProvider: async (provider: AiProvider): Promise<TuningSnapshot> => {
    const { data } = await client.post('/tuning/ai-provider', { provider })
    return data
  },

  resetHistory: async (): Promise<ResetHistoryResponse> => {
    const { data } = await client.post('/history/reset')
    return data
  },
}
