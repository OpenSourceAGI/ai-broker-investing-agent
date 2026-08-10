"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

const sentimentData = [
  { source: "News Articles", sentiment: 72, trend: "up", count: 145 },
  { source: "Social Media", sentiment: 58, trend: "neutral", count: 2340 },
  { source: "Analyst Reports", sentiment: 81, trend: "up", count: 12 },
  { source: "Earnings Calls", sentiment: 65, trend: "down", count: 3 },
]

export function SentimentPanel() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-card-foreground">Sentiment Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sentimentData.map((item) => (
          <div key={item.source} className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-card-foreground">{item.source}</span>
                <span className="text-xs text-muted-foreground">{item.count} sources</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full ${
                      item.sentiment >= 70 ? "bg-chart-1" : item.sentiment >= 50 ? "bg-chart-3" : "bg-chart-4"
                    }`}
                    style={{ width: `${item.sentiment}%` }}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-card-foreground">{item.sentiment}%</span>
                  {item.trend === "up" ? (
                    <TrendingUp className="h-3 w-3 text-chart-1" />
                  ) : item.trend === "down" ? (
                    <TrendingDown className="h-3 w-3 text-chart-4" />
                  ) : (
                    <Minus className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        <div className="rounded-lg bg-primary/10 p-3">
          <div className="text-sm font-medium text-card-foreground">Overall Sentiment Score</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">69%</span>
            <span className="text-sm text-chart-1">Bullish</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
