"use client"

import {
  BarChart3,
  MessageSquare,
  Newspaper,
  TrendingUp,
  Users,
  Scale,
  ShieldCheck,
  Briefcase,
  CheckCircle2,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

const analystAgents = [
  { name: "Fundamentals", icon: BarChart3, status: "complete", progress: 100 },
  { name: "Sentiment", icon: MessageSquare, status: "complete", progress: 100 },
  { name: "News", icon: Newspaper, status: "complete", progress: 100 },
  { name: "Technical", icon: TrendingUp, status: "complete", progress: 100 },
]

const pipelineStages = [
  {
    name: "Research Debate",
    icon: Users,
    status: "running",
    progress: 72,
    detail: "Bull vs Bear: Round 2/3",
    color: "text-chart-2",
    bg: "bg-chart-2/20",
  },
  {
    name: "Trader Agent",
    icon: Scale,
    status: "pending",
    progress: 0,
    detail: "Waiting for research...",
    color: "text-chart-3",
    bg: "bg-chart-3/20",
  },
  {
    name: "Risk Management",
    icon: ShieldCheck,
    status: "pending",
    progress: 0,
    detail: "Waiting...",
    color: "text-chart-4",
    bg: "bg-chart-4/20",
  },
  {
    name: "Portfolio Manager",
    icon: Briefcase,
    status: "pending",
    progress: 0,
    detail: "Final approval pending",
    color: "text-chart-5",
    bg: "bg-chart-5/20",
  },
]

export function AgentsPipeline() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-card-foreground">Agent Pipeline Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Analyst Team Row */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-chart-1/20">
              <Users className="h-3 w-3 text-chart-1" />
            </div>
            <span className="text-sm font-medium text-card-foreground">Analyst Team</span>
            <CheckCircle2 className="ml-auto h-4 w-4 text-chart-1" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {analystAgents.map((agent) => (
              <div key={agent.name} className="rounded-lg border border-border bg-chart-1/5 p-3 text-center">
                <agent.icon className="mx-auto h-4 w-4 text-chart-1" />
                <div className="mt-1 text-xs font-medium text-card-foreground">{agent.name}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">Complete</div>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline Stages */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pipelineStages.map((stage, index) => (
            <div key={stage.name} className="relative rounded-lg border border-border bg-secondary/50 p-4">
              {index < pipelineStages.length - 1 && (
                <div className="absolute -right-1.5 top-1/2 hidden h-0.5 w-3 -translate-y-1/2 bg-border lg:block" />
              )}
              <div className="flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stage.bg}`}>
                  <stage.icon className={`h-5 w-5 ${stage.color}`} />
                </div>
                {stage.status === "complete" ? (
                  <CheckCircle2 className="h-5 w-5 text-chart-1" />
                ) : stage.status === "running" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-chart-2" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                )}
              </div>
              <div className="mt-3">
                <div className="font-medium text-card-foreground">{stage.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{stage.detail}</div>
              </div>
              <Progress value={stage.progress} className="mt-3 h-1.5" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
