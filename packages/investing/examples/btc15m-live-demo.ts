import { evaluateBtcFusion } from '../src/prediction-markets/strategies/btc15m-fusion'
import type { BtcProcessorSignal } from '../src/prediction-markets/strategies/btc15m-fusion'
import { btc15mFusionSource } from '../src/strategy-signals/sources/btc15m-fusion'
import { MockVenue } from '../src/strategy-signals/venues/mock-venue'
import { TradingAgentsGraph } from '../src/trading-agents/graph/trading-graph'
import { ScriptedLLMClient } from '../src/trading-agents/utils/scripted-llm'

interface BinanceKline {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  closeTime: number
  quoteVolume: number
  trades: number
  takerBuyBaseVolume: number
  takerBuyQuoteVolume: number
}

async function fetchLiveBtcCandles(): Promise<BinanceKline[]> {
  const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=15'
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch Binance klines: ${res.statusText}`)
  }
  const raw = (await res.json()) as Array<Array<number | string>>
  return raw.map(c => ({
    openTime: Number(c[0]),
    open: parseFloat(String(c[1])),
    high: parseFloat(String(c[2])),
    low: parseFloat(String(c[3])),
    close: parseFloat(String(c[4])),
    volume: parseFloat(String(c[5])),
    closeTime: Number(c[6]),
    quoteVolume: parseFloat(String(c[7])),
    trades: Number(c[8]),
    takerBuyBaseVolume: parseFloat(String(c[9])),
    takerBuyQuoteVolume: parseFloat(String(c[10])),
  }))
}

export async function runLiveBtcFusionBot() {
  console.log('='.repeat(70))
  console.log('🚀 LIVE POLYMARKET BTC 15-MINUTE TRADING BOT DEMO')
  console.log('='.repeat(70))

  console.log('\n[1/5] Fetching live 1m BTC/USDT candles from Binance...')
  const candles = await fetchLiveBtcCandles()
  const latest = candles[candles.length - 1]
  const prev5m = candles[Math.max(0, candles.length - 6)]
  const prev15m = candles[0]

  const currentPrice = latest.close
  const delta5m = currentPrice - prev5m.close
  const delta15m = currentPrice - prev15m.close

  console.log(`  • Current Live BTC Price : $${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
  console.log(`  • 5-Minute Price Change  : ${delta5m >= 0 ? '+' : ''}$${delta5m.toFixed(2)} (${((delta5m / prev5m.close) * 100).toFixed(3)}%)`)
  console.log(`  • 15-Minute Price Change : ${delta15m >= 0 ? '+' : ''}$${delta15m.toFixed(2)} (${((delta15m / prev15m.close) * 100).toFixed(3)}%)`)

  // 1. Spike Detector Signal
  const spikeDirection = delta5m >= 0 ? 'BULLISH' : 'BEARISH'
  const spikeStrength = Math.min(4, Math.max(1, Math.round(Math.abs(delta5m) / 40))) as 1 | 2 | 3 | 4
  const spikeConf = Math.min(0.95, Math.max(0.55, 0.6 + Math.abs(delta5m) / 400))

  // 2. Price Divergence Signal (Short 3m EMA vs 10m EMA)
  const shortEma = candles.slice(-3).reduce((acc, c) => acc + c.close, 0) / 3
  const longEma = candles.slice(-10).reduce((acc, c) => acc + c.close, 0) / 10
  const divergenceDirection = shortEma >= longEma ? 'BULLISH' : 'BEARISH'
  const divergenceConf = Math.min(0.90, Math.max(0.55, 0.65 + Math.abs(shortEma - longEma) / 100))

  // 3. Sentiment Analysis Signal (Taker Buy Volume vs Total Volume)
  const recentCandles = candles.slice(-5)
  const totalVol = recentCandles.reduce((acc, c) => acc + c.volume, 0)
  const buyVol = recentCandles.reduce((acc, c) => acc + c.takerBuyBaseVolume, 0)
  const buyRatio = totalVol > 0 ? buyVol / totalVol : 0.5
  const sentimentDirection = buyRatio >= 0.50 ? 'BULLISH' : 'BEARISH'
  const sentimentConf = Math.min(0.90, Math.max(0.50, Math.abs(buyRatio - 0.5) * 3 + 0.6))

  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  const signals: BtcProcessorSignal[] = [
    {
      source: 'SpikeDetection',
      direction: spikeDirection,
      confidence: parseFloat(spikeConf.toFixed(3)),
      strength: spikeStrength,
      timestamp: nowIso,
    },
    {
      source: 'PriceDivergence',
      direction: divergenceDirection,
      confidence: parseFloat(divergenceConf.toFixed(3)),
      strength: 3,
      timestamp: nowIso,
    },
    {
      source: 'SentimentAnalysis',
      direction: sentimentDirection,
      confidence: parseFloat(sentimentConf.toFixed(3)),
      strength: 2,
      timestamp: nowIso,
    },
  ]

  console.log('\n[2/5] Generated Real-Time Sub-Signals:')
  signals.forEach(s => {
    console.log(`  • ${s.source.padEnd(18)}: ${s.direction.padEnd(8)} (Conf: ${(s.confidence * 100).toFixed(1)}%, Strength: ${s.strength ?? 2}/4)`)
  })

  console.log('\n[3/5] Running Signal Fusion Engine...')
  const fused = evaluateBtcFusion(signals, nowIso)
  if (!fused) {
    console.log('  ⚠️ Signal fusion returned no actionable consensus.')
    return
  }

  console.log(`  • Consensus Direction   : ${fused.direction}`)
  console.log(`  • Consensus Score       : ${fused.score.toFixed(1)}%`)
  console.log(`  • Average Confidence    : ${(fused.confidence * 100).toFixed(1)}%`)
  console.log(`  • Is Actionable?        : ${fused.actionable ? '✅ YES (Score >= 60% & Conf >= 0.6)' : '❌ NO'}`)

  console.log('\n[4/5] Passing Through Strategy Adapter & Multi-Agent Graph...')
  const targetMarketId = `BTC-15M-${nowIso.slice(0, 16)}`
  const marketVenue = {
    venue: 'polymarket',
    marketId: targetMarketId,
    title: `Will BTC be UP in the next 15 minutes? (Spot: $${currentPrice.toFixed(0)})`,
    question: 'Will BTC close higher at the end of the 15-minute candle?',
    status: 'open' as const,
    closeTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    outcomes: [
      { outcomeId: `${targetMarketId}-YES`, label: 'Yes', side: 'YES' as const, bidCents: 50, askCents: 52 },
      { outcomeId: `${targetMarketId}-NO`, label: 'No', side: 'NO' as const, bidCents: 46, askCents: 48 },
    ],
  }

  const venue = new MockVenue('polymarket', [marketVenue], 10_000)
  const context = { account: venue.snapshot(), evaluationTime: nowIso }

  const strategyInput = {
    venue: 'polymarket',
    marketId: targetMarketId,
    asOf: nowIso,
    signals,
    yesAskCents: 52,
    noAskCents: 48,
  }

  const normalizedSignals = btc15mFusionSource.run(strategyInput, context)
  console.log(`  • Normalized Signal     : Action = ${normalizedSignals[0].action}, Outcome = ${normalizedSignals[0].order?.outcome}, Size = ${normalizedSignals[0].order?.quantity} contracts @ ${normalizedSignals[0].order?.priceCents}¢`)

  // Use the established demoLLM pattern for full multi-agent debate
  const action = normalizedSignals[0].action
  const llm = new ScriptedLLMClient([
    { name: 'bull', match: 'a Bull Analyst', response: 'Recorded evidence supports the proposal.' },
    { name: 'bear', match: 'a Bear Analyst', response: 'Consider missing evidence and capital risk.' },
    { name: 'research-manager', match: 'an Investment Judge', response: 'FINAL DECISION: INVEST' },
    { name: 'trader', match: 'a trading agent', response: `FINAL TRANSACTION PROPOSAL: ${action}` },
    { name: 'risky', match: 'a Risk-Seeking Analyst', response: 'Review upside within caps.' },
    { name: 'safe', match: 'a Risk-Conservative Analyst', response: 'Preserve capital within caps.' },
    { name: 'neutral', match: 'a Neutral Risk Analyst', response: 'Balance evidence and constraints.' },
    { name: 'risk-judge', match: 'a Risk Judge', response: 'RISK DECISION: PROCEED' },
    {
      name: 'fund-manager',
      match: 'the **Fund Manager**',
      response: prompt => {
        const proposal = prompt.match(/"proposalId":"([^"]+)"/)
        if (!proposal) throw new Error('proposal missing from prompt')
        return `PROPOSAL ID: ${proposal[1]}\nDECISION: APPROVE\nAPPROVED QUANTITY: 2`
      }
    }
  ])

  const graph = new TradingAgentsGraph(['market', 'news'], false, undefined, {
    llm: { deep: llm, quick: llm },
    riskReview: true,
    riskLimits: { maxPositionPerMarket: 50 },
  })

  const instrument = {
    type: 'event' as const,
    venue: venue.venue,
    marketId: targetMarketId,
    ...(normalizedSignals[0]?.instrument.type === 'event' && normalizedSignals[0].instrument.outcome
      ? { outcome: normalizedSignals[0].instrument.outcome }
      : {})
  }

  const result = await graph.propagate(marketVenue.title, nowIso.slice(0, 10), {
    instrument,
    strategySignals: normalizedSignals,
    account: context.account,
    evaluationTime: nowIso,
    event: marketVenue,
    sources: { [btc15mFusionSource.id]: btc15mFusionSource },
  })

  console.log('\n[5/5] Execution & Risk Results:')
  console.log(`  • Risk Judge Decision   : ${JSON.stringify(result.state.judgeDecision ?? result.state.riskDebateState?.judgeDecision)}`)
  console.log(`  • Deterministic Gate    : Allowed = ${result.state.riskVerdict?.allowed}, Max Quantity = ${result.state.riskVerdict?.maxQuantity}, Reasons = ${result.state.riskVerdict?.reasons?.join(', ')}`)
  console.log(`  • Fund Manager Decision : Decision = ${result.state.fundManagerApproval?.decision}, Quantity = ${result.state.fundManagerApproval?.quantity}`)
  if (result.state.riskReviewReason) {
    console.log(`  • Risk Review Notice    : ${result.state.riskReviewReason}`)
  }

  if (result.state.approval && result.state.approval.finalQuantity > 0) {
    const executed = await venue.execute(result.state.approval)
    const newSnapshot = venue.snapshot()
    console.log(`  • Mock Execution Status : ⚡ ${executed.status} ${executed.intent.quantity} contract(s) @ ${executed.intent.priceCents}¢`)
    console.log(`  • Updated Portfolio Cash: $${(newSnapshot.portfolio.cashCents / 100).toFixed(2)} (Cash deducted: $${((10000 - newSnapshot.portfolio.cashCents) / 100).toFixed(2)})`)
    console.log(`  • Open Position Added   : ${executed.intent.outcome} ${executed.intent.quantity} contract(s) on ${executed.intent.ticker}`)
  } else {
    console.log('  • Execution Status     : NO TRADE EXECUTED (Risk gate or Fund Manager withheld approval)')
  }

  console.log('\n' + '='.repeat(70))
  console.log('✅ DEMO COMPLETE: Live market data successfully flowed through BTC15M Bot!')
  console.log('='.repeat(70) + '\n')
}

// Self-run when executed directly
await runLiveBtcFusionBot()
