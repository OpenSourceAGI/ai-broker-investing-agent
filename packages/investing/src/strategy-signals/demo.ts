import { TradingAgentsGraph } from '../trading-agents/graph/trading-graph'
import { ScriptedLLMClient } from '../trading-agents/utils/scripted-llm'
import { kalshiMomentumSource } from './sources/kalshi-momentum'
import { MockVenue } from './venues/mock-venue'
import type {
  AccountSnapshot,
  NormalizedSignal,
  RiskPosture,
  StrategySource,
  VenueMarket
} from './types'
import { kalshiVibeSource } from './sources/kalshi-vibe'
import { gabagoolSource } from './sources/gabagool'
import { btc15mFusionSource } from './sources/btc15m-fusion'
import type { BtcFusionInput } from './sources/btc15m-fusion'
import { copyTradeSizingSource } from './sources/copy-trade-sizing'
import type { CopyTradeSizingInput } from './sources/copy-trade-sizing'
import { hedgeFundTechnicalsSource } from './sources/hedge-fund-technicals'
import { redFlagsSource } from './sources/red-flags'
import { fromKalshiMarket } from './venues/kalshi-venue-mapping'
import { fromPmxtMarket } from './venues/pmxt-venue-mapping'
import { MockEquityBroker } from './venues/mock-equity-broker'
import { toEquityOrder } from './execution'
import { parseFinalLine } from '../trading-agents/utils/parse-final-line'
import { fromOpenBBBars } from './data/openbb-mapping'
import { FixtureDataProvider } from './data/fixture-data-provider'
import { openBBTrendRows } from './fixtures/openbb-data/bars'
import { initialSurvivalState, updateSurvivalState, toSurvivalPosture } from './survival-posture'
import vibeYes from './fixtures/kalshi-vibe/yes.json'
import vibeNo from './fixtures/kalshi-vibe/no.json'
import kalshiRaw from './fixtures/kalshi-venue/market.json'
import pmxtRaw from './fixtures/pmxt-venue/market.json'
import gabaInput from './fixtures/gabagool/sequence.json'
import btcInput from './fixtures/btc15m-fusion/bullish.json'
import copyInput from './fixtures/copy-trade-sizing/percentage.json'

