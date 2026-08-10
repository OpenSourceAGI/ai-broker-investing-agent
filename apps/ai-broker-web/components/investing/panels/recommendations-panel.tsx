"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowUp, ArrowDown, Minus, AlertTriangle } from "lucide-react"

const recommendations = [
  {
    symbol: "AAPL",
    action: "BUY",
    confidence: 87,
    target: "$175.00",
    risk: "Low",
  },
  {
    symbol: "NVDA",
    action: "HOLD",
    confidence: 72,
    target: "$520.00",
    risk: "Medium",
  },
  {
    symbol: "TSLA",
    action: "SELL",
    confidence: 65,
    target: "$180.00",
    risk: "High",
  },
]

export function RecommendationsPanel() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-card-foreground">AI Recommendations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.map((rec) => (
          <div
            key={rec.symbol}
            className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  rec.action === "BUY" ? "bg-chart-1/20" : rec.action === "SELL" ? "bg-chart-4/20" : "bg-chart-3/20"
                }`}
              >
                {rec.action === "BUY" ? (
                  <ArrowUp className="h-5 w-5 text-chart-1" />
                ) : rec.action === "SELL" ? (
                  <ArrowDown className="h-5 w-5 text-chart-4" />
                ) : (
                  <Minus className="h-5 w-5 text-chart-3" />
                )}
              </div>
              <div>
                <div className="font-semibold text-card-foreground">{rec.symbol}</div>
                <div className="text-xs text-muted-foreground">Target: {rec.target}</div>
              </div>
            </div>
            <div className="text-right">
              <Badge
                variant="secondary"
                className={
                  rec.action === "BUY"
                    ? "bg-chart-1/20 text-chart-1"
                    : rec.action === "SELL"
                      ? "bg-chart-4/20 text-chart-4"
                      : "bg-chart-3/20 text-chart-3"
                }
              >
                {rec.action}
              </Badge>
              <div className="mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                {rec.risk === "High" && <AlertTriangle className="h-3 w-3 text-chart-4" />}
                {rec.confidence}% conf
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
