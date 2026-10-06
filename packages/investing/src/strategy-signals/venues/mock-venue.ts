import { InMemoryPaperExecutor } from '../../prediction-markets/execution/paper'
import type {
  PaperExecutionResult,
  PredictionMarketTradeIntent
} from '../../prediction-markets/types'
import type { AccountSnapshot, ExecutionApproval, VenueAdapter, VenueMarket } from '../types'
import { toExecutableCents, toPredictionMarketIntent } from '../execution'

export class MockVenue implements VenueAdapter {
  private executor: InMemoryPaperExecutor
  private markets = new Map<string, VenueMarket>()
  constructor(
    public readonly venue: string,
    markets: VenueMarket[],
    initialCashCents = 10000,
    maxPositionPerMarket = 50
  ) {
    this.executor = new InMemoryPaperExecutor({ initialCashCents, maxPositionPerMarket })
    for (const market of markets) this.setMarket(market)
  }
  setMarket(market: VenueMarket): void {
    if (
      market.venue !== this.venue ||
      market.outcomes.length !== 2 ||
      new Set(market.outcomes.map(o => o.side)).size !== 2
    )
      throw new Error('invalid binary venue market')
    this.markets.set(market.marketId, structuredClone(market))
  }
  async getMarket(id: string): Promise<VenueMarket> {
    const market = this.markets.get(id)
    if (!market) throw new Error('unknown market')
    return structuredClone(market)
  }
  async execute(approval: ExecutionApproval): Promise<PaperExecutionResult> {
    if (
      approval.proposal.instrument.type !== 'event' ||
      approval.proposal.instrument.venue !== this.venue
    )
      throw new Error('approval venue mismatch')
    return this.placeOrder(toPredictionMarketIntent(approval))
  }
  async placeOrder(intent: PredictionMarketTradeIntent): Promise<PaperExecutionResult> {
    const reject = (reason: string): PaperExecutionResult => ({
      status: 'REJECTED',
      intent,
      reason,
      portfolio: this.executor.snapshot()
    })
    const market = this.markets.get(intent.ticker)
    if (
      !market ||
      market.status !== 'open' ||
      (market.closesAt && Date.parse(market.closesAt) <= Date.parse(intent.timestamp))
    )
      return reject('market missing or closed')
    if (
      !['BUY', 'SELL'].includes(intent.action) ||
      !['YES', 'NO'].includes(String(intent.outcome)) ||
      !Number.isSafeInteger(intent.quantity) ||
      intent.quantity <= 0
    )
      return reject('invalid order')
    const side = market.outcomes.find(o => o.side === intent.outcome)
    const quote = intent.action === 'BUY' ? side?.askCents : side?.bidCents
    if (quote === undefined || quote === null) return reject('missing execution quote')
    let cents: number
    try {
      cents = toExecutableCents(quote)
      toExecutableCents(intent.priceCents)
    } catch (e) {
      return reject((e as Error).message)
    }
    if (
      (intent.action === 'BUY' && cents > intent.priceCents) ||
      (intent.action === 'SELL' && cents < intent.priceCents)
    )
      return reject('quote outside approved limit')
    return this.executor.execute({ ...intent, priceCents: cents })
  }
  snapshot(): AccountSnapshot {
    return { kind: 'event', venue: this.venue, portfolio: this.executor.snapshot() }
  }
}