export function demoLLM(action: string, judge = 'PROCEED', quantity = 50): ScriptedLLMClient {
  return new ScriptedLLMClient([
    { name: 'bull', match: 'a Bull Analyst', response: 'Recorded evidence supports the proposal.' },
    {
      name: 'bear',
      match: 'a Bear Analyst',
      response: 'Consider missing evidence and capital risk.'
    },
    { name: 'research-manager', match: 'an Investment Judge', response: 'FINAL DECISION: INVEST' },
    { name: 'trader', match: 'a trading agent', response: `FINAL TRANSACTION PROPOSAL: ${action}` },
    { name: 'risky', match: 'a Risk-Seeking Analyst', response: 'Review upside within caps.' },
    {
      name: 'safe',
      match: 'a Risk-Conservative Analyst',
      response: 'Preserve capital within caps.'
    },
    {
      name: 'neutral',
      match: 'a Neutral Risk Analyst',
      response: 'Balance evidence and constraints.'
    },
    { name: 'risk-judge', match: 'a Risk Judge', response: `RISK DECISION: ${judge}` },
    {
      name: 'fund-manager',
      match: 'the **Fund Manager**',
      response: prompt => {
        const proposal = prompt.match(/"proposalId":"([^"]+)"/)
        if (!proposal) throw new Error('proposal missing from prompt')
        return `PROPOSAL ID: ${proposal[1]}\nDECISION: APPROVE\nAPPROVED QUANTITY: ${quantity}`
      }
    }
  ])
}
export async function runEventDemo(
  signals: NormalizedSignal[],
  source: StrategySource<any>,
  venue: MockVenue,
  market: VenueMarket,
  evaluationTime: string,
  action = signals[0]?.action ?? 'HOLD',
  posture?: RiskPosture,
  judge = 'PROCEED'
) {
  const before = venue.snapshot(),
    llm = demoLLM(action, judge)
  const graph = new TradingAgentsGraph(['market', 'news'], false, undefined, {
    llm: { deep: llm, quick: llm },
    riskReview: true,
    riskLimits: { maxPositionPerMarket: 50 },
    riskPosture: posture
  })
  const instrument = {
    type: 'event' as const,
    venue: venue.venue,
    marketId: market.marketId,
    ...(signals[0]?.instrument.type === 'event' && signals[0].instrument.outcome
      ? { outcome: signals[0].instrument.outcome }
      : {})
  }
  const result = await graph.propagate(market.title, evaluationTime.slice(0, 10), {
    instrument,
    strategySignals: signals,
    account: before,
    evaluationTime,
    event: market,
    sources: { [source.id]: source }
  })
  let fill
  let executionRejection: string | undefined
  if (result.state.approval) {
    try {
      fill = await venue.execute(result.state.approval)
    } catch (error) {
      executionRejection = (error as Error).message
    }
  }
  return {
    signals,
    report: result.state.strategySignalsReport,
    proposal: result.state.proposal,
    trader: result.state.traderInvestmentPlan,
    riskDebate: result.state.riskDebateState,
    judge: result.state.judgeDecision,
    verdict: result.state.riskVerdict,
    fundManager: result.state.fundManagerApproval,
    approval: result.state.approval,
    fill,
    executionRejection,
    reportOnly: result.state.riskReviewReason,
    before,
    after: venue.snapshot(),
    signal: result.signal,
    prompts: llm.calls
  }
}
export function syntheticMarket(marketId: string, yes: number, venue = 'kalshi'): VenueMarket {
  return {
    venue,
    marketId,
    title: 'Will the fixture event occur?',
    question: 'Will the fixture event occur?',
    status: 'open',
    closesAt: '2026-01-02T00:00:00Z',
    outcomes: [
      { outcomeId: `${marketId}-yes`, label: 'Yes', side: 'YES', bidCents: yes, askCents: yes },
      {
        outcomeId: `${marketId}-no`,
        label: 'No',
        side: 'NO',
        bidCents: 100 - yes,
        askCents: 100 - yes
      }
    ]
  }
}
export async function runMomentumDemo() {
  const market = syntheticMarket('MOMENTUM', 55),
    venue = new MockVenue('kalshi', [market])
  const input = (prices: number[]) => ({
    ticks: prices.map((yesPriceCents, i) => ({
      ticker: 'MOMENTUM',
      yesPriceCents,
      timestamp: `2026-01-01T00:00:0${i}Z`
    }))
  })
  const time = '2026-01-01T00:00:10Z'
  const signals = kalshiMomentumSource.run(input([50, 51, 52, 53, 55]), {
    account: venue.snapshot(),
    evaluationTime: time
  })
  const buy = await runEventDemo(signals, kalshiMomentumSource, venue, market, time)
  const exitMarket = syntheticMarket('MOMENTUM', 60)
  venue.setMarket(exitMarket)
  const exitSignals = kalshiMomentumSource.run(input([50, 51, 52, 53, 55, 60]), {
    account: venue.snapshot(),
    evaluationTime: time
  })
  const sell = await runEventDemo(exitSignals, kalshiMomentumSource, venue, exitMarket, time)
  return [buy, sell]
}

export async function runGabagoolDemo() {
  const time = gabaInput.asOf,
    id = gabaInput.marketId
  const market = (no: number): VenueMarket => ({
    ...syntheticMarket(id, 49, 'polymarket'),
    outcomes: [
      { outcomeId: `${id}-yes`, label: 'Yes', side: 'YES', bidCents: 49, askCents: 49 },
      { outcomeId: `${id}-no`, label: 'No', side: 'NO', bidCents: no, askCents: no }
    ]
  })
  const venue = new MockVenue('polymarket', [market(52)])
  const step = async (noAskCents: number, actualQuote: number, judge = 'PROCEED') => {
    const current = market(actualQuote)
    venue.setMarket(current)
    const signals = gabagoolSource.run(
      { ...gabaInput, noAskCents },
      { account: venue.snapshot(), evaluationTime: time }
    )
    return runEventDemo(
      signals,
      gabagoolSource,
      venue,
      current,
      time,
      signals[0].action,
      undefined,
      judge
    )
  }
  const first = await step(52, 52)
  const wait = await step(52, 52)
  const rejected = await step(49, 50)
  const completion = await step(49, 49)
  const satisfied = await step(49, 49)
  const reducedVenue = new MockVenue('polymarket', [market(52)])
  const reducedSignals = gabagoolSource.run(gabaInput, {
    account: reducedVenue.snapshot(),
    evaluationTime: time
  })
  const reduced = await runEventDemo(
    reducedSignals,
    gabagoolSource,
    reducedVenue,
    market(52),
    time,
    'BUY',
    undefined,
    'REDUCE 3'
  )
  return { first, wait, rejected, completion, satisfied, reduced }
}

