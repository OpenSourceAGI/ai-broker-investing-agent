"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Cpu,
  Pill,
  Zap,
  DollarSign,
  ShoppingCart,
  Home,
  Wheat,
  Shield,
  TrendingUp,
  AlertCircle,
  ArrowRight,
} from "lucide-react"
import { InfoTooltip } from "@/components/landing/info-tooltip"

const correlationCategories = [
  {
    id: "technology",
    name: "Technology",
    icon: Cpu,
    color: "blue",
    correlations: [
      {
        predictionMarket: "Will OpenAI release GPT-5 by Q2 2025?",
        platform: "Polymarket",
        relatedSecurities: ["MSFT", "NVDA", "GOOGL"],
        correlation: 0.78,
        strategy: "Track elite forecasters who correctly predicted GPT-4 release timing. Their insights on GPT-5 timeline correlate with +/-5% moves in MSFT within 48 hours.",
        type: "AI/Tech Stock Correlations",
      },
      {
        predictionMarket: "Will Taiwan face Chinese military action in 2025?",
        platform: "Kalshi",
        relatedSecurities: ["TSM", "INTC", "ASML", "AMD", "QCOM"],
        correlation: 0.72,
        strategy: "Geopolitical superforecasters predict Taiwan scenarios. Consensus moving from 15% → 25% preceded 12% TSM decline in backtests.",
        type: "Semiconductor Supply Chain",
      },
      {
        predictionMarket: "Will Apple announce AR glasses at WWDC 2025?",
        platform: "Polymarket",
        relatedSecurities: ["AAPL", "META", "GOOGL"],
        correlation: 0.65,
        strategy: "Elite forecasters with Apple product launch track records provide 2-4 week advance signals. When consensus reaches 60%+, IV underprices event impact by 15-20%.",
        type: "Tech Product Launches",
      },
    ],
  },
  {
    id: "healthcare",
    name: "Healthcare",
    icon: Pill,
    color: "green",
    correlations: [
      {
        predictionMarket: "Will FDA approve Alzheimer's drug X by December 2025?",
        platform: "Specialized Markets",
        relatedSecurities: ["BIIB", "LLY", "RHHBY"],
        correlation: 0.81,
        strategy: "Medical researchers and former FDA reviewers demonstrate 45% better accuracy than analyst consensus on approval timelines.",
        type: "FDA Approval Predictions",
      },
      {
        predictionMarket: "Will WHO declare Disease X a global health emergency?",
        platform: "Metaculus",
        relatedSecurities: ["MRNA", "BNTX", "PFE", "TMO", "DHR"],
        correlation: 0.69,
        strategy: "Epidemiologist forecasters who predicted COVID-19 waves provide early warning. When risk >30%, healthcare defensive rotation outperforms by 8-12%.",
        type: "Pandemic & Public Health",
      },
      {
        predictionMarket: "Will Medicare negotiate drug prices for 100+ drugs by 2026?",
        platform: "Kalshi",
        relatedSecurities: ["JNJ", "PFE", "MRK", "ABBV", "CVS", "CI"],
        correlation: 0.74,
        strategy: "Policy forecasters predict Medicare expansion 3-6 months ahead. When probability exceeds 70%, rotate from big pharma to medical devices (MDT, ABT, BSX).",
        type: "Healthcare Policy",
      },
    ],
  },
  {
    id: "energy",
    name: "Energy",
    icon: Zap,
    color: "amber",
    correlations: [
      {
        predictionMarket: "Will WTI crude exceed $100/barrel in 2025?",
        platform: "Kalshi",
        relatedSecurities: ["XLE", "XOM", "CVX", "SLB"],
        correlation: 0.76,
        strategy: "Geopolitical and commodities experts predicted Russia sanctions impact. When markets show 55% probability but equity valuations imply 35%, long XLE captures 12-18% alpha.",
        type: "Oil Price Prediction",
      },
      {
        predictionMarket: "Will OPEC+ extend production cuts through Q3 2025?",
        platform: "Energy Markets",
        relatedSecurities: ["HAL", "SLB", "EPD", "MMP"],
        correlation: 0.73,
        strategy: "Elite forecasters with Middle East expertise predict OPEC decisions with 65% accuracy vs. 48% analyst consensus. Consensus shifts precede announcements by 2-3 weeks.",
        type: "OPEC+ Production Decisions",
      },
      {
        predictionMarket: "Will US extend solar ITC tax credits beyond 2025?",
        platform: "Kalshi",
        relatedSecurities: ["ENPH", "SEDG", "FSLR", "NEE"],
        correlation: 0.68,
        strategy: "Congressional staffers provide 40% better accuracy than sell-side analysts. When extension probability exceeds 60%, solar stocks rally 15-25% over 3 months.",
        type: "Renewable Energy Policy",
      },
    ],
  },
  {
    id: "financial",
    name: "Financial",
    icon: DollarSign,
    color: "emerald",
    correlations: [
      {
        predictionMarket: "Will Fed cut rates by 50+ basis points in 2025?",
        platform: "Kalshi",
        relatedSecurities: ["JPM", "BAC", "WFC", "C", "VNQ", "TLT"],
        correlation: 0.82,
        strategy: "Former Fed economists predict FOMC decisions with 72% accuracy vs. 58% for futures. When consensus diverges by 25+ bps, convergence trade yields 8-15% returns.",
        type: "Federal Reserve Policy",
      },
      {
        predictionMarket: "Will a major US bank face regulatory action in 2025?",
        platform: "Good Judgment Open",
        relatedSecurities: ["KRE", "JPM", "BAC"],
        correlation: 0.71,
        strategy: "Banking analysts who predicted SVB failure provide early warning. When credit risk probability exceeds 20%, reduce exposure and hedge with VIX calls.",
        type: "Banking Stress & Credit Events",
      },
      {
        predictionMarket: "Will SEC approve spot Ethereum ETF by Q2 2025?",
        platform: "Polymarket",
        relatedSecurities: ["COIN", "MSTR", "MARA", "RIOT"],
        correlation: 0.79,
        strategy: "Crypto-native forecasters with SEC expertise predicted Bitcoin ETF approval 4 months early. ETH ETF approval probability >65% correlates with 20-30% COIN rallies.",
        type: "Cryptocurrency Regulation",
      },
    ],
  },
  {
    id: "consumer",
    name: "Consumer",
    icon: ShoppingCart,
    color: "purple",
    correlations: [
      {
        predictionMarket: "Will US enter recession in 2025?",
        platform: "Kalshi",
        relatedSecurities: ["XLY", "XRT", "WMT", "TGT", "COST"],
        correlation: 0.75,
        strategy: "Macroeconomic forecasters who predicted 2022 inflation surge provide recession probability with 35% lower error. When >45%, rotate to staples for 12-18% outperformance.",
        type: "Consumer Spending & Recession",
      },
      {
        predictionMarket: "Will Amazon's GMV exceed $1 trillion in 2025?",
        platform: "Manifold",
        relatedSecurities: ["AMZN", "SHOP", "WMT", "V", "MA", "PYPL"],
        correlation: 0.68,
        strategy: "E-commerce analysts and former Amazon employees forecast GMV with 25% better accuracy. Amazon acceleration correlates with margin pressure on traditional retail.",
        type: "E-Commerce & Tech Adoption",
      },
      {
        predictionMarket: "Will US unemployment rate exceed 5% by end of 2025?",
        platform: "Kalshi",
        relatedSecurities: ["RNG", "MAN", "KFRC", "UBER", "LYFT"],
        correlation: 0.72,
        strategy: "Labor economists provide leading indicators 2-3 months before official data. When unemployment probability exceeds 40%, reduce cyclical staffing exposure.",
        type: "Labor Market & Unemployment",
      },
    ],
  },
  {
    id: "realestate",
    name: "Real Estate",
    icon: Home,
    color: "orange",
    correlations: [
      {
        predictionMarket: "Will median US home prices decline 10%+ in 2025?",
        platform: "Kalshi",
        relatedSecurities: ["XHB", "DHI", "LEN", "PHM", "HD", "LOW"],
        correlation: 0.77,
        strategy: "Real estate economists who predicted 2022 correction provide 40% more accurate forecasts. 60% decline probability suggests additional 20-25% downside likely.",
        type: "Housing Market Predictions",
      },
      {
        predictionMarket: "Will CRE defaults exceed $50B in 2025?",
        platform: "CRE Markets",
        relatedSecurities: ["VNO", "BXP", "SLG", "NYCB", "PACW"],
        correlation: 0.74,
        strategy: "CRE professionals forecast defaults with 55% accuracy vs. 35% for rating agencies. When distress probability exceeds 50%, short office REITs captures 25-35% spread.",
        type: "Commercial Real Estate Distress",
      },
      {
        predictionMarket: "Will 30-year mortgage rates fall below 5% in 2025?",
        platform: "Kalshi",
        relatedSecurities: ["RKT", "UWMC", "LDI", "IYR"],
        correlation: 0.71,
        strategy: "Mortgage industry forecasters who predicted 2023 rate spike provide superior accuracy. When <5% probability exceeds 60%, originators rally 30-45% on refi volume.",
        type: "Mortgage Rate Trajectory",
      },
    ],
  },
  {
    id: "agriculture",
    name: "Agriculture",
    icon: Wheat,
    color: "yellow",
    correlations: [
      {
        predictionMarket: "Will US corn yields fall below 170 bu/acre in 2025?",
        platform: "Gro Intelligence",
        relatedSecurities: ["ADM", "BG", "DE", "AGCO", "NTR", "MOS"],
        correlation: 0.73,
        strategy: "Agricultural economists forecast yields with 30% lower error than USDA early estimates. Poor yield forecasts (>55%) precede 15-20% corn futures rallies.",
        type: "Crop Yield & Weather",
      },
      {
        predictionMarket: "Will major wheat exporter impose export ban in 2025?",
        platform: "Good Judgment Open",
        relatedSecurities: ["GIS", "K", "CPB", "KR", "ACI"],
        correlation: 0.69,
        strategy: "Geopolitical analysts who predicted Russia/Ukraine disruptions provide early warning. When export ban probability exceeds 35%, long agricultural commodities and short food processors.",
        type: "Food Security & Export Restrictions",
      },
    ],
  },
  {
    id: "geopolitical",
    name: "Geopolitical",
    icon: Shield,
    color: "red",
    correlations: [
      {
        predictionMarket: "Will China conduct military operations against Taiwan in 2025?",
        platform: "Metaculus",
        relatedSecurities: ["LMT", "RTX", "NOC", "GD", "BA", "TSM"],
        correlation: 0.79,
        strategy: "Former military intelligence demonstrates 40% better accuracy. When conflict probability exceeds 20%, purchase TSM puts and long defense contractors shows 30-50% divergence.",
        type: "Military Conflict Predictions",
      },
      {
        predictionMarket: "Will US impose comprehensive sanctions on major trading partner?",
        platform: "Geopolitical Markets",
        relatedSecurities: ["JPM", "C", "HSBC"],
        correlation: 0.72,
        strategy: "Trade policy experts predict sanctions with 50% better lead time. When probability exceeds 45%, companies with high exposure underperform by 15-25% over 6 months.",
        type: "Sanctions & Trade Policy",
      },
      {
        predictionMarket: "Will major critical infrastructure face successful cyberattack?",
        platform: "Cybersecurity Markets",
        relatedSecurities: ["CRWD", "PANW", "ZS", "S", "FTNT"],
        correlation: 0.68,
        strategy: "Cybersecurity professionals who predicted major ransomware attacks provide superior threat forecasting. When probability >40%, cybersecurity stocks rally 12-20%.",
        type: "Cybersecurity & Infrastructure Risk",
      },
    ],
  },
]

