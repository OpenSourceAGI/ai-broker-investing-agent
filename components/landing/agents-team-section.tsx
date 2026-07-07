import {
  BarChart3,
  Brain,
  MessageSquare,
  Newspaper,
  Shield,
  TrendingUp,
} from "lucide-react"

const agents = [
  {
    icon: BarChart3,
    name: "Fundamentals Agent",
    description: "Reads 10-Ks, cash flows, and margin trends. Flags intrinsic value gaps and red flags.",
    stat: "12,400 filings/day",
  },
  {
    icon: MessageSquare,
    name: "Sentiment Agent",
    description: "Scores social & retail chatter with LLM sentiment models to catch mood shifts early.",
    stat: "3.2M signals/hr",
  },
  {
    icon: Newspaper,
    name: "News Agent",
    description: "Monitors global newswires and macro events, ranks by market-moving relevance.",
    stat: "180 sources",
  },
  {
    icon: TrendingUp,
    name: "Technical Agent",
    description: "Runs MACD, RSI, Ichimoku and pattern detection across every timeframe.",
    stat: "60+ indicators",
  },
  {
    icon: Brain,
    name: "Researcher Agent",
    description: "Structured bull-vs-bear debates. Two agents argue, a third rules. You see the transcript.",
    stat: "Debate protocol",
  },
  {
    icon: Shield,
    name: "Risk Agent",
    description: "Sizes positions, sets stops, watches drawdown. Vetoes trades that violate your rules.",
    stat: "Per-trade veto",
  },
]

export function AgentsTeamSection() {
  return (
    <section id="agents" className="relative border-t border-border py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              The Team
            </div>
            <h2 className="font-display mt-3 text-4xl tracking-tight lg:text-6xl">
              Six agents.
              <br />
              <em className="not-italic text-muted-foreground">One thesis.</em>
            </h2>
          </div>
          <p className="max-w-lg text-lg text-muted-foreground">
            Every trade is the output of a specialist chain — analyst, researcher, trader, risk,
            portfolio manager. No single black box. You see who said what, and why.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card/60 p-6 transition-all hover:border-primary/40"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-primary/0 blur-3xl transition-all group-hover:bg-primary/20" />
              <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <agent.icon className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-semibold tracking-tight">{agent.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{agent.description}</p>
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs">
                <span className="font-mono text-muted-foreground">{agent.stat}</span>
                <span className="flex items-center gap-1.5 text-primary">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  live
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
