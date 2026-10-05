import { evaluateCopyTradeSizing } from '../../prediction-markets/strategies/copy-trade-sizing'
import type { CopyTradeSizingConfig } from '../../prediction-markets/strategies/copy-trade-sizing'
import type { StrategySource } from '../types'
import { isRecord, isUtcTime, validateAccount } from '../validate'

export interface CopyTradeSizingInput {
  venue: string
  marketId: string
  outcome: 'YES' | 'NO'
  side: 'BUY' | 'SELL'
  asOf: string
  notionalUsd: number
  shares: number
  priceCents: number
  config?: Partial<CopyTradeSizingConfig>
}
export const copyTradeSizingSource: StrategySource<CopyTradeSizingInput> = {
  id: 'copy-trade-sizing',
  upstream: 'Prediction-Markets-Trading-Bot-Toolkits/src/service/strategy.rs:size_for_trade',
  maxSignalAgeMs: 5 * 60_000,
  run(input, context) {
    if (
      !isRecord(input) ||
      ![input.venue, input.marketId].every(
        x => typeof x === 'string' && x.length > 0 && x.trim() === x
      ) ||
      !['YES', 'NO'].includes(input.outcome) ||
      !['BUY', 'SELL'].includes(input.side) ||
      !isUtcTime(input.asOf) ||
      !isUtcTime(context.evaluationTime) ||
      Date.parse(input.asOf) > Date.parse(context.evaluationTime) ||
      Date.parse(context.evaluationTime) - Date.parse(input.asOf) > this.maxSignalAgeMs! ||
      (context.account &&
        (validateAccount(context.account).length ||
          context.account.kind !== 'event' ||
          context.account.venue !== input.venue))
    )
      throw new Error('invalid copy trade input')
    const decision = evaluateCopyTradeSizing(input, input.config)
    const base = {
      sourceId: this.id,
      upstream: this.upstream,
      instrument: {
        type: 'event' as const,
        venue: input.venue,
        marketId: input.marketId,
        outcome: input.outcome
      },
      asOf: input.asOf,
      confidence: 1,
      reasoning: `${decision.skipped ?? 'eligible observed trade sizing'}; confidence 1 means deterministic sizing, not a forecast`,
      evidence: { copyUsd: decision.copyUsd, effectivePercent: decision.effectivePercent }
    }
    if (decision.skipped) return [{ ...base, kind: 'signal', action: 'HOLD' }]
    return [
      {
        ...base,
        kind: 'order',
        action: input.side,
        order: {
          ticker: input.marketId,
          outcome: input.outcome,
          action: input.side,
          quantity: decision.quantity,
          priceCents: input.priceCents,
          timestamp: input.asOf,
          reason: base.reasoning
        }
      }
    ]
  }
}
