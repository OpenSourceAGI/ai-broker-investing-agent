import { CircleCheck } from "lucide-react"
import { cn } from "@/lib/utils"

type BrokerStatus = "Live" | "Beta" | "Soon"

const brokers: {
  name: string
  status: BrokerStatus
  description: string
  features: string[]
}[] = [
  {
    name: "Alpaca",
    status: "Live",
    description: "Commission-free API-first stocks, ETFs & crypto.",
    features: ["REST & WebSocket", "Paper trading", "Fractional shares"],
  },
  {
    name: "Polymarket",
    status: "Live",
    description: "Decentralized prediction markets on real-world events.",
    features: ["News & events", "Polygon-based", "Social trading"],
  },
  {
    name: "Kalshi",
    status: "Live",
    description: "CFTC-regulated US prediction market exchange.",
    features: ["US regulated", "USD settlement", "Event contracts"],
  },
  {
    name: "Robinhood",
    status: "Beta",
    description: "Retail platform, zero commissions, simple API.",
    features: ["Zero commission", "Crypto trading", "Cash management"],
  },
  {
    name: "Webull",
    status: "Soon",
    description: "Mobile-first platform with L2 data and API.",
    features: ["Commission-free", "Level 2 data", "Advanced charting"],
  },
  {
    name: "IBKR",
    status: "Soon",
    description: "Institutional-grade global multi-asset broker.",
    features: ["Global markets", "Margin & options", "Pro tools"],
  },
]

const statusStyles: Record<BrokerStatus, string> = {
  Live: "bg-primary/15 text-primary border-primary/30",
  Beta: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  Soon: "bg-secondary text-muted-foreground border-border",
}

export function BrokersGridSection() {
  return (
    <section id="brokers" className="relative border-t border-border py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              Brokers
            </div>
            <h2 className="font-display mt-3 text-4xl tracking-tight lg:text-6xl">
              Bring your broker.
              <br />
              <em className="not-italic text-muted-foreground">Keep your account.</em>
            </h2>
          </div>
          <p className="max-w-md text-muted-foreground">
            We never take custody. Connect via API keys and our agents trade inside your own broker
            account — you own every share.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {brokers.map((broker) => (
            <div
              key={broker.name}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card/60 p-6 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between">
                <div className="text-xl font-semibold tracking-tight">{broker.name}</div>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    statusStyles[broker.status],
                  )}
                >
                  {broker.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{broker.description}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {broker.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-muted-foreground">
                    <CircleCheck className="h-4 w-4 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
