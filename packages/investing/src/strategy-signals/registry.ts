/** Provenance for every StrategySource derived from third-party-trading-bots/.
 * License texts and reference blobs live in THIRD_PARTY_NOTICES.md. */
import type { StrategySource } from './types'
import { kalshiMomentumSource } from './sources/kalshi-momentum'
import { createSpreadAwareMomentumSource } from './sources/spread-aware-momentum'
import { kalshiVibeSource } from './sources/kalshi-vibe'
import { copyTradeSizingSource } from './sources/copy-trade-sizing'
import { gabagoolSource } from './sources/gabagool'
import { btc15mFusionSource } from './sources/btc15m-fusion'
import { hedgeFundTechnicalsSource } from './sources/hedge-fund-technicals'
import { redFlagsSource } from './sources/red-flags'

export interface RegisteredSource {
  source: StrategySource<any>
  name: string
  /** Folder under third-party-trading-bots/. */
  upstreamRepo: string
  license: string
  /** port: translated upstream code; independent: reimplemented behavior; extension: local addition. */
  fidelity: 'port' | 'independent' | 'extension'
  venue: 'kalshi' | 'polymarket' | 'binary event' | 'equity'
  /** daily-bars: replayable over historical OHLCV; replay-demo: fixture-driven graph demo only. */
  backtest: 'daily-bars' | 'replay-demo'
}

export const registeredSources: readonly RegisteredSource[] = [
  {
    source: kalshiMomentumSource,
    name: 'Kalshi momentum',
    upstreamRepo: 'kalshi-bot-api',
    license: 'MIT (PyKalshi)',
    fidelity: 'port',
    venue: 'kalshi',
    backtest: 'replay-demo'
  },
  {
    source: createSpreadAwareMomentumSource(),
    name: 'Kalshi spread-aware momentum',
    upstreamRepo: 'kalshi-bot-api',
    license: 'MIT (PyKalshi) with local entry filter',
    fidelity: 'extension',
    venue: 'kalshi',
    backtest: 'replay-demo'
  },
  {
    source: kalshiVibeSource,
    name: 'Kalshi Vibe forecast',
    upstreamRepo: 'Kalshi-Vibe-Bot',
    license: 'MIT (K-Jeez)',
    fidelity: 'port',
    venue: 'kalshi',
    backtest: 'replay-demo'
  },
  {
    source: copyTradeSizingSource,
    name: 'Copy-trade sizing',
    upstreamRepo: 'Prediction-Markets-Trading-Bot-Toolkits',
    license: 'MIT (HarrierOnChain)',
    fidelity: 'port',
    venue: 'binary event',
    backtest: 'replay-demo'
  },
  {
    source: gabagoolSource,
    name: 'Gabagool paired hedge',
    upstreamRepo: 'poly-bot-gabagool',
    license: 'independent implementation',
    fidelity: 'independent',
    venue: 'polymarket',
    backtest: 'replay-demo'
  },
  {
    source: btc15mFusionSource,
    name: 'BTC 15-minute signal fusion',
    upstreamRepo: 'Polymarket-BTC-15-Minute-Trading-Bot',
    license: 'independent implementation',
    fidelity: 'independent',
    venue: 'polymarket',
    backtest: 'replay-demo'
  },
  {
    source: hedgeFundTechnicalsSource,
    name: 'Hedge-fund technicals',
    upstreamRepo: 'ai-hedge-fund',
    license: 'independent implementation',
    fidelity: 'independent',
    venue: 'equity',
    backtest: 'daily-bars'
  },
  {
    source: redFlagsSource,
    name: 'Debate red flags (advisory)',
    upstreamRepo: 'debate-agents',
    license: 'independent implementation',
    fidelity: 'independent',
    venue: 'equity',
    backtest: 'replay-demo'
  }
]

/** Every registered source keyed by id, ready for `GraphRun.sources`. */
export function sourceRegistry(): Record<string, StrategySource<any>> {
  return Object.fromEntries(registeredSources.map(entry => [entry.source.id, entry.source]))
}