export async function runStockDemo() {
  const time = '2026-06-10T00:00:00Z',
    symbol = 'FIXTURE'
  const broker = new MockEquityBroker({}, 100000)
  const traces = []
  for (const direction of ['up', 'down'] as const) {
    const mapped = fromOpenBBBars(openBBTrendRows(direction))
    const provider = new FixtureDataProvider({ [symbol]: mapped.bars })
    const bars = await provider.getDailyBars(symbol, '2026-01-01', '2026-06-10')
    const before = broker.snapshot()
    const technicals = hedgeFundTechnicalsSource.run(
      { symbol, bars, missingVolume: mapped.missingVolume, quantity: 2 },
      { account: before, evaluationTime: time }
    )
    const advisory = redFlagsSource.run(
      { symbol, debtToEquityPercent: 600, netIncome: 10, freeCashFlow: -30, interestCoverage: 1 },
      { account: before, evaluationTime: time }
    )
    const signals = [...technicals, ...advisory],
      action = technicals[0].action,
      llm = demoLLM(action)
    const graph = new TradingAgentsGraph([], false, undefined, {
      llm: { deep: llm, quick: llm },
      riskReview: true,
      riskLimits: { maxPositionPerMarket: 5 }
    })
    const result = await graph.propagate(symbol, time.slice(0, 10), {
      instrument: { type: 'equity', symbol },
      strategySignals: signals,
      account: before,
      evaluationTime: time,
      sources: {
        [hedgeFundTechnicalsSource.id]: hedgeFundTechnicalsSource,
        [redFlagsSource.id]: redFlagsSource
      }
    })
    const close = bars.at(-1)!.close
    broker.setClose(symbol, close)
    const order = result.state.approval
      ? toEquityOrder(result.state.approval, close, broker.snapshot())
      : undefined
    const fill = order ? await broker.createOrder(order) : undefined
    traces.push({
      signals,
      report: result.state.strategySignalsReport,
      proposal: result.state.proposal,
      trader: result.state.traderInvestmentPlan,
      riskDebate: result.state.riskDebateState,
      judge: result.state.judgeDecision,
      verdict: result.state.riskVerdict,
      fundManager: result.state.fundManagerApproval,
      approval: result.state.approval,
      fill,
      before,
      after: broker.snapshot(),
      signal: result.signal,
      prompts: llm.calls,
      mappedBarCount: bars.length
    })
  }
  return traces
}

