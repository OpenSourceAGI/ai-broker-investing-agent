export type {
  Outcome,
  Instrument,
  NormalizedSignal,
  TradeProposal,
  AccountSnapshot,
  SourceContext,
  ProposalContext,
  SourceGuard,
  StrategySource,
  RiskLimits,
  RiskPosture,
  RiskVerdict,
  JudgeDecision,
  FundManagerApproval,
  ExecutionApproval,
  VenueMarket,
  VenueAdapter,
  MarketDataProvider,
  RejectedSignal
} from './types'
export { toTradeSignal } from './types'
export {
  validateSignal,
  validateLimits,
  validatePosture,
  validateAccount,
  partitionValidSignals
} from './validate'
export { toStructuredReport, formatStructuredReport, renderStrategySignalsReport } from './report'
export { selectProposal, proposalId } from './proposal'
export { applyRiskGate } from './risk-gate'
export { toExecutableCents, toPredictionMarketIntent, toEquityOrder } from './execution'
export type { EquityOrder, EquityOrderClient } from './execution'
export { MockVenue } from './venues/mock-venue'
export { MockEquityBroker } from './venues/mock-equity-broker'
export { FixtureDataProvider } from './data/fixture-data-provider'
export { kalshiMomentumSource } from './sources/kalshi-momentum'
export { kalshiVibeSource } from './sources/kalshi-vibe'
export type { KalshiVibeInput } from './sources/kalshi-vibe'
export {
  kalshiVibeGuard,
  vibeBuyFailure,
  vibeKellyQuantity,
  VIBE_LIMITS
} from './sources/kalshi-vibe-guards'
export { fromKalshiMarket } from './venues/kalshi-venue-mapping'
export { fromPmxtMarket } from './venues/pmxt-venue-mapping'
export type { PmxtMappingOptions } from './venues/pmxt-venue-mapping'
export {
  hedgeFundTechnicalsSource,
  technicalRsi,
  technicalEma,
  technicalBollinger,
  technicalAtr,
  technicalAdx,
  technicalHurst,
  combineTechnicalSignals,
  analyzeTechnicals
} from './sources/hedge-fund-technicals'
export type {
  TechnicalsInput,
  TechnicalGroup,
  TechnicalGroups
} from './sources/hedge-fund-technicals'
export { redFlagsSource } from './sources/red-flags'
export type { RedFlagsInput } from './sources/red-flags'
export { initialSurvivalState, updateSurvivalState, toSurvivalPosture } from './survival-posture'
export type { SurvivalMode, SurvivalState } from './survival-posture'
export { fromOpenBBBars } from './data/openbb-mapping'
export { gabagoolSource } from './sources/gabagool'
export type { GabagoolInput } from './sources/gabagool'
export { btc15mFusionSource, btc15mGuard } from './sources/btc15m-fusion'
export type { BtcFusionInput } from './sources/btc15m-fusion'
export { copyTradeSizingSource } from './sources/copy-trade-sizing'
export type { CopyTradeSizingInput } from './sources/copy-trade-sizing'
