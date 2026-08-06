/**
 * Agent entry points (ported/adapted from PredictOS Supabase edge functions).
 *
 * Each agent's business logic is exposed as a plain async function. The HTTP /
 * CORS wrappers from the original Deno edge functions have been dropped.
 *
 * Per-agent type modules are re-exported under namespaces to avoid name
 * collisions between agents that share type names (e.g. `MarketAnalysis`,
 * `PmType`, `DataProvider`).
 */

// --- Agent functions ---
export { eventAnalysisAgent } from "./eventAnalysisAgent";
export { bookmakerAgent } from "./bookmakerAgent";
export { mapperAgent } from "./mapperAgent";
export { arbitrageFinder } from "./arbitrageFinder";
export { analyzeEventMarkets } from "./analyzeEventMarkets";
export { polyfactualResearch } from "./polyfactualResearch";
export { polymarketPutOrder } from "./polymarketPutOrder";
export { polymarketPositionTracker } from "./polymarketPositionTracker";
export { polymarketUpDown15LimitOrderBot } from "./polymarketUpDown15LimitOrderBot";
export { x402Seller } from "./x402Seller";
export { getEvents } from "./getEvents";

// --- Per-agent type namespaces ---
export type * as EventAnalysisAgentTypes from "./eventAnalysisAgent.types";
export type * as BookmakerAgentTypes from "./bookmakerAgent.types";
export type * as MapperAgentTypes from "./mapperAgent.types";
export type * as ArbitrageFinderTypes from "./arbitrageFinder.types";
export type * as AnalyzeEventMarketsTypes from "./analyzeEventMarkets.types";
export type * as PolyfactualResearchTypes from "./polyfactualResearch.types";
export type * as PolymarketPutOrderTypes from "./polymarketPutOrder.types";
export type * as PolymarketPositionTrackerTypes from "./polymarketPositionTracker.types";
export type * as PolymarketUpDown15LimitOrderBotTypes from "./polymarketUpDown15LimitOrderBot.types";
export type * as X402SellerTypes from "./x402Seller.types";
export type * as GetEventsTypes from "./getEvents.types";
