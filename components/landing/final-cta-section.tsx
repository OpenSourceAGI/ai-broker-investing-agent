import Link from "next/link"

export function FinalCtaSection() {
  return (
    <section className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-10 text-card-foreground lg:p-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-10 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative max-w-2xl">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-400">
              Get started
            </div>
            <h2 className="font-display mt-4 text-5xl leading-[1.02] tracking-tight lg:text-7xl">
              Your first
              <br />{" "}
              <em className="not-italic text-emerald-400">AI portfolio</em>
              <br /> in 90 seconds.
            </h2>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              Connect a broker, pick a risk profile, and let the team of agents
              get to work. Cancel anytime. Your keys, your account.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
              >
                Create free account
              </Link>
              <Link
                href="/docs"
                className="rounded-full border border-border px-7 py-3.5 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground"
              >
                Read the docs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
