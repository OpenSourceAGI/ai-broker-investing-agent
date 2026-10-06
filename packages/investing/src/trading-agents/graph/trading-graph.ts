/**
 * Trading Agents Graph
 * Main orchestrator for the multi-agent trading system
 */

import type {
  AgentState,
  InvestDebateState,
  RiskDebateState,
  TradingConfig,
  TradeSignal,
  AnalystType
} from '../types'
import { createLLM } from '../utils/llm-client'
import type { LLMClient } from '../utils/llm-client'
import type {
  AccountSnapshot,
  Instrument,
  NormalizedSignal,
  RiskLimits,
  RiskPosture,
  StrategySource,
  VenueMarket
} from '../../strategy-signals/types'
import { partitionValidSignals } from '../../strategy-signals/validate'
import { renderStrategySignalsReport } from '../../strategy-signals/report'
import { selectProposal } from '../../strategy-signals/proposal'
import { applyRiskGate } from '../../strategy-signals/risk-gate'
import { parseFinalLine } from '../utils/parse-final-line'
import { RiskyAnalyst, SafeAnalyst, NeutralAnalyst } from '../agents/risk-team'
import { RiskJudge } from '../agents/risk-judge'
import { FundManager } from '../agents/fund-manager'
import { FinancialSituationMemory } from '../utils/memory'
import { MarketAnalyst } from '../agents/market-analyst'
import { BullResearcher, BearResearcher, InvestmentJudge } from '../agents/researchers'
import { Trader } from '../agents/trader'
import { NewsAnalyst } from '../agents/news-analyst'

const DEFAULT_CONFIG: TradingConfig = {
  llmProvider: 'groq',
  deepThinkLLM: 'llama3-70b-8192',
  quickThinkLLM: 'llama3-8b-8192',
  temperature: 0.3,
  projectDir: './data',
  apiKeys: {
    groq: process.env.GROQ_API_KEY || ''
  }
}

export interface GraphOptions {
  llm?: { deep: LLMClient; quick: LLMClient }
  riskReview?: boolean
  riskLimits?: RiskLimits
  riskPosture?: RiskPosture
}
export interface GraphRun {
  instrument?: Instrument
  strategySignals?: NormalizedSignal[]
  account?: AccountSnapshot
  evaluationTime?: string
  event?: VenueMarket
  sources?: Record<string, StrategySource<any>>
}
export class TradingAgentsGraph {
  private config: TradingConfig
  private deepThinkingLLM: LLMClient
  private quickThinkingLLM: LLMClient
  private selectedAnalysts: AnalystType[]
  private debug: boolean

  // Memories
  private bullMemory: FinancialSituationMemory
  private bearMemory: FinancialSituationMemory
  private traderMemory: FinancialSituationMemory
  private investJudgeMemory: FinancialSituationMemory
  private riskManagerMemory: FinancialSituationMemory

  // Agents
  private marketAnalyst: MarketAnalyst
  private bullResearcher: BullResearcher
  private bearResearcher: BearResearcher
  private investmentJudge: InvestmentJudge
  private trader: Trader
  private newsAnalyst: NewsAnalyst

  // State tracking
  private currentState: AgentState | null = null
  private ticker: string | null = null
  private logStatesDict: Record<string, any> = {}

