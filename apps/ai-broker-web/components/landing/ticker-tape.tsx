import { Marquee } from "@/components/ui/marquee"
import { cn } from "@/lib/utils"

const tickers = [
  { symbol: "NVDA", price: "142.83", change: "+3.24%", up: true },
  { symbol: "AAPL", price: "231.44", change: "+0.82%", up: true },
  { symbol: "TSLA", price: "421.10", change: "+4.17%", up: true },
  { symbol: "MSFT", price: "428.55", change: "-0.45%", up: false },
  { symbol: "META", price: "612.09", change: "+1.98%", up: true },
  { symbol: "AMZN", price: "228.31", change: "-0.51%", up: false },
  { symbol: "GOOGL", price: "195.42", change: "+0.63%", up: true },
  { symbol: "BTC", price: "108,241", change: "+5.02%", up: true },
  { symbol: "ETH", price: "4,120", change: "+3.11%", up: true },
  { symbol: "SPY", price: "612.88", change: "+0.71%", up: true },
  { symbol: "QQQ", price: "534.20", change: "+1.02%", up: true },
  { symbol: "AMD", price: "156.72", change: "-1.23%", up: false },
]

export function TickerTape() {
  return (
    <div className="border-y border-border bg-background py-1 text-foreground">
      <Marquee className="[--duration:50s] [--gap:2.5rem] p-2">
        {tickers.map((t) => (
          <span
            key={t.symbol}
            className="flex items-center gap-3 text-sm whitespace-nowrap"
          >
            <span className="font-mono font-semibold tracking-tight">
              {t.symbol}
            </span>
            <span className="font-mono text-muted-foreground">{t.price}</span>
            <span
              className={cn(
                "font-mono",
                t.up ? "text-emerald-400" : "text-red-400",
              )}
            >
              {t.change}
            </span>
          </span>
        ))}
      </Marquee>
    </div>
  )
}
