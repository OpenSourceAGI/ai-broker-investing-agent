"use client"

import { useState } from "react"
import { TrendingUp, ArrowLeftRight, Zap, Timer, Activity, Target, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"

const strategies = [
  {
    id: "momentum",
    name: "Momentum",
    icon: TrendingUp,
    enabled: true,
    status: "active",
    winRate: 58,
    todayPnL: 1250,
    trades: 3,
    signal: "BUY",
    signalStrength: 0.82,
    indicators: {
      rsi: 42,
      macd: "Bullish",
      volume: "1.8x",
      adx: 28,
    },
  },
  {
    id: "meanreversion",
    name: "Mean Reversion",
    icon: ArrowLeftRight,
    enabled: true,
    status: "waiting",
    winRate: 62,
    todayPnL: 680,
    trades: 2,
    signal: "HOLD",
    signalStrength: 0.45,
    indicators: {
      bollinger: "Middle",
      zScore: -0.8,
      stochastic: 45,
      rsi: 52,
    },
  },
  {
    id: "breakout",
    name: "Breakout",
    icon: Zap,
    enabled: true,
    status: "monitoring",
    winRate: 48,
    todayPnL: -320,
    trades: 1,
    signal: "WAIT",
    signalStrength: 0.38,
    indicators: {
      range: "2.1%",
      atr: "$8.50",
      volume: "0.9x",
      days: 4,
    },
  },
  {
    id: "scalping",
    name: "Scalping",
    icon: Timer,
    enabled: false,
    status: "disabled",
    winRate: 54,
    todayPnL: 0,
    trades: 0,
    signal: "OFF",
    signalStrength: 0,
    indicators: {
      ema9: "$385.20",
      ema21: "$384.90",
      vwap: "$384.50",
      spread: "$0.05",
    },
  },
]

const statusColors = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  waiting: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  monitoring: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  disabled: "bg-muted text-muted-foreground border-border",
}

const signalColors = {
  BUY: "bg-emerald-500/20 text-emerald-400",
  SELL: "bg-red-500/20 text-red-400",
  HOLD: "bg-blue-500/20 text-blue-400",
  WAIT: "bg-amber-500/20 text-amber-400",
  OFF: "bg-muted text-muted-foreground",
}

export function StrategiesPanel() {
  const [strategyStates, setStrategyStates] = useState(
    strategies.reduce((acc, s) => ({ ...acc, [s.id]: s.enabled }), {} as Record<string, boolean>),
  )

  const toggleStrategy = (id: string) => {
    setStrategyStates((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const totalPnL = strategies.reduce((sum, s) => sum + s.todayPnL, 0)
  const totalTrades = strategies.reduce((sum, s) => sum + s.trades, 0)
  const activeStrategies = Object.values(strategyStates).filter(Boolean).length

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            Trading Strategies
          </CardTitle>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Today:</span>
              <span className={cn("font-semibold", totalPnL >= 0 ? "text-emerald-400" : "text-red-400")}>
                {totalPnL >= 0 ? "+" : ""}
                {totalPnL.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Trades:</span>
              <span className="font-semibold text-foreground">{totalTrades}</span>
            </div>
            <Badge variant="outline" className="border-primary/30 text-primary">
              {activeStrategies}/4 Active
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {strategies.map((strategy) => {
            const isEnabled = strategyStates[strategy.id]
            return (
              <div
                key={strategy.id}
                className={cn(
                  "rounded-xl border p-4 transition-all",
                  isEnabled ? "border-border bg-secondary/30" : "border-border/50 bg-muted/20 opacity-60",
                )}
              >
                {/* Header */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        isEnabled ? "bg-primary/10" : "bg-muted",
                      )}
                    >
                      <strategy.icon className={cn("h-5 w-5", isEnabled ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{strategy.name}</h3>
                      <Badge
                        variant="outline"
                        className={cn("text-xs", statusColors[isEnabled ? strategy.status : "disabled"])}
                      >
                        {isEnabled ? strategy.status : "disabled"}
                      </Badge>
                    </div>
                  </div>
                  <Switch checked={isEnabled} onCheckedChange={() => toggleStrategy(strategy.id)} />
                </div>

                {/* Signal */}
                <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-card/50 p-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Signal</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={signalColors[strategy.signal as keyof typeof signalColors]}>
                      {strategy.signal}
                    </Badge>
                    {isEnabled && strategy.signalStrength > 0 && (
                      <span className="text-sm font-medium text-muted-foreground">
                        {(strategy.signalStrength * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="mb-4 grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className="font-semibold text-foreground">{strategy.winRate}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">P&L</p>
                    <p
                      className={cn(
                        "font-semibold",
                        strategy.todayPnL > 0
                          ? "text-emerald-400"
                          : strategy.todayPnL < 0
                            ? "text-red-400"
                            : "text-muted-foreground",
                      )}
                    >
                      {strategy.todayPnL > 0 ? "+" : ""}
                      {strategy.todayPnL === 0 ? "-" : `$${strategy.todayPnL}`}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Trades</p>
                    <p className="font-semibold text-foreground">{strategy.trades}</p>
                  </div>
                </div>

                {/* Indicators */}
                <div className="rounded-lg border border-border bg-card/30 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Key Indicators</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {Object.entries(strategy.indicators).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="capitalize text-muted-foreground">{key}:</span>
                        <span className="font-medium text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Risk Management Footer */}
        <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm text-amber-400">Risk Management Active</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Daily Loss Limit: -5%</span>
            <span>Max Position: 2%</span>
            <span>Circuit Breaker: Ready</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
