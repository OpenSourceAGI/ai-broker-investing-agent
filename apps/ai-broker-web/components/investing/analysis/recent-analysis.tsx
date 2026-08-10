"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, TrendingUp, TrendingDown } from "lucide-react"

const analyses: any[] = []

export function RecentAnalysis() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-card-foreground">Recent Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto touch-pan-x">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 text-left text-sm font-medium text-muted-foreground">Stock</th>
                <th className="pb-3 text-left text-sm font-medium text-muted-foreground">Prediction</th>
                <th className="pb-3 text-left text-sm font-medium text-muted-foreground">Confidence</th>
                <th className="pb-3 text-left text-sm font-medium text-muted-foreground">Time</th>
                <th className="pb-3 text-right text-sm font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {analyses.length > 0 ? (
                analyses.map((analysis) => (
                  <tr key={analysis.symbol} className="border-b border-border/50 last:border-0">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary font-mono text-sm font-semibold text-card-foreground">
                          {analysis.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-card-foreground">{analysis.symbol}</div>
                          <div className="text-xs text-muted-foreground">{analysis.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <div
                        className={`flex items-center gap-1 font-medium ${
                          analysis.direction === "up" ? "text-chart-1" : "text-chart-4"
                        }`}
                      >
                        {analysis.direction === "up" ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        {analysis.prediction}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${analysis.confidence}%` }} />
                        </div>
                        <span className="text-sm text-muted-foreground">{analysis.confidence}%</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {analysis.time}
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <Badge variant="secondary" className="bg-chart-1/20 text-chart-1">
                        Complete
                      </Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No recent analysis
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
