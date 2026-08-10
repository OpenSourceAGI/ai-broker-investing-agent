"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { demoAgents } from "@/lib/demo-data"
import { Clock, Activity, AlertTriangle, Users } from "lucide-react"
import Link from "next/link"

export function AgentsTab() {
  const analysts = demoAgents.filter(a => a.type === 'analyst')
  const researchers = demoAgents.filter(a => a.type === 'researcher')
  const trader = demoAgents.find(a => a.type === 'trader')
  const risk = demoAgents.find(a => a.type === 'risk')
  const pm = demoAgents.find(a => a.type === 'pm')

  const AgentCard = ({ agent }: { agent: typeof demoAgents[0] }) => (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-lg">{agent.name}</h3>
          <Badge variant="outline" className="mt-1 capitalize">{agent.type}</Badge>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-primary">{agent.queueLength}</div>
          <div className="text-xs text-muted-foreground">in queue</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Clock className="h-3 w-3" />
            Avg Latency
          </div>
          <div className="font-semibold">{agent.avgLatency}ms</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <AlertTriangle className="h-3 w-3" />
            Error Rate
          </div>
          <div className="font-semibold">{agent.errorRate}%</div>
          <Progress value={agent.errorRate} className="h-1 mt-1" />
        </div>
      </div>

      {agent.recentActivity && agent.recentActivity.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">Recent Activity</div>
          <div className="space-y-1">
            {agent.recentActivity.slice(0, 3).map((activity, i) => (
              <div key={i} className="text-xs p-2 bg-muted rounded">
                {activity}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Multi-Agent Debate Analysis</h2>
            <p className="text-sm text-muted-foreground">
              Get comprehensive stock analysis using specialized AI agents in collaborative debate
            </p>
          </div>
          <Link href="/dashboard/debate-agents">
            <Button size="lg" className="gap-2">
              <Users className="h-5 w-5" />
              Try Debate Agents
            </Button>
          </Link>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-6">Analyst Team</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {analysts.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-6">Researcher Team</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {researchers.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        {trader && (
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Trader Agent</h2>
            <AgentCard agent={trader} />
          </Card>
        )}

        {risk && (
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Risk Management</h2>
            <AgentCard agent={risk} />
          </Card>
        )}

        {pm && (
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Portfolio Manager</h2>
            <AgentCard agent={pm} />
          </Card>
        )}
      </div>
    </div>
  )
}
