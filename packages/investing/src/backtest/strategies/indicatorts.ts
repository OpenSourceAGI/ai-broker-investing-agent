import { STRATEGY_INFOS, type Asset } from "indicatorts";
import type { BacktestStrategy } from "../strategy";
import type { Action, Bar } from "../types";

/**
 * The indicatorts strategies the stock page has always offered, keyed by the
 * short ids the UI already uses.
 */
const INDICATORTS_STRATEGIES: { id: string; name: string; description: string; walkForward?: boolean }[] = [
  { id: "buy-hold", name: "Buy Hold", description: "Buy on the first bar and hold to the end; the baseline every other strategy is compared to." },
  { id: "awesome-oscillator", name: "Awesome Oscillator", description: "Momentum from the gap between 5- and 34-period averages of the median price." },
  { id: "rsi-2", name: "RSI 2", description: "Two-period RSI mean reversion: buy deeply oversold, sell overbought." },
  { id: "ichimoku-cloud", name: "Ichimoku Cloud", description: "Trend signals from the conversion and base lines relative to the cloud." },
  { id: "stochastic-oscillator", name: "Stochastic Oscillator", description: "Buys when %K is oversold and sells when it is overbought." },
  { id: "williams-r", name: "Williams R", description: "Williams %R overbought and oversold levels." },
  { id: "apo", name: "Absolute Price Oscillator (APO)", description: "Difference between fast and slow EMAs; trades its sign changes." },
  { id: "aroon", name: "Aroon Strategy", description: "Aroon up and down lines to time new highs and lows." },
  { id: "bop", name: "Balance of Power (BOM)", description: "Buyer versus seller strength from each bar's open, close and range." },
  // indicatorts fits one regression over the whole series, so a single run
  // would let every bar see later prices. Evaluate it walk-forward instead.
  { id: "cfo", name: "Chande Forecast Oscillator (CFO)", description: "Distance between the close and its linear-regression forecast, refit each day on the history to date.", walkForward: true },
  { id: "kdj", name: "KDJ Strategy", description: "Stochastic variant using the K, D and J lines." },
  { id: "macd", name: "MACD Strategy", description: "MACD line crossing its signal line." },
  { id: "psar", name: "Parabolic SAR", description: "Trailing stop-and-reverse points that flip with the trend." },
  { id: "typical-price", name: "Typical Price", description: "Trades the typical price against its moving average." },
  { id: "vortex", name: "Vortex Strategy", description: "Positive and negative vortex lines crossing." },
  { id: "acceleration-bands", name: "Acceleration Bands", description: "Breakouts beyond bands that widen with volatility." },
  { id: "bollinger-bands", name: "Bollinger Bands", description: "Mean reversion at the 20-period, two-standard-deviation bands." },
  { id: "projection-oscillator", name: "Projection Oscillator", description: "Close position within regression-projected bands." },
  { id: "cmf", name: "Chaikin Money Flow (CMF)", description: "Volume-weighted accumulation and distribution." },
  { id: "emv", name: "Ease of Movement (EMV)", description: "Price change relative to volume." },
  { id: "force-index", name: "Force Index", description: "Price change multiplied by volume." },
  { id: "mfi", name: "Money Flow Index", description: "Volume-weighted RSI with overbought and oversold levels." },
  { id: "nvi", name: "Negative Volume Index (NVI)", description: "Tracks price on days when volume falls." },
  { id: "vwap", name: "Volume Weighted Average Price", description: "Trades the close against the volume-weighted average price." },
];

function toAsset(bars: Bar[]): Asset {
  return {
    dates: bars.map((b) => new Date(`${b.date}T00:00:00Z`)),
    openings: bars.map((b) => b.open),
    closings: bars.map((b) => b.close),
    highs: bars.map((b) => b.high),
    lows: bars.map((b) => b.low),
    volumes: bars.map((b) => b.volume),
  };
}

const toAction = (a: number): Action => (a === 1 ? 1 : a === -1 ? -1 : 0);

export const indicatortsStrategies: BacktestStrategy[] = INDICATORTS_STRATEGIES.map(
  ({ id, name, description, walkForward }) => {
    const info = STRATEGY_INFOS.find((s) => s.name === name);
    if (!info) throw new Error(`indicatorts has no strategy named "${name}"`);
    const run = (bars: Bar[]) => info.strategy(toAsset(bars)).map(toAction);
    return {
      id,
      name,
      description,
      provider: "builtin",
      assetClasses: ["equity"],
      minBars: 2,
      params: [],
      signals: walkForward
        ? (bars) => bars.map((_, i) => run(bars.slice(0, i + 1)).at(-1) ?? 0)
        : run,
    };
  },
);
