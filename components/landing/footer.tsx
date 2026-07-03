import Link from "next/link"
import Image from "next/image"

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME

const columns = [
  {
    heading: "Trade",
    links: [
      { label: "Research Agents", href: "#agents" },
      { label: "Algo Bots", href: "#strategies" },
      { label: "Copy Trading", href: "#copy-trading" },
      { label: "Prediction Markets", href: "#prediction-markets" },
    ],
  },
  {
    heading: "Manage",
    links: [
      { label: "Portfolio", href: "/portfolio" },
      { label: "Markets", href: "/markets" },
      { label: "Leaders", href: "/leaders" },
      { label: "Debate", href: "/debate" },
    ],
  },
  {
    heading: "Learn",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Research Paper", href: "https://zenodo.org/records/20836179" },
      { label: "Risk Disclosure", href: "/docs/risk-disclosure" },
      { label: "AI Ethics", href: "https://rights.institute/ethics/" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Terms & Privacy", href: "/legal/privacy" },
      { label: "Contact", href: "mailto:contact@autoinvestment.broker" },
      { label: "Google Play", href: "https://play.google.com/store/apps/details?id=com.autoinvestment.broker.app" },
    ],
  },
]

export function Footer() {
  return (
    <footer className="bg-ink text-cream">
      <div className="mx-auto max-w-[1400px] px-6 py-16">
        <div className="grid gap-12 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
                <Image
                  src="/apple-touch-icon.png"
                  alt="Logo"
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                />
              </div>
              <span className="font-display text-2xl">{APP_NAME}</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-cream/60">
              Auto-invest like a hedge fund. AI agents that research, debate, and trade — for you.
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.heading}>
              <div className="text-xs uppercase tracking-[0.2em] text-cream/50">
                {column.heading}
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-cream/80 transition-colors hover:text-emerald-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col justify-between gap-4 border-t border-cream/10 pt-8 text-xs text-cream/50 sm:flex-row">
          <div>
            © {new Date().getFullYear()} {APP_NAME}. San Francisco, CA. All rights reserved.
          </div>
          <div>Investing involves risk of loss. Not investment advice.</div>
        </div>
      </div>
    </footer>
  )
}