  constructor(
    selectedAnalysts: AnalystType[] = ['market', 'social', 'news', 'fundamentals'],
    debug: boolean = false,
    config?: TradingConfig,
    private options: GraphOptions = {}
  ) {
    this.selectedAnalysts = selectedAnalysts
    this.debug = debug
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Initialize LLMs
    this.deepThinkingLLM = options.llm?.deep ?? createLLM(this.config, this.config.deepThinkLLM)
    this.quickThinkingLLM = options.llm?.quick ?? createLLM(this.config, this.config.quickThinkLLM)

    // Initialize memories
    this.bullMemory = new FinancialSituationMemory('bull_memory', this.config)
    this.bearMemory = new FinancialSituationMemory('bear_memory', this.config)
    this.traderMemory = new FinancialSituationMemory('trader_memory', this.config)
    this.investJudgeMemory = new FinancialSituationMemory('invest_judge_memory', this.config)
    this.riskManagerMemory = new FinancialSituationMemory('risk_manager_memory', this.config)

    // Initialize agents
    this.marketAnalyst = new MarketAnalyst(this.deepThinkingLLM)
    this.bullResearcher = new BullResearcher(this.deepThinkingLLM, this.bullMemory)
    this.bearResearcher = new BearResearcher(this.deepThinkingLLM, this.bearMemory)
    this.investmentJudge = new InvestmentJudge(this.quickThinkingLLM, this.investJudgeMemory)
    this.trader = new Trader(this.quickThinkingLLM, this.traderMemory)
    this.newsAnalyst = new NewsAnalyst(this.deepThinkingLLM)
  }

  /**
   * Run the trading agents graph for a company on a specific date
   */
  async propagate(companyName: string, tradeDate: string, run?: GraphRun): Promise<{
    state: AgentState
    signal: TradeSignal
  }> {
    this.ticker = companyName

    // Initialize state
    const initialState = this.createInitialState(companyName, tradeDate)
    const instrument = run?.instrument ?? { type: 'equity' as const, symbol: companyName }
    const evaluationTime = run?.evaluationTime ?? `${tradeDate}T00:00:00Z`
    if (run) {
      initialState.instrument = instrument
      initialState.eventMarket = run.event
      if (run.strategySignals !== undefined) {
        const valid: NormalizedSignal[] = []
        const rejected: ReturnType<typeof partitionValidSignals>['rejected'] = []
        if (!Array.isArray(run.strategySignals)) {
          rejected.push(...partitionValidSignals(run.strategySignals, instrument, evaluationTime).rejected)
        } else {
          // Validate each signal against its own registered source (identity and freshness).
          for (const input of run.strategySignals) {
            const source = run.sources?.[input?.sourceId]
            const part = partitionValidSignals([input], instrument, evaluationTime, source)
            valid.push(...part.valid)
            rejected.push(...part.rejected)
          }
        }
        initialState.strategySignals = valid
        initialState.strategySignalsReport = renderStrategySignalsReport(valid, rejected)
      }
      if (instrument.type === 'event') {
        initialState.marketReport = 'Not applicable for an event contract.'
        initialState.newsReport = 'Not applicable for an event contract.'
      }
    }

    if (this.debug) {
      console.log(`\n=== Starting Analysis for ${companyName} on ${tradeDate} ===\n`)
    }

    // Step 1: Market Analysis (if selected)
    let state = initialState
    if (this.selectedAnalysts.includes('market') && instrument.type !== 'event') {
      if (this.debug) console.log('Running Market Analyst...')
      const marketUpdate = await this.marketAnalyst.analyze(state)
      state = { ...state, ...marketUpdate }
    }

    // For this initial implementation, we'll focus on market analysis
    // Other analysts (social, news, fundamentals) can be added similarly
    if (!state.sentimentReport) state.sentimentReport = 'No social media analysis performed.'

    if (this.selectedAnalysts.includes('news') && instrument.type !== 'event') {
      if (this.debug) console.log('Running News Analyst...')
      const newsUpdate = await this.newsAnalyst.analyze(state)
      state = { ...state, ...newsUpdate }
    } else {
      if (!state.newsReport) state.newsReport = 'No news analysis performed.'
    }

    if (!state.fundamentalsReport) state.fundamentalsReport = 'No fundamentals analysis performed.'

    // Step 2: Investment Debate (Bull vs Bear)
    if (this.debug) console.log('\n=== Investment Debate ===')

    // Initialize debate state
    state.investmentDebateState = {
      bullHistory: '',
      bearHistory: '',
      history: '',
      currentResponse: '',
      judgeDecision: '',
      count: 0
    }

    // Run debate rounds (3 rounds)
    for (let round = 0; round < 3; round++) {
      if (this.debug) console.log(`\nDebate Round ${round + 1}`)

      // Bull speaks
      const bullUpdate = await this.bullResearcher.analyze(state)
      state = { ...state, ...bullUpdate }

      // Bear responds
      const bearUpdate = await this.bearResearcher.analyze(state)
      state = { ...state, ...bearUpdate }
    }

    // Judge makes decision
    if (this.debug) console.log('\nInvestment Judge making decision...')
    const judgeUpdate = await this.investmentJudge.makeDecision(state)
    state = { ...state, ...judgeUpdate }

    // Step 3: Trader makes final decision
    if (this.debug) console.log('\nTrader making final decision...')
    const traderUpdate = await this.trader.makeDecision(state)
    state = { ...state, ...traderUpdate }

    // Extract final decision
    const finalDecision = this.extractDecision(state.traderInvestmentPlan || '')
    state.finalTradeDecision = finalDecision
    if (this.options.riskReview && finalDecision !== 'HOLD') {
      state = await this.runRiskReview(state, finalDecision, instrument, evaluationTime, run)
    }

    // Store current state
    this.currentState = state

    // Log state
    this.logState(tradeDate, state)

    // Process signal
    const signal = this.processSignal(state.finalTradeDecision)
    if (run) signal.timestamp = new Date(evaluationTime)

    if (this.debug) {
      console.log(`\n=== Final Decision: ${signal.action} (Confidence: ${signal.confidence}) ===\n`)
    }

    return { state, signal }
  }

