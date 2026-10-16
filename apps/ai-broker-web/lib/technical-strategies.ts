export interface TechnicalStrategyDefinition {
  id: string;
  name: string;
  description: string;
}

export const TECHNICAL_STRATEGIES = [
  {
    id: "buy-hold",
    name: "Buy Hold",
    description: "Buy once and hold the asset for the full backtest period.",
  },
  {
    id: "awesome-oscillator",
    name: "Awesome Oscillator",
    description:
      "Uses the Awesome Oscillator to identify changes in market momentum.",
  },
  {
    id: "rsi-2",
    name: "RSI 2",
    description:
      "Uses a two-period relative strength index for short-term mean-reversion signals.",
  },
  {
    id: "ichimoku-cloud",
    name: "Ichimoku Cloud",
    description:
      "Uses Ichimoku Cloud levels to identify trend and momentum signals.",
  },
  {
    id: "stochastic-oscillator",
    name: "Stochastic Oscillator",
    description:
      "Uses the stochastic oscillator to identify momentum reversals.",
  },
  {
    id: "williams-r",
    name: "Williams R",
    description:
      "Uses Williams %R to identify overbought and oversold conditions.",
  },
  {
    id: "apo",
    name: "Absolute Price Oscillator (APO)",
    description:
      "Compares fast and slow moving averages with the Absolute Price Oscillator.",
  },
  {
    id: "aroon",
    name: "Aroon Strategy",
    description: "Uses Aroon indicators to identify emerging trends.",
  },
  {
    id: "bop",
    name: "Balance of Power (BOM)",
    description:
      "Uses Balance of Power to compare buying and selling pressure.",
  },
  {
    id: "cfo",
    name: "Chande Forecast Oscillator (CFO)",
    description:
      "Uses the Chande Forecast Oscillator to compare price with its forecast.",
  },
  {
    id: "kdj",
    name: "KDJ Strategy",
    description: "Uses KDJ oscillator signals to identify momentum changes.",
  },
  {
    id: "macd",
    name: "MACD Strategy",
    description: "Uses moving-average convergence and divergence signals.",
  },
  {
    id: "psar",
    name: "Parabolic SAR",
    description: "Uses Parabolic SAR reversals to follow price trends.",
  },
  {
    id: "typical-price",
    name: "Typical Price",
    description:
      "Uses the average of high, low, and close prices to generate signals.",
  },
  {
    id: "vortex",
    name: "Vortex Strategy",
    description:
      "Uses positive and negative Vortex indicators to identify trend direction.",
  },
  {
    id: "acceleration-bands",
    name: "Acceleration Bands",
    description: "Uses Acceleration Bands to identify volatility breakouts.",
  },
  {
    id: "bollinger-bands",
    name: "Bollinger Bands",
    description:
      "Uses Bollinger Bands to identify price movement relative to volatility.",
  },
  {
    id: "projection-oscillator",
    name: "Projection Oscillator",
    description:
      "Uses the Projection Oscillator to measure price within its projected range.",
  },
  {
    id: "cmf",
    name: "Chaikin Money Flow (CMF)",
    description:
      "Uses Chaikin Money Flow to measure volume-weighted buying and selling pressure.",
  },
  {
    id: "emv",
    name: "Ease of Movement (EMV)",
    description: "Uses Ease of Movement to relate price movement to volume.",
  },
  {
    id: "force-index",
    name: "Force Index",
    description:
      "Uses Force Index to combine price direction, magnitude, and volume.",
  },
  {
    id: "mfi",
    name: "Money Flow Index",
    description:
      "Uses the Money Flow Index to measure price and volume momentum.",
  },
  {
    id: "nvi",
    name: "Negative Volume Index (NVI)",
    description:
      "Uses the Negative Volume Index to track price changes on lower-volume periods.",
  },
  {
    id: "vwap",
    name: "Volume Weighted Average Price",
    description:
      "Uses volume-weighted average price as a reference for price signals.",
  },
] as const satisfies readonly TechnicalStrategyDefinition[];

export const TECHNICAL_STRATEGY_NAME_BY_ID: Readonly<Record<string, string>> =
  Object.fromEntries(TECHNICAL_STRATEGIES.map(({ id, name }) => [id, name]));

export const TECHNICAL_STRATEGY_ID_BY_NAME: Readonly<Record<string, string>> =
  Object.fromEntries(TECHNICAL_STRATEGIES.map(({ id, name }) => [name, id]));
