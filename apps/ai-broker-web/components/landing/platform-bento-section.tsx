import { Bot, ChartLine, Clock, Target, UsersRound, Zap } from "lucide-react"

function CardBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" />
      {label}
    </div>
  )
}

const backtestBars = [24, 52, 38, 68, 44, 80, 62, 90, 74, 58, 88, 72, 95, 68, 82]

const signals = [
  { time: "09:31", symbol: "NVDA", action: "LONG" },
  { time: "10:04", symbol: "TSLA", action: "SCALE OUT" },
  { time: "11:22", symbol: "BTC", action: "HEDGE" },
]

const copyTraders = ["W", "D", "C", "N", "S"]

export function PlatformBentoSection() {
  return (
    <section id="strategies" className="relative border-t border-border py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="max-w-2xl">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Platform
          </div>
          <h2 className="font-display mt-3 text-4xl tracking-tight lg:text-6xl">
            Everything a serious
            <br />
            trader needs. <em className="not-italic text-muted-foreground">Automated.</em>
          </h2>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-6 lg:grid-rows-2">
          <div className="rounded-3xl border border-border bg-card/60 p-7 transition-colors hover:border-primary/30 lg:col-span-4 lg:row-span-1">
            <div className="flex h-full flex-col justify-between">
              <div>
                <CardBadge icon={Bot} label="Chatbot Algo Builder" />
                <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                  Describe a strategy. Get a bot.
                </h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Type &ldquo;Buy SPY when RSI &lt; 30 on the 15m and VIX is elevated.&rdquo; We
                  compile it, backtest 10 years, and hand you a deployable agent.
                </p>
              </div>
              <div className="mt-6 rounded-xl border border-border bg-background/70 p-4 font-mono text-xs">
                <div className="text-muted-foreground">→ you</div>
                <div className="text-foreground">
                  Buy TSLA on 5m breakout above VWAP + volume &gt; 1.5x avg
                </div>
                <div className="mt-3 text-primary">→ agent</div>
                <div className="text-foreground/90">
                  Compiled. Backtest: <span className="text-primary">+34.2%</span> · Sharpe 1.81 ·
                  Max DD -8.4%. Deploy?
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card/60 p-7 transition-colors hover:border-primary/30 lg:col-span-2">
            <CardBadge icon={Clock} label="Time-travel backtest" />
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">Rewind any strategy.</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Replay 15 years of tick data as if you were there.
            </p>
            <div className="mt-5 flex items-end gap-1">
              {backtestBars.map((height, i) => (
                <div
                  key={i}
                  style={{ height: `${height}px` }}
                  className="w-2 rounded-t bg-primary/80"
                />
              ))}
            </div>
          </div>

          <div
            id="copy-trading"
            className="rounded-3xl border border-border bg-card/60 p-7 transition-colors hover:border-primary/30 lg:col-span-2"
          >
            <CardBadge icon={UsersRound} label="Copy trading" />
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">Mirror the sharpest.</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Auto-mirror trades from vetted portfolios and public officials with the click of a
              button.
            </p>
            <div className="mt-5 flex -space-x-2">
              {copyTraders.map((initial) => (
                <div
                  key={initial}
                  className="grid h-8 w-8 place-items-center rounded-full border-2 border-card bg-secondary text-[11px] font-semibold"
                >
                  {initial}
                </div>
              ))}
              <div className="grid h-8 w-8 place-items-center rounded-full border-2 border-card bg-primary text-[11px] font-semibold text-primary-foreground">
                +38
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card/60 p-7 transition-colors hover:border-primary/30 lg:col-span-2">
            <CardBadge icon={Zap} label="Real-time signals" />
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">Alerts that act.</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Signals stream to your device — or trigger an autonomous execution.
            </p>
            <div className="mt-5 space-y-2 font-mono text-xs">
              {signals.map((signal) => (
                <div
                  key={signal.time}
                  className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2"
                >
                  <span className="text-muted-foreground">{signal.time}</span>
                  <span className="font-semibold">{signal.symbol}</span>
                  <span className="text-primary">{signal.action}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card/60 p-7 transition-colors hover:border-primary/30 lg:col-span-2">
            <CardBadge icon={ChartLine} label="Prediction markets" />
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">Trade the news itself.</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Route capital into Polymarket &amp; Kalshi based on LLM outcome analysis.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-card/60 p-7 transition-colors hover:border-primary/30 lg:col-span-2">
            <CardBadge icon={Target} label="Risk-first execution" />
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">Never blows up.</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Position sizing, stops, drawdown caps and human veto — enforced per trade.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
