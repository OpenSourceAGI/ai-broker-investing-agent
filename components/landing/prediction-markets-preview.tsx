import Link from "next/link"

const markets = [
  { question: "Will the Fed cut rates in Q1 2026?", volume: "$4.2M", yes: 68 },
  { question: "Will NVDA close above $150 by end of quarter?", volume: "$2.8M", yes: 54 },
  { question: "Will OpenAI ship GPT-6 in 2026?", volume: "$6.1M", yes: 41 },
  { question: "Will BTC hit $150K this year?", volume: "$12.4M", yes: 37 },
]

export function PredictionMarketsPreview() {
  return (
    <section id="prediction-markets" className="relative bg-ink py-24 text-cream lg:py-32">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
              Prediction Markets
            </div>
            <h2 className="font-display mt-3 text-4xl tracking-tight lg:text-6xl">
              Bet on <em className="not-italic text-emerald-400">what happens next.</em>
            </h2>
            <p className="mt-6 max-w-md text-cream/70">
              Our LLM outcome engine reads every relevant filing, tweet, and headline, then routes
              your capital to the sharpest edge on Polymarket and Kalshi — automatically.
            </p>
            <div className="mt-8 flex flex-wrap gap-6 text-sm">
              <div>
                <div className="text-2xl font-semibold tracking-tight">12,400+</div>
                <div className="text-xs uppercase tracking-wider text-cream/50">Markets tracked</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tracking-tight">+11.8%</div>
                <div className="text-xs uppercase tracking-wider text-cream/50">Avg agent edge</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tracking-tight">Enabled</div>
                <div className="text-xs uppercase tracking-wider text-cream/50">Auto-hedge</div>
              </div>
            </div>
            <Link
              href="/predict"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-medium text-ink transition hover:brightness-95"
            >
              See live markets →
            </Link>
          </div>

          <div className="space-y-3">
            {markets.map((market) => (
              <div
                key={market.question}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition-colors hover:border-emerald-400/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="font-medium">{market.question}</p>
                  <span className="shrink-0 font-mono text-xs text-cream/50">
                    Vol {market.volume}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-400/10 py-2.5 text-center text-sm font-semibold text-emerald-400">
                    Yes · {market.yes}¢
                  </div>
                  <div className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-center text-sm font-semibold">
                    No · {100 - market.yes}¢
                  </div>
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    style={{ width: `${market.yes}%` }}
                    className="h-full rounded-full bg-emerald-400"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
