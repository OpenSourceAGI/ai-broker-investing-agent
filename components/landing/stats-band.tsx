const stats = [
  { value: "$4.2B+", label: "Assets analyzed by AI agents" },
  { value: "128k", label: "Backtested strategies" },
  { value: "24/7", label: "Autonomous execution" },
  { value: "99.98%", label: "Uptime across markets" },
]

export function StatsBand() {
  return (
    <section className="border-y border-border bg-background">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-6 py-20 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="font-display text-5xl leading-none tracking-tight">{stat.value}</div>
            <div className="mt-3 text-sm text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