  /**
   * Create initial state for the graph
   */
  private createInitialState(companyName: string, tradeDate: string): AgentState {
    return {
      companyOfInterest: companyName,
      tradeDate,
      messages: [],
      sender: '',
      marketReport: '',
      sentimentReport: '',
      newsReport: '',
      fundamentalsReport: '',
      investmentDebateState: {
        bullHistory: '',
        bearHistory: '',
        history: '',
        currentResponse: '',
        judgeDecision: '',
        count: 0
      },
      investmentPlan: '',
      traderInvestmentPlan: '',
      riskDebateState: {
        riskyHistory: '',
        safeHistory: '',
        neutralHistory: '',
        history: '',
        latestSpeaker: '',
        currentRiskyResponse: '',
        currentSafeResponse: '',
        currentNeutralResponse: '',
        judgeDecision: '',
        count: 0
      },
      finalTradeDecision: ''
    }
  }

  /**
   * Opt-in risk stage: one selected proposal, risk debate, typed judge,
   * deterministic gate, typed Fund Manager, then the minimum of all caps.
   * Any denial, malformed decision or error leaves the trade at HOLD.
   */
  private async runRiskReview(
    initial: AgentState,
    decision: string,
    instrument: Instrument,
    evaluationTime: string,
    run?: GraphRun
  ): Promise<AgentState> {
    let state = initial
    const context = { instrument, account: run?.account, evaluationTime, event: run?.event }
    const selection = selectProposal(decision, state.strategySignals ?? [], context)
    if ('reportOnly' in selection) {
      return { ...state, finalTradeDecision: 'HOLD', riskReviewReason: selection.reportOnly }
    }

    const proposal = selection.proposal
    state = { ...state, proposal }
    try {
      const debaters = [
        new RiskyAnalyst(this.deepThinkingLLM, this.riskManagerMemory),
        new SafeAnalyst(this.deepThinkingLLM, this.riskManagerMemory),
        new NeutralAnalyst(this.deepThinkingLLM, this.riskManagerMemory)
      ]
      for (const debater of debaters) state = { ...state, ...(await debater.analyze(state)) }
      state = { ...state, ...(await new RiskJudge(this.quickThinkingLLM).makeDecision(state)) }

      const source = run?.sources?.[proposal.sourceId]
      let verdict = applyRiskGate(
        proposal,
        context,
        this.options.riskLimits ?? { maxPositionPerMarket: 50 },
        this.options.riskPosture ?? { label: 'Normal', sizeMultiplier: 1, allowNewEntries: true },
        source,
        selection.signal
      )
      // A missing registry entry must not silently bypass forecast/source caps.
      if (proposal.sourceId !== 'trader' && !source) {
        verdict = {
          ...verdict,
          allowed: false,
          maxQuantity: 0,
          reasons: [...verdict.reasons, 'unregistered strategy source']
        }
      }
      state.riskVerdict = verdict

      const judge = state.judgeDecision!
      if (judge.kind === 'BLOCK' || !verdict.allowed) {
        // No approval is possible, so the Fund Manager is not consulted.
        return { ...state, finalTradeDecision: 'HOLD', approval: undefined }
      }

      state = { ...state, ...(await new FundManager(this.quickThinkingLLM).makeDecision(state)) }
      const fundManager = state.fundManagerApproval!
      const quantity = Math.min(
        proposal.quantity,
        verdict.maxQuantity,
        judge.kind === 'REDUCE' ? judge.maxQuantity : Number.MAX_SAFE_INTEGER,
        fundManager.quantity ?? 0
      )
      if (fundManager.decision === 'REJECT' || quantity <= 0) {
        return { ...state, finalTradeDecision: 'HOLD', approval: undefined }
      }
      return {
        ...state,
        approval: { proposal, finalQuantity: quantity, verdict, judge, fundManager, reasons: verdict.reasons }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        ...state,
        finalTradeDecision: 'HOLD',
        approval: undefined,
        riskReviewReason: `risk review error: ${message}`
      }
    }
  }

