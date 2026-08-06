/**
 * Fetch-based API clients for prediction-market data providers and the x402
 * micropayment protocol (ported/adapted from PredictOS).
 *
 * Namespaced re-exports avoid name collisions between providers that share
 * type/helper names (e.g. `getKalshiMarketsByEvent`, `PolymarketMarket`).
 */
export * as dflow from "./dflow";
export * as dome from "./dome";
export * as polyfactual from "./polyfactual";
export * as polymarket from "./polymarket";
export * as x402 from "./x402";
