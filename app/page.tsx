import { HeroSection } from "@/components/landing/hero-section"
import { TickerTape } from "@/components/landing/ticker-tape"
import { FeatureStorySection } from "@/components/landing/feature-story-section"
import { AgentsTeamSection } from "@/components/landing/agents-team-section"
import { PlatformBentoSection } from "@/components/landing/platform-bento-section"
import { PredictionMarketsPreview } from "@/components/landing/prediction-markets-preview"
import { BrokersGridSection } from "@/components/landing/brokers-grid-section"
import { StatsBand } from "@/components/landing/stats-band"
import { FinalCtaSection } from "@/components/landing/final-cta-section"
import { Header } from "@/components/landing/header"
import { Footer } from "@/components/landing/footer"

export default function LandingPage() {
  return (
    <main className="w-full max-w-full overflow-x-hidden">
      <Header />

      <HeroSection />
      <TickerTape />

      <FeatureStorySection
        eyebrow="Agentic Trading"
        title="Send your agent to the market"
        description="Give your AI agent a dedicated brokerage account. It researches, debates competing theses, then places trades — you monitor performance in one calm dashboard."
        ctaLabel="Meet the agents"
        ctaHref="/debate"
        imageSrc="/images/diagram-research-flow.png"
        imageAlt="AI agent research flow diagram"
        imageClassName="object-contain p-4"
      />

      <AgentsTeamSection />
      <PlatformBentoSection />
      <PredictionMarketsPreview />
      <BrokersGridSection />

      <FeatureStorySection
        id="portfolio"
        eyebrow="Portfolio Intelligence"
        title="Every position, every risk, in one lens"
        description="Layered exposure, correlations, and drawdown scenarios rendered clearly. Rebalance with a suggestion from your agent — or override it."
        ctaLabel="Explore portfolio tools"
        ctaHref="/portfolio"
        imageSrc="/images/landing/hero-orrery.jpg"
        imageAlt="Astronomical armillary sphere rendering a live market"
        reverse
      />

      <StatsBand />
      <FinalCtaSection />

      <Footer />
    </main>
  )
}
