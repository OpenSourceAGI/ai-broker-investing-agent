import {
  DEFAULT_KALSHI_MOMENTUM_CONFIG,
  createKalshiMomentumState,
  evaluateKalshiMomentumTick,
} from "../../prediction-markets/strategies/kalshi-momentum";
import type { BacktestStrategy } from "../strategy";
import type { Action } from "../types";

/**
 * Backtest adapter over the existing Kalshi momentum port
 * (`prediction-markets/strategies/kalshi-momentum.ts`, from
 * `third-party-trading-bots/kalshi-bot-api/examples/momentum_bot.py`, MIT).
 *
 * Bars are read as YES prices in cents. The engine is long-only, so only the
 * YES side is simulated: a NO entry is held as no position.
 */
export const kalshiMomentum: BacktestStrategy = {
  id: "kalshi-momentum",
  name: "Kalshi momentum",
  description:
    "Port of PyKalshi's momentum bot: enters after three consecutive YES-price moves in one " +
    "direction and exits on a 5c profit target, a 3c stop loss, or a reversal. Backtests the YES side.",
  provider: "third-party",
  source: { repo: "kalshi-bot-api", file: "examples/momentum_bot.py", license: "MIT" },
  assetClasses: ["prediction-market"],
  minBars: 4,
  params: [],
  unsupportedReason:
    "Trades binary event contracts priced in cents (YES/NO). There is no documented mapping from a stock's price to an event contract, so it cannot be backtested on stocks.",
  signals(bars) {
    const config = DEFAULT_KALSHI_MOMENTUM_CONFIG;
    let state = createKalshiMomentumState();
    return bars.map((bar): Action => {
      const { state: next, intent } = evaluateKalshiMomentumTick(
        { ticker: "BACKTEST", timestamp: `${bar.date}T00:00:00Z`, yesPriceCents: bar.close },
        state,
        config,
      );
      state = next;
      if (intent.action === "BUY" && intent.outcome === "YES") {
        state = {
          ...state,
          position: { ticker: "BACKTEST", outcome: "YES", quantity: intent.quantity, entryPriceCents: intent.priceCents },
        };
        return 1;
      }
      if (intent.action === "SELL") {
        state = { ...state, position: undefined };
        return -1;
      }
      return 0;
    });
  },
};
