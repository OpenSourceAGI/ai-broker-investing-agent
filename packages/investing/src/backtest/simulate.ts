import {
  COST_LIMITS,
  DEFAULT_COSTS,
  type Action,
  type BacktestMetrics,
  type Bar,
  type CostModel,
  type Trade,
} from "./types";

const TRADING_DAYS_PER_YEAR = 252;

/**
 * Fill in missing cost fields with defaults and reject values outside
 * `COST_LIMITS`. Returns the first problem found as `error`.
 */
export function validateCosts(input: Partial<CostModel>): { costs: CostModel } | { error: string } {
  const costs = { ...DEFAULT_COSTS };
  for (const key of Object.keys(COST_LIMITS) as (keyof CostModel)[]) {
    const value = input[key];
    if (value === undefined) continue;
    const { min, max } = COST_LIMITS[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      return { error: `${key} must be a number from ${min} to ${max}` };
    }
    costs[key] = value;
  }
  return { costs };
}

/**
 * Long-only simulation of `actions` over `bars`. Fills happen at the bar's
 * close, moved against the trader by `slippageBps`, and pay `feeBps` of their
 * notional. A position still open on the last bar is closed there.
 */
export function simulate(
  bars: Bar[],
  actions: Action[],
  initialCapital: number,
  costs: CostModel,
): BacktestMetrics {
  if (actions.length !== bars.length) {
    throw new Error(`actions length ${actions.length} does not match bars length ${bars.length}`);
  }
  if (!(initialCapital > 0)) {
    throw new Error("initial capital must be greater than 0");
  }

  const fee = costs.feeBps / 10_000;
  const slip = costs.slippageBps / 10_000;
  const size = costs.positionSizePct / 100;

  let cash = initialCapital;
  let shares = 0;
  let entryCost = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  const trades: Trade[] = [];
  const equity: number[] = [];

  const sell = (bar: Bar) => {
    const price = bar.close * (1 - slip);
    const sellFee = shares * price * fee;
    const proceeds = shares * price - sellFee;
    cash += proceeds;
    trades.push({ side: "SELL", date: bar.date, price, shares, fee: sellFee });
    if (proceeds > entryCost) winningTrades++;
    else if (proceeds < entryCost) losingTrades++;
    shares = 0;
    entryCost = 0;
  };

  bars.forEach((bar, i) => {
    const last = i === bars.length - 1;
    if (actions[i] === 1 && shares === 0 && !last) {
      const price = bar.close * (1 + slip);
      const qty = Math.floor((cash * size) / (price * (1 + fee)));
      if (qty > 0) {
        const buyFee = qty * price * fee;
        entryCost = qty * price + buyFee;
        cash -= entryCost;
        shares = qty;
        trades.push({ side: "BUY", date: bar.date, price, shares: qty, fee: buyFee });
      }
    } else if (actions[i] === -1 && shares > 0) {
      sell(bar);
    }
    if (last && shares > 0) sell(bar);
    equity.push(cash + shares * bar.close);
  });

  const finalValue = cash;
  const totalTrades = trades.filter((t) => t.side === "SELL").length;

  return {
    finalValue,
    totalReturn: finalValue - initialCapital,
    totalReturnPercent: ((finalValue - initialCapital) / initialCapital) * 100,
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
    maxDrawdownPercent: maxDrawdownPercent([initialCapital, ...equity]),
    sharpeRatio: annualizedSharpe(equity),
    trades,
  };
}

function maxDrawdownPercent(curve: number[]): number {
  let peak = curve[0];
  let worst = 0;
  for (const value of curve) {
    peak = Math.max(peak, value);
    if (peak > 0) worst = Math.max(worst, (peak - value) / peak);
  }
  return worst * 100;
}

function annualizedSharpe(curve: number[]): number | null {
  if (curve.length < 3) return null;
  const returns = curve.slice(1).map((v, i) => v / curve[i] - 1);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (!(std > 0)) return null;
  return (mean / std) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}
