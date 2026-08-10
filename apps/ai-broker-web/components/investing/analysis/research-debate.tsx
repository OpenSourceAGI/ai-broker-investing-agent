"use client"

import { TrendingUp, TrendingDown, MessageSquare, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const debateRounds = [
  {
    round: 1,
    bull: {
      argument: "Strong earnings growth of 23% YoY with expanding margins. AI demand continues to accelerate.",
      confidence: 82,
    },
    bear: {
      argument: "Valuation stretched at 45x P/E. Competition from AMD and custom chips poses risk.",
      confidence: 68,
    },
    status: "complete",
  },
  {
    round: 2,
    bull: {
      argument: "Data center revenue up 154%. Blackwell architecture launch shows strong demand pipeline.",
      confidence: 85,
    },
    bear: {
      argument: "Export restrictions to China reduce TAM. Inventory levels suggest demand normalization.",
      confidence: 71,
    },
    status: "active",
  },
  {
    round: 3,
    bull: { argument: "Pending...", confidence: 0 },
    bear: { argument: "Pending...", confidence: 0 },
    status: "pending",
  },
]

export function ResearchDebate() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg text-card-foreground">
            <MessageSquare className="h-5 w-5 text-chart-2" />
            Research Debate: NVDA
          </CardTitle>
          <Badge variant="outline" className="border-chart-2 text-chart-2">
            Round 2/3
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {debateRounds.map((round) => (
          <div
            key={round.round}
            className={`rounded-lg border p-4 ${
              round.status === "active"
                ? "border-chart-2 bg-chart-2/5"
                : round.status === "complete"
                  ? "border-border bg-secondary/30"
                  : "border-border/50 bg-muted/30"
            }`}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm font-medium text-card-foreground">Round {round.round}</span>
              {round.status === "active" && (
                <Badge className="bg-chart-2/20 text-chart-2 text-[10px]">In Progress</Badge>
              )}
              {round.status === "complete" && (
                <Badge className="bg-chart-1/20 text-chart-1 text-[10px]">Complete</Badge>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Bull Researcher */}
              <div className="rounded-lg border border-chart-1/30 bg-chart-1/5 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-chart-1" />
                  <span className="text-sm font-medium text-chart-1">Bullish Researcher</span>
                  {round.bull.confidence > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">{round.bull.confidence}% confidence</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{round.bull.argument}</p>
              </div>

              {/* Bear Researcher */}
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Bearish Researcher</span>
                  {round.bear.confidence > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">{round.bear.confidence}% confidence</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{round.bear.argument}</p>
              </div>
            </div>
          </div>
        ))}

        <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 p-3">
          <span className="text-sm text-muted-foreground">Debate outcome flows to</span>
          <ArrowRight className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-card-foreground">Trader Agent</span>
        </div>
      </CardContent>
    </Card>
  )
}
