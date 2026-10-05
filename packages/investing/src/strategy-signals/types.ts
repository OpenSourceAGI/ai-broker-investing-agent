import type { StockData, TradeSignal } from '../trading-agents/types'
import type {
  PaperPosition,
  PaperPortfolioState,
  PaperExecutionResult,
  PredictionMarketTradeIntent
} from '../prediction-markets/types'

export type Outcome = 'YES' | 'NO'
export type Instrument =
  | { type: 'equity'; symbol: string }
  | { type: 'event'; venue: string; marketId: string; outcome?: Outcome }
export interface NormalizedSignal extends Pick<TradeSignal, 'action' | 'confidence' | 'reasoning'> {
  sourceId: string
  upstream: string
  kind: 'signal' | 'recommendation' | 'order' | 'portfolio'
  instrument: Instrument
  asOf: string
  /** Always P(YES), only when supplied by a genuine forecast. */
  probability?: number
  order?: PredictionMarketTradeIntent
  targets?: Array<Pick<PaperPosition, 'ticker' | 'outcome' | 'quantity'> & { priceCents: number }>
  sizing?: { quantity?: number; limitPriceCents?: number }
  evidence?: Record<string, number | string>
}
export interface TradeProposal {
  proposalId: string
  sourceId: string
  instrument: Instrument
  action: 'BUY' | 'SELL'
  outcome?: Outcome
  /** Undefined only for a directional stock decision, priced at preflight. */
  limitPriceCents?: number
  quantity: number
  asOf: string
}
export type AccountSnapshot =
  | { kind: 'event'; venue: string; portfolio: PaperPortfolioState }
  | {
      kind: 'equity'
      cashCents: number
      shares: Record<string, { quantity: number; averagePriceCents: number }>
    }
export interface SourceContext {
  account?: AccountSnapshot
  evaluationTime: string
}
export interface ProposalContext extends SourceContext {
  instrument: Instrument
  event?: VenueMarket
}
export type SourceGuard = (
  proposal: TradeProposal,
  context: SourceContext,
  signal: NormalizedSignal
) => { maxQuantity?: number; deny?: string }
export interface StrategySource<I = unknown> {
  id: string
  upstream: string
  maxSignalAgeMs?: number
  guards?: SourceGuard[]
  run(input: I, context: SourceContext): NormalizedSignal[]
}
export interface RiskLimits {
  maxPositionPerMarket: number
  maxOpenPositions?: number
}
export interface RiskPosture {
  label: string
  sizeMultiplier: number
  allowNewEntries: boolean
}
export interface RiskVerdict {
  allowed: boolean
  maxQuantity: number
  reasons: string[]
  limits: RiskLimits
}
export type JudgeDecision =
  | { kind: 'PROCEED' }
  | { kind: 'BLOCK' }
  | { kind: 'REDUCE'; maxQuantity: number }
export interface FundManagerApproval {
  decision: 'APPROVE' | 'REJECT' | 'MODIFY'
  proposalId: string
  quantity?: number
}
export interface ExecutionApproval {
  proposal: TradeProposal
  finalQuantity: number
  verdict: RiskVerdict
  judge: JudgeDecision
  fundManager: FundManagerApproval
  reasons: string[]
}
export interface VenueMarket {
  venue: string
  marketId: string
  title: string
  question?: string
  status: 'open' | 'closed'
  closesAt?: string
  outcomes: Array<{
    outcomeId: string
    label: string
    side: Outcome
    bidCents: number | null
    askCents: number | null
    tickSizeCents?: number
  }>
}
export interface VenueAdapter {
  venue: string
  getMarket(id: string): Promise<VenueMarket>
  placeOrder(intent: PredictionMarketTradeIntent): Promise<PaperExecutionResult>
}
export interface MarketDataProvider {
  getDailyBars(symbol: string, from: string, to: string): Promise<StockData[]>
}
export interface RejectedSignal {
  input: unknown
  reasons: string[]
}
export function toTradeSignal(signal: NormalizedSignal): TradeSignal {
  return {
    action: signal.action,
    confidence: signal.confidence,
    reasoning: signal.reasoning,
    timestamp: new Date(signal.asOf)
  }
}
