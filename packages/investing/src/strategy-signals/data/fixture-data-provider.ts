import type { StockData } from '../../trading-agents/types'
import type { MarketDataProvider } from '../types'

export class FixtureDataProvider implements MarketDataProvider {
  constructor(private bars: Record<string, StockData[]>) {}
  async getDailyBars(symbol: string, from: string, to: string): Promise<StockData[]> {
    if (!this.bars[symbol]) throw new Error('fixture symbol not found')
    return this.bars[symbol].filter(b => b.date >= from && b.date <= to).map(b => ({ ...b }))
  }
}