  /**
   * Extract trading decision from text
   */
  private extractDecision(text: string): string {
    return parseFinalLine(text, 'FINAL TRANSACTION PROPOSAL:', ['BUY', 'SELL', 'HOLD']).value ?? 'HOLD'
  }

  /**
   * Process a trading signal
   */
  private processSignal(decision: string): TradeSignal {
    const action = decision as 'BUY' | 'SELL' | 'HOLD'
    return {
      action,
      confidence: 0.75, // Can be enhanced with more sophisticated confidence scoring
      reasoning: `Based on multi-agent analysis and debate`,
      timestamp: new Date()
    }
  }

  /**
   * Log the final state
   */
  private logState(tradeDate: string, state: AgentState): void {
    this.logStatesDict[tradeDate] = {
      companyOfInterest: state.companyOfInterest,
      tradeDate: state.tradeDate,
      marketReport: state.marketReport,
      sentimentReport: state.sentimentReport,
      newsReport: state.newsReport,
      fundamentalsReport: state.fundamentalsReport,
      investmentDebateState: {
        bullHistory: state.investmentDebateState.bullHistory,
        bearHistory: state.investmentDebateState.bearHistory,
        history: state.investmentDebateState.history,
        currentResponse: state.investmentDebateState.currentResponse,
        judgeDecision: state.investmentDebateState.judgeDecision
      },
      traderInvestmentDecision: state.traderInvestmentPlan,
      finalTradeDecision: state.finalTradeDecision
    }
  }

  /**
   * Reflect on decisions and update memory
   */
  async reflectAndRemember(returnsLosses: number): Promise<void> {
    if (!this.currentState) return

    const situation = `${this.currentState.marketReport}\n${this.currentState.newsReport}`
    const decision = this.currentState.finalTradeDecision
    const recommendation = `Decision: ${decision}, Outcome: ${returnsLosses > 0 ? 'Positive' : 'Negative'} (${returnsLosses.toFixed(2)}%)`

    // Add memories to all agents
    const memory = {
      situation,
      decision,
      outcome: returnsLosses,
      recommendation,
      timestamp: new Date()
    }

    await this.bullMemory.addMemory(memory)
    await this.bearMemory.addMemory(memory)
    await this.traderMemory.addMemory(memory)
    await this.investJudgeMemory.addMemory(memory)
  }

  /**
   * Get all logged states
   */
  getLogStates(): Record<string, any> {
    return this.logStatesDict
  }

  /**
   * Get the current state
   */
  getCurrentState(): AgentState | null {
    return this.currentState
  }
}
