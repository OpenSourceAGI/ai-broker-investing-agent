"use client"

import { useState } from "react"
import { TrendingUp, ArrowLeftRight, Zap, Timer, ChevronRight, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { InfoTooltip } from "@/components/landing/info-tooltip"

const tradingViewStrategies = [
  "RSI-Adaptive T3 & SAR Strategy",
  "Moving Average Band Strategy",
  "Quasimodo Pattern Strategy Back Test",
  "DEMA ATR Strategy",
  "RSI Strategy",
  "Momentum Reversal / Dip Buyer [Score Based]",
  "Strategy: HMA 50 + Supertrend Sniper",
  "EMA Cross + RSI + ADX - Autotrade Strategy V2",
  "Triple EMA + RSI + ATR",
  "RSI + MACD Multi-Timeframe Strategy",
  "Range Trading Strategy",
  "Bollinger Bands Mean Reversion using RSI",
  "Double MOST with Pivot and EMA",
  "RSI BREAKOUT SIGNALS",
  "Macketings 1min Scalping",
  "Hash Momentum Strategy",
  "EMA Trend Pro v5.0 5M ONLY",
  "Retracement Strategy",
  "Rasta Long/Short",
  "BB + RSI Breakout Strategy",
  "ATR Trend + RSI Pullback Strategy [Profit-Focused]",
  "W%R Pullback+EMA Trend",
  "EMA + Sessions + RSI Strategy v1.0",
  "ParabolicSAR+EMA[TS_Indie]",
  "Fractal Break Strategy with Time Filter",
  "Options Scalper v2 - SPY/QQQ",
  "Third eye • Strategy",
  "Vinz Win BTC – STRATEGY AUTO 1m",
  "MOMO – Imbalance Trend (SIMPLE BUY/SELL)",
  "Safe Supertrend Strategy (No Repaint)",
  "XAUUSD 1m SMC Zones ",
  "Ultra Reversion DCA Strategy with Manual Leverage",
  "Mirror Blocks: Strategy",
]

const strategies = [
  {
    id: "momentum",
    name: "Momentum Trading",
    type: "Trend Following",
    icon: TrendingUp,
    timeframe: "Daily",
    winRate: "50-60%",
    riskLevel: "Moderate",
    bestMarket: "Trending",
    color: "emerald",
    description: "Stocks in motion tend to stay in motion. Buy when momentum is building, sell when it's fading.",
    philosophy: "The trend is your friend",
    entryConditions: [
      "RSI recovery (crosses above 30)",
      "MACD crossover (bullish signal)",
      "Volume surge (>1.5x average)",
      "Strong trend confirmed (ADX > 25)",
    ],
    exitConditions: [
      "Overbought conditions (RSI > 70)",
      "MACD reversal (bearish crossover)",
      "Stop-loss triggers (-2%)",
      "Take-profit targets (+4%)",
    ],
    bestFor: ["Strong trending markets", "Sector strength"],
    avoid: ["Choppy markets", "Unclear trend"],
  },
  {
    id: "meanreversion",
    name: "Mean Reversion",
    type: "Statistical",
    icon: ArrowLeftRight,
    timeframe: "Daily",
    winRate: "55-65%",
    riskLevel: "Moderate",
    bestMarket: "Range-bound",
    color: "blue",
    description: "Prices tend to revert to their statistical mean. Buy extreme lows, sell extreme highs.",
    philosophy: "What goes up must come down",
    entryConditions: [
      "Lower Bollinger Band touch",
      "Severe oversold (RSI < 25)",
      "Z-score deviation (<-2 standard deviations)",
    ],
    exitConditions: [
      "Middle Bollinger Band cross",
      "RSI normalization (>50)",
      "Profit targets (+3%)",
    ],
    bestFor: ["Range-bound markets", "High volatility"],
    avoid: ["Strong trends", "Breakout scenarios"],
  },
  {
    id: "breakout",
    name: "Breakout Trading",
    type: "Volatility",
    icon: Zap,
    timeframe: "Daily",
    winRate: "45-55%",
    riskLevel: "Higher",
    bestMarket: "Consolidation",
    color: "amber",
    description:
      "After consolidation, prices often make explosive moves. Enter early in breakout with volume confirmation.",
    philosophy: "Catch the big moves early",
    entryConditions: [
      "20-day high breakout",
      "Volume surge (2x average)",
      "ATR expansion (volatility increasing)",
    ],
    exitConditions: [
      "ATR trailing stop (dynamic)",
      "Support break (trend reversal)",
      "Profit/loss targets (+6%/-2.5%)",
    ],
    bestFor: ["Consolidation periods", "Catalysts", "Earnings"],
    avoid: ["Already extended moves", "Low volume"],
  },
  {
    id: "scalping",
    name: "Day Trading Scalp",
    type: "High Frequency",
    icon: Timer,
    timeframe: "1-5 minutes",
    winRate: "50-55%",
    riskLevel: "Lower",
    bestMarket: "High Liquidity",
    color: "purple",
    description: "Capture small intraday moves with quick entries and exits. High win rate, small profits per trade.",
    philosophy: "Small profits, many times",
    entryConditions: [
      "EMA crossover (fast > slow)",
      "Price > VWAP (bullish momentum)",
      "Tight spreads (<$0.10)",
      "Momentum surge (short-term)",
    ],
    exitConditions: [
      "Quick profit targets (+0.5%)",
      "Tight stops (-0.3%)",
      "Time limits (5-minute max hold)",
    ],
    bestFor: ["High liquidity stocks", "Tight spreads", "Active hours (10AM-3PM)"],
    avoid: ["Market open/close", "Low volume periods", "Wide spreads"],
  },
]

const colorVariants = {
  emerald: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    activeBg: "bg-emerald-500/20",
    activeBorder: "border-emerald-500",
  },
  blue: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
    activeBg: "bg-blue-500/20",
    activeBorder: "border-blue-500",
  },
  amber: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    activeBg: "bg-amber-500/20",
    activeBorder: "border-amber-500",
  },
  purple: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-400",
    activeBg: "bg-purple-500/20",
    activeBorder: "border-purple-500",
  },
}

