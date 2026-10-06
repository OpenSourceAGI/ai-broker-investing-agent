import type { PredictionMarketTradeIntent } from '../prediction-markets/types'
import type { AccountSnapshot, ExecutionApproval } from './types'
import { isQuantity, validateAccount } from './validate'

export function toExecutableCents(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new Error(`invalid execution price ${value}¢`)
  if (Math.abs(value - Math.round(value)) >= 1e-9)
    throw new Error(`sub-cent price ${value}¢ is not executable by the paper executor`)
  return Math.round(value)
}
export function validateApproval(approval: ExecutionApproval): void {
  const { proposal: p, finalQuantity: q, verdict: v, judge: j, fundManager: f } = approval
  if (!['BUY', 'SELL'].includes(p.action) || !['PROCEED', 'BLOCK', 'REDUCE'].includes(j.kind))
    throw new Error('invalid approval action or judge decision')
  if (
    !v.allowed ||
    j.kind === 'BLOCK' ||
    !['APPROVE', 'MODIFY'].includes(f.decision) ||
    f.proposalId !== p.proposalId ||
    !isQuantity(q) ||
    q === 0 ||
    !isQuantity(p.quantity) ||
    !isQuantity(v.maxQuantity) ||
    !isQuantity(f.quantity) ||
    q > Math.min(p.quantity, v.maxQuantity, f.quantity) ||
    (j.kind === 'REDUCE' && (!isQuantity(j.maxQuantity) || q > j.maxQuantity))
  )
    throw new Error('invalid or exceeded execution approval')
}
export function toPredictionMarketIntent(approval: ExecutionApproval): PredictionMarketTradeIntent {
  validateApproval(approval)
  const p = approval.proposal
  if (p.instrument.type !== 'event' || !p.outcome || p.limitPriceCents === undefined)
    throw new Error('event approval required')
  return {
    action: p.action,
    ticker: p.instrument.marketId,
    outcome: p.outcome,
    quantity: approval.finalQuantity,
    priceCents: toExecutableCents(p.limitPriceCents),
    timestamp: p.asOf,
    reason: `Approved ${p.proposalId}`
  }
}
export interface EquityOrder {
  symbol: string
  qty: number
  side: 'buy' | 'sell'
  type: 'market'
  time_in_force: 'day'
}
export interface EquityOrderClient {
  createOrder(order: EquityOrder): Promise<unknown>
}
export function equityPriceCents(lastClose: number): number {
  const cents = lastClose * 100
  if (
    !Number.isFinite(cents) ||
    cents <= 0 ||
    !Number.isSafeInteger(Math.round(cents)) ||
    Math.abs(cents - Math.round(cents)) >= 1e-9
  )
    throw new Error('unsupported stock price; fixture fills require whole cents')
  return Math.round(cents)
}
export function toEquityOrder(
  approval: ExecutionApproval,
  lastClose: number,
  account?: AccountSnapshot
): EquityOrder {
  validateApproval(approval)
  const p = approval.proposal
  if (
    p.instrument.type !== 'equity' ||
    !Number.isFinite(lastClose) ||
    lastClose <= 0 ||
    !account ||
    account.kind !== 'equity' ||
    validateAccount(account).length
  )
    throw new Error('equity execution needs a current account and positive fixture close')
  const priceCents = equityPriceCents(lastClose)
  const qty = Math.min(
    approval.finalQuantity,
    p.action === 'BUY'
      ? Math.floor(account.cashCents / priceCents)
      : (account.shares[p.instrument.symbol]?.quantity ?? 0)
  )
  if (qty === 0) throw new Error('zero affordable or held shares')
  return {
    symbol: p.instrument.symbol,
    qty,
    side: p.action === 'BUY' ? 'buy' : 'sell',
    type: 'market',
    time_in_force: 'day'
  }
}