const colorVariants = {
  blue: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
    badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  green: {
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-400",
    badge: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  amber: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  purple: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-400",
    badge: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  orange: {
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-400",
    badge: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
  yellow: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-400",
    badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  red: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    badge: "bg-red-500/20 text-red-400 border-red-500/30",
  },
}

export function MarketCorrelations() {
  const [activeTab, setActiveTab] = useState("technology")

  return (
    <div className="mt-16">
      <div className="text-center mb-8">
        <Badge variant="outline" className="mb-4 border-violet-500/50 text-violet-400">
          Cross-Market Intelligence
        </Badge>
        <h3 className="text-3xl font-bold mb-4">
          Stock Price Correlations with Event Prediction{" "}
          <InfoTooltip iconClassName="h-5 w-5">
            Discover how prediction markets correlate with traditional securities across sectors.
            Our AI identifies non-obvious relationships, providing 45-60 day advance signals for
            strategic positioning.
          </InfoTooltip>
        </h3>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 mb-8">
          {correlationCategories.map((category) => {
            const colors = colorVariants[category.color as keyof typeof colorVariants]
            return (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="flex items-center gap-2 data-[state=active]:bg-card/50"
              >
                <category.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{category.name}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {correlationCategories.map((category) => {
          const colors = colorVariants[category.color as keyof typeof colorVariants]
          return (
            <TabsContent key={category.id} value={category.id} className="space-y-4">
              <div className="grid gap-4">
                {category.correlations.map((correlation, index) => (
                  <Card key={index} className={`${colors.border} border-2`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <Badge className={colors.badge + " mb-2"}>{correlation.type}</Badge>
                          <CardTitle className="text-lg mb-2">{correlation.predictionMarket}</CardTitle>
                          <CardDescription className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {correlation.platform}
                            </Badge>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              {(100 * correlation.correlation).toFixed(0)}% correlation
                            </span>
                          </CardDescription>
                        </div>
                        <div className={`p-3 rounded-xl ${colors.bg}`}>
                          <category.icon className={`w-6 h-6 ${colors.text}`} />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <ArrowRight className="h-4 w-4" />
                            Related Securities
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {correlation.relatedSecurities.map((security) => (
                              <Badge key={security} variant="secondary" className="font-mono">
                                ${security}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className={`p-4 rounded-lg ${colors.bg} border ${colors.border}`}>
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Trading Strategy
                            <InfoTooltip>{correlation.strategy}</InfoTooltip>
                          </h4>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )
        })}
      </Tabs>

      <Card className="mt-8 bg-gradient-to-br from-violet-500/5 to-purple-500/5 border-violet-500/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start gap-4">
            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <AlertCircle className="w-6 h-6 text-violet-400" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                XGBoost & Prophet TimeSeries ML Models
                <InfoTooltip>
                  Our platform combines 5-10 prediction market signals to forecast individual stock
                  movements. The system requires 3 validation criteria before generating
                  high-conviction signals: elite forecaster consensus (top 2% show &gt;65%
                  agreement), cross-market confirmation (multiple related markets align), and
                  traditional indicator confluence (technical analysis and fundamentals support
                  prediction market signal). When all criteria meet thresholds, historical accuracy
                  exceeds 70% over 3-6 month horizons.
                </InfoTooltip>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-background/50">
                  <p className="text-xs text-muted-foreground mb-1">Correlation Pairs Tracked</p>
                  <p className="text-lg font-semibold">2,400+</p>
                </div>
                <div className="p-3 rounded-lg bg-background/50">
                  <p className="text-xs text-muted-foreground mb-1">Average Lead Time</p>
                  <p className="text-lg font-semibold text-violet-400">45-60 days</p>
                </div>
                <div className="p-3 rounded-lg bg-background/50">
                  <p className="text-xs text-muted-foreground mb-1">Forecast Accuracy</p>
                  <p className="text-lg font-semibold text-emerald-400">60-70%</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