export async function runAllStrategiesDemo() {
  const time = '2026-01-01T00:00:10Z'
  const eventCases: Array<{ name: string; trace: Awaited<ReturnType<typeof runEventDemo>> }> = []
  for (const [name, fixture] of [
    ['vibe-yes', vibeYes],
    ['vibe-no', vibeNo]
  ] as const) {
    const market = fixture.market as VenueMarket,
      venue = new MockVenue(market.venue, [market])
    eventCases.push({
      name,
      trace: await runEventDemo(
        kalshiVibeSource.run(fixture, { account: venue.snapshot(), evaluationTime: time }),
        kalshiVibeSource,
        venue,
        market,
        time
      )
    })
  }
  for (const direction of ['BULLISH', 'BEARISH'] as const) {
    const market = syntheticMarket(btcInput.marketId, 50, 'polymarket'),
      venue = new MockVenue('polymarket', [market])
    const input = {
      ...btcInput,
      signals: [
        {
          source: 'SpikeDetection',
          direction,
          confidence: 0.8,
          strength: 4 as const,
          timestamp: time
        }
      ]
    } as BtcFusionInput
    eventCases.push({
      name: `btc-${direction.toLowerCase()}`,
      trace: await runEventDemo(
        btc15mFusionSource.run(input, { account: venue.snapshot(), evaluationTime: time }),
        btc15mFusionSource,
        venue,
        market,
        time
      )
    })
  }
  const copyMarket = syntheticMarket(copyInput.marketId, 50, 'polymarket'),
    copyVenue = new MockVenue('polymarket', [copyMarket])
  eventCases.push({
    name: 'copy-trade-sizing',
    trace: await runEventDemo(
      copyTradeSizingSource.run(copyInput as CopyTradeSizingInput, {
        account: copyVenue.snapshot(),
        evaluationTime: time
      }),
      copyTradeSizingSource,
      copyVenue,
      copyMarket,
      time
    )
  })
  for (const [name, market] of [
    ['pykalshi-mapping', fromKalshiMarket(kalshiRaw)],
    ['pmxt-mapping-synthetic-quotes', fromPmxtMarket(pmxtRaw, { priceAsQuote: true })]
  ] as const) {
    const venue = new MockVenue(market.venue, [market])
    const quote = market.outcomes.find(o => o.side === 'YES')!.askCents!
    const source: StrategySource<null> = {
      id: name,
      upstream: 'reviewed mapping fixture',
      run: () => [
        {
          sourceId: name,
          upstream: 'reviewed mapping fixture',
          kind: 'signal',
          instrument: {
            type: 'event',
            venue: market.venue,
            marketId: market.marketId,
            outcome: 'YES'
          },
          action: 'BUY',
          confidence: 0.8,
          reasoning: 'Mapped quote consumed by the existing graph',
          asOf: time,
          sizing: { quantity: 3, limitPriceCents: quote }
        }
      ]
    }
    eventCases.push({
      name,
      trace: await runEventDemo(
        source.run(null, { evaluationTime: time }),
        source,
        venue,
        market,
        time
      )
    })
  }
  let survival = initialSurvivalState()
  for (const equity of [800, 800, 800]) survival = updateSurvivalState(survival, equity, 1000)
  const defensiveMarket = syntheticMarket('DEFENSIVE', 55),
    defensiveVenue = new MockVenue('kalshi', [defensiveMarket])
  const defensiveTicks = [50, 51, 52, 53, 55].map((yesPriceCents, i) => ({
    ticker: 'DEFENSIVE',
    yesPriceCents,
    timestamp: `2026-01-01T00:00:0${i}Z`
  }))
  const defensiveSignals = kalshiMomentumSource.run(
    { ticks: defensiveTicks },
    { account: defensiveVenue.snapshot(), evaluationTime: time }
  )
  const defensive = await runEventDemo(
    defensiveSignals,
    kalshiMomentumSource,
    defensiveVenue,
    defensiveMarket,
    time,
    'BUY',
    toSurvivalPosture(survival)
  )
  return {
    mode: 'paper-fixtures',
    policy:
      'Sequential caller-owned snapshots; no execution ledger or concurrency control. pmxt point-price quotes are explicitly synthetic.',
    momentum: await runMomentumDemo(),
    eventCases,
    gabagool: await runGabagoolDemo(),
    stocks: await runStockDemo(),
    defensive
  }
}

/** The fields of one demo run that the readable summary needs. */
interface SummaryTrace {
  signals: NormalizedSignal[]
  report?: string
  proposal?: {
    sourceId: string
    action: string
    outcome?: string
    limitPriceCents?: number
    quantity: number
  }
  trader?: string
  judge?: { kind: string; maxQuantity?: number }
  verdict?: { allowed: boolean; maxQuantity: number }
  fundManager?: { decision: string; quantity?: number }
  approval?: { finalQuantity: number }
  fill?: unknown
  executionRejection?: string
  reportOnly?: string
  before: AccountSnapshot
  after: AccountSnapshot
  prompts: Array<{ rule: string; prompt: string }>
}

const cashOf = (account: AccountSnapshot) =>
  account.kind === 'event' ? account.portfolio.cashCents : account.cashCents