export function StrategiesSection() {
  const [activeStrategy, setActiveStrategy] = useState(strategies[0])
  const colors = colorVariants[activeStrategy.color as keyof typeof colorVariants]

  return (
    <section id="strategies" className="border-t border-border px-4 py-24 sm:px-6 lg:px-8 overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 flex flex-col items-center gap-8 lg:flex-row lg:items-start lg:gap-12">
          <div className="flex-1 text-center lg:text-left">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Algorithmic Trading Strategies{" "}
              <InfoTooltip iconClassName="h-5 w-5">
                Four AI-powered algorithmic strategies leveraging technical indicators (MACD, RSI,
                Bollinger Bands, ATR) for different market conditions. Each strategy is powered by
                our multi-agent system analyzing chart patterns, volume signals, and momentum
                indicators with precision timing.
              </InfoTooltip>
            </h2>
          </div>
          <div className="relative h-48 w-full max-w-xs overflow-hidden rounded-xl border border-border lg:h-56 lg:max-w-md">
            <Image
              src="/images/algo-bot-timing.png"
              alt="AI Trading Floor with Multiple Agents"
              width={400}
              height={400}
              className="items-center justify-center object-cover w-full h-full"
            />

          </div>
        </div>

        {/* TradingView Expert Strategies Card */}
        <div className="mb-12 rounded-2xl border border-purple-500/30 bg-purple-500/5 p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                Select Strategies to Backtest
                <InfoTooltip>
                  Choose from TradingView expert algorithms — like having a personal hedge fund
                  team.
                </InfoTooltip>
              </h3>
            </div>
            <div className="flex items-center gap-2 text-purple-400">
              <Zap className="h-5 w-5" />
              <span className="text-sm font-medium">1000+ Expert Strategies</span>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-card/50 p-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tradingViewStrategies.map((strategy, idx) => (
                <button
                  key={idx}
                  className="group flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm transition-all hover:border-purple-500/50 hover:bg-purple-500/5"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/10 text-xs font-medium text-purple-400 transition-colors group-hover:bg-purple-500/20">
                    {idx + 1}
                  </div>
                  <span className="flex-1 text-muted-foreground transition-colors group-hover:text-foreground">
                    {strategy}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        </div>


      </div>
    </section>
  )
}
