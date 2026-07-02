import {
  Activity,
  TrendingUp,
  BarChart3,
  Gauge,
  Newspaper,
  UserCheck,
  LineChart,
  CandlestickChart,
  Waves,
  DollarSign,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { InfoTooltip } from "@/components/landing/info-tooltip"

const apiDataSources = [
  {
    icon: CandlestickChart,
    name: "Core Stock APIs",
    category: "Price Data",
    endpoints: ["Intraday (1-60 min)", "Daily / Weekly / Monthly", "Quote Endpoint", "Realtime Bulk Quotes"],
    description: "Real-time and historical OHLCV price data for any ticker",
    api: "Alpha Vantage",
  },
  {
    icon: LineChart,
    name: "Technical Indicators",
    category: "Technical",
    endpoints: ["RSI", "MACD", "SMA / EMA", "BBANDS", "STOCH", "ADX", "AROON", "OBV", "VWAP", "ATR"],
    description: "50+ technical indicators for pattern recognition and momentum signals",
    api: "Alpha Vantage",
  },
  {
    icon: Newspaper,
    name: "News & Sentiment",
    category: "Alpha Intelligence",
    endpoints: ["News Sentiment Scores", "Topic Classification", "Ticker Relevance", "Time-Series Sentiment"],
    description: "AI-powered sentiment analysis from news articles and media coverage",
    api: "Alpha Vantage",
  },
  {
    icon: UserCheck,
    name: "Insider Transactions",
    category: "Alpha Intelligence",
    endpoints: ["Executive Trades", "Buy/Sell Signals", "Transaction Values", "Filing Dates"],
    description: "Track insider buying and selling activity for early signals",
    api: "Alpha Vantage",
  },
  {
    icon: DollarSign,
    name: "Fundamental Data",
    category: "Fundamentals",
    endpoints: ["Company Overview", "Income Statement", "Balance Sheet", "Cash Flow", "Earnings"],
    description: "Financial statements, ratios, and company metrics for valuation",
    api: "Alpha Vantage",
  },
  {
    icon: Waves,
    name: "Economic Indicators",
    category: "Macro",
    endpoints: ["Real GDP", "Treasury Yield", "Fed Funds Rate", "CPI / Inflation", "Unemployment"],
    description: "Macroeconomic data for market regime and sector rotation analysis",
    api: "Alpha Vantage",
  },
]

export function SignalIndicators() {
  return (
    <section id="signals" className=" px-4  sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">


        <div className="mt-4">

          {/* Data Sources Grid - 6 Core Categories */}
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {apiDataSources.map((source) => (
              <div
                key={source.name}
                className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/40"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <source.icon className="h-6 w-6 text-primary" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {source.category}
                  </Badge>
                </div>
                <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                  {source.name}
                  <InfoTooltip>{source.description}</InfoTooltip>
                </h3>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {source.endpoints.slice(0, 3).map((endpoint) => (
                    <span
                      key={endpoint}
                      className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground"
                    >
                      {endpoint}
                    </span>
                  ))}
                  {source.endpoints.length > 3 && (
                    <InfoTooltip
                      className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:text-primary"
                      label={`+${source.endpoints.length - 3} more`}
                    >
                      {source.endpoints.slice(3).join(" · ")}
                    </InfoTooltip>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>


    </section>
  )
}