function describeFill(trace: SummaryTrace): string {
  const fill = trace.fill as
    | {
        status?: string
        reason?: string
        fill?: { quantity: number; priceCents: number }
        order?: { qty: number; side: string }
      }
    | undefined
  if (trace.executionRejection) return `not executed: ${trace.executionRejection}`
  if (!fill) return trace.approval ? 'not executed' : 'no order (no approval)'
  if (fill.status !== 'FILLED')
    return `${fill.status ?? 'REJECTED'}: ${fill.reason ?? 'no reason given'}`
  const size = fill.fill
    ? `${fill.fill.quantity} @ ${fill.fill.priceCents}¢`
    : `${fill.order?.side} ${fill.order?.qty} shares`
  return `FILLED ${size}; cash ${cashOf(trace.before)}¢ → ${cashOf(trace.after)}¢`
}

/** One block per run: the six stages the task's demo flow names, in order. */
export function summarizeRun(name: string, trace: SummaryTrace): string[] {
  const first = trace.signals[0]
  const p = trace.proposal
  const strategy = p
    ? `${p.sourceId}: ${p.action}${p.outcome ? ` ${p.outcome}` : ''}` +
      `${p.limitPriceCents !== undefined ? ` @ ${Number(p.limitPriceCents.toFixed(4))}¢` : ''} × ${p.quantity === Number.MAX_SAFE_INTEGER ? 'gate-sized' : p.quantity}`
    : first
      ? `${first.sourceId}: ${first.action} (no executable proposal${trace.reportOnly ? `: ${trace.reportOnly}` : ''})`
      : 'no signals'
  const reportHead = trace.report?.split('\n')[0] ?? 'none'
  const readers = [
    ...new Set(
      trace.prompts.filter(c => trace.report && c.prompt.includes(reportHead)).map(c => c.rule)
    )
  ]
  const traderDecision = trace.trader
    ? (parseFinalLine(trace.trader, 'FINAL TRANSACTION PROPOSAL:', ['BUY', 'SELL', 'HOLD']).value ??
      'HOLD')
    : 'not reached'
  const judge = trace.judge
    ? `judge ${trace.judge.kind}${trace.judge.maxQuantity !== undefined ? ` ${trace.judge.maxQuantity}` : ''}`
    : 'judge not reached'
  const gate = trace.verdict
    ? `gate ${trace.verdict.allowed ? `allows ≤ ${trace.verdict.maxQuantity}` : 'denies'}`
    : 'gate not reached'
  const manager = trace.fundManager
    ? `Fund Manager ${trace.fundManager.decision}${trace.fundManager.quantity !== undefined ? ` ${trace.fundManager.quantity}` : ''}`
    : 'Fund Manager not consulted'
  const final = trace.approval ? `approved ${trace.approval.finalQuantity}` : 'final HOLD'
  return [
    name,
    `  1 strategy        ${strategy}`,
    `  2 normalized      ${reportHead}`,
    `  3 research input  strategy report read by: ${readers.length ? readers.join(', ') : 'none'}`,
    `  4 trader          ${traderDecision}`,
    `  5 portfolio mgr   ${judge} · ${gate} · ${manager} · ${final}`,
    `  6 execution       ${describeFill(trace)}`
  ]
}

/** Readable chain for every demo run, printed before the full JSON trace. */
export function formatDemoSummary(
  result: Awaited<ReturnType<typeof runAllStrategiesDemo>>
): string {
  const runs: Array<[string, SummaryTrace]> = [
    ...result.momentum.map((t, i): [string, SummaryTrace] => [
      `momentum run ${i + 1}`,
      t as SummaryTrace
    ]),
    ...result.eventCases.map((c): [string, SummaryTrace] => [c.name, c.trace as SummaryTrace]),
    ...Object.entries(result.gabagool).map(([k, t]): [string, SummaryTrace] => [
      `gabagool ${k}`,
      t as SummaryTrace
    ]),
    ...result.stocks.map((t, i): [string, SummaryTrace] => [
      `stock run ${i + 1}`,
      t as SummaryTrace
    ]),
    ['defensive posture', result.defensive as SummaryTrace]
  ]
  return [
    'Third-party strategy → normalized signal → research → Trader → Portfolio Manager → paper execution',
    `${runs.length} runs, ${result.mode}. ${result.policy}`,
    '',
    ...runs.flatMap(([name, trace]) => [...summarizeRun(name, trace), ''])
  ].join('\n')
}
