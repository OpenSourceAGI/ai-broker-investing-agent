"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TrendingUp,
  Users,
  Brain,
  Target,
  BarChart3,
  Trophy,
  Eye,
  Zap,
  Scale,
  Globe,
  Building2,
  Landmark,
} from "lucide-react"
import { MarketCorrelations } from "./market-correlations"
import Image from "next/image"

const topTraders = [

  {
    rank: 1,
    name: "Warren Buffett",
    pnl: 8215890,
    winRate: 82.1,
    activePositions: 34,
    currentValue: 3850000,
    specialty: "Value Investing",
    badge: "legend",
    type: "investor",
  },
  {
    rank: 2,
    name: "Theo",
    pnl: 5847293,
    winRate: 68.4,
    activePositions: 142,
    currentValue: 2340000,
    specialty: "Politics",
    badge: "whale",
    type: "trader",
  },
  {
    rank: 3,
    name: "Dan Crenshaw",
    pnl: 4215890,
    winRate: 74.5,
    activePositions: 45,
    currentValue: 1950000,
    specialty: "Defense & Energy",
    badge: "senate",
    type: "politician",
  },
  {
    rank: 5,
    name: "Fredi9999",
    pnl: 3215890,
    winRate: 72.1,
    activePositions: 89,
    currentValue: 1850000,
    specialty: "Economics",
    badge: "sharp",
    type: "trader",
  },
  {
    rank: 6,
    name: "Cathie Wood",
    pnl: 2947120,
    winRate: 69.3,
    activePositions: 78,
    currentValue: 1620000,
    specialty: "Disruptive Tech",
    badge: "fund-manager",
    type: "investor",
  },
  {
    rank: 7,
    name: "SilverVVolf",
    pnl: 2847120,
    winRate: 65.8,
    activePositions: 156,
    currentValue: 1420000,
    specialty: "Sports",
    badge: "consistent",
    type: "trader",
  },
  {
    rank: 8,
    name: "Domer",
    pnl: 2156340,
    winRate: 71.2,
    activePositions: 67,
    currentValue: 980000,
    specialty: "Tech",
    badge: "sharp",
    type: "trader",
  },
  // {
  //   rank: 10,
  //   name: "Nancy Pelosi",
  //   pnl: 12847293,
  //   winRate: 78.4,
  //   activePositions: 67,
  //   currentValue: 4340000,
  //   specialty: "Tech & Finance",
  //   badge: "senate",
  //   type: "politician",
  // },
]

const platforms = [
  {
    name: "Polymarket",
    description: "Largest crypto prediction market with deep liquidity",
    icon: Globe,
    markets: "500+",
    volume: "$1.2B+",
    features: ["Real-time odds", "Deep liquidity", "Crypto settlement"],
  },
  {
    name: "Kalshi",
    description: "CFTC-regulated US prediction market exchange",
    icon: Scale,
    markets: "200+",
    volume: "$500M+",
    features: ["US regulated", "USD settlement", "Event contracts"],
  },
]

const analysisFeatures = [
  {
    title: "LLM Outcome Analysis",
    description: "AI-powered analysis of market outcomes using news, sentiment, and historical data",
    icon: Brain,
    stats: "85% accuracy",
  },
  {
    title: "Sharp Trader Tracking",
    description: "Follow and copy trades from top-performing prediction market traders",
    icon: Target,
    stats: "Top 1% traders",
  },
  {
    title: "Real-time Signals",
    description: "Instant alerts when sharp money moves on high-conviction trades",
    icon: Zap,
    stats: "5min updates",
  },
  {
    title: "Portfolio Correlation",
    description: "Analyze how prediction markets correlate with your stock positions",
    icon: BarChart3,
    stats: "Multi-asset",
  },
]

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`
  }
  return `$${value}`
}

function getBadgeVariant(badge: string) {
  switch (badge) {
    case "senate":
      return "bg-red-500/20 text-red-400 border-red-500/30"
    case "legend":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    case "fund-manager":
      return "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
    case "whale":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30"
    case "sharp":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    case "consistent":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30"
    case "veteran":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case "politician":
      return Landmark
    case "investor":
      return Building2
    default:
      return Users
  }
}

export function PredictionMarketsSection() {
  const [selectedTrader, setSelectedTrader] = useState<string | null>(null)

  return (
    <section id="prediction-markets" className="py-24 bg-muted/30 overflow-hidden">
      <div className="container mx-auto px-4 max-w-7xl">


        <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-16">
          <div className="text-center">
            <Badge variant="outline" className="mb-4 border-cyan-500/50 text-cyan-400">
              Prediction Markets Intelligence
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-balance">Polymarket & Kalshi Analysis</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto text-pretty">
              Research-based LLM analysis on prediction market outcomes with copy trading signals from top investors,
              senators, and traders
            </p>
          </div>
          <Image
            src="/images/image-polymarket-sphere.jpg"
            alt="Polymarket Sphere"
            width={250}
            height={200}
            className="object-cover rounded-lg flex-shrink-0"
          />
        </div>

        {/* Platform Cards */}
        {/* <div className="grid md:grid-cols-2 gap-6 mb-16">
          {platforms.map((platform) => (
            <Card key={platform.name} className="bg-card/50 border-border/50 backdrop-blur">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                    <platform.icon className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{platform.name}</CardTitle>
                    <CardDescription>{platform.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6 mb-4">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{platform.markets}</p>
                    <p className="text-sm text-muted-foreground">Active Markets</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-400">{platform.volume}</p>
                    <p className="text-sm text-muted-foreground">Total Volume</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {platform.features.map((feature) => (
                    <Badge key={feature} variant="secondary" className="bg-muted/50">
                      {feature}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div> */}

        {/* Analysis Features */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {analysisFeatures.map((feature) => (
            <Card key={feature.title} className="bg-card/30 border-border/50 backdrop-blur">
              <CardContent className="p-6">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 w-fit mb-4">
                  <feature.icon className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{feature.description}</p>
                <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400">
                  {feature.stats}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>



        {/* Copy Trading Leaderboard */}
        <Card className="bg-card/50 border-border/50 backdrop-blur max-w-4xl mx-auto">
          <CardHeader>



            <div id="copy-trading" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="w-full flex justify-center">
                <div className="flex justify-center mb-2">

                  <Image
                    src="/images/copy-trading-leaders.jpg"
                    alt="AI Trading Floor with Multiple Agents"
                    width={400}
                    height={400}
                    className="object-cover max-w-full h-auto"
                  />
                </div>
              </div>

            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Rank</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Trader</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Overall PnL</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Win Rate</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground hidden md:table-cell">
                      Active Positions
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground hidden lg:table-cell">
                      Current Value
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {topTraders.map((trader) => {
                    const TypeIcon = getTypeIcon(trader.type)
                    return (
                      <tr
                        key={trader.rank}
                        className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${selectedTrader === trader.name ? "bg-cyan-500/5" : ""
                          }`}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            {trader.rank <= 3 ? (
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${trader.rank === 1
                                  ? "bg-amber-500/20 text-amber-400"
                                  : trader.rank === 2
                                    ? "bg-slate-400/20 text-slate-300"
                                    : "bg-orange-600/20 text-orange-400"
                                  }`}
                              >
                                {trader.rank}
                              </div>
                            ) : (
                              <span className="text-muted-foreground w-6 text-center">{trader.rank}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 flex items-center justify-center border border-cyan-500/30">
                              <TypeIcon className="w-4 h-4 text-cyan-400" />
                            </div>
                            <div>
                              <p className="font-medium">{trader.name}</p>
                              <div className="flex items-center gap-2">
                                <Badge className={`text-xs ${getBadgeVariant(trader.badge)}`}>{trader.badge}</Badge>
                                <span className="text-xs text-muted-foreground">{trader.specialty}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                            <span className="font-semibold text-emerald-400">{formatCurrency(trader.pnl)}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className={trader.winRate >= 70 ? "text-emerald-400" : "text-foreground"}>
                            {trader.winRate}%
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right hidden md:table-cell text-muted-foreground">
                          {trader.activePositions}
                        </td>
                        <td className="py-4 px-4 text-right hidden lg:table-cell text-muted-foreground">
                          {formatCurrency(trader.currentValue)}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <Button
                            size="sm"
                            variant={selectedTrader === trader.name ? "default" : "outline"}
                            className={
                              selectedTrader === trader.name
                                ? "bg-cyan-500 hover:bg-cyan-600"
                                : "border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
                            }
                            onClick={() => setSelectedTrader(selectedTrader === trader.name ? null : trader.name)}
                          >
                            {selectedTrader === trader.name ? "Following" : "Copy"}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <Button
                variant="outline"
                className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 bg-transparent"
                asChild
              >
                <a href="https://polymarketanalytics.com/traders" target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4 mr-2" />
                  View Full Leaderboard
                </a>
              </Button>
            </div>

            {/* LLM Analysis Preview */}
            <div className="mt-8 p-6 rounded-xl bg-gradient-to-br from-cyan-500/5 to-emerald-500/5 border border-cyan-500/20">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                  <Brain className="w-6 h-6 text-cyan-400" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    LLM Outcome Analysis
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Live</Badge>
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Our AI agents analyze prediction market data alongside news sentiment, social media trends, and
                    historical patterns to identify high-probability outcomes and arbitrage opportunities.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="p-3 rounded-lg bg-background/50">
                      <p className="text-xs text-muted-foreground mb-1">Markets Analyzed</p>
                      <p className="text-lg font-semibold">1,247</p>
                    </div>
                    <div className="p-3 rounded-lg bg-background/50">
                      <p className="text-xs text-muted-foreground mb-1">Avg. Edge Detected</p>
                      <p className="text-lg font-semibold text-emerald-400">+4.2%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-background/50">
                      <p className="text-xs text-muted-foreground mb-1">Sharp Money Alerts</p>
                      <p className="text-lg font-semibold text-cyan-400">23 today</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Market Correlations Section */}
        <MarketCorrelations />
      </div>
    </section>
  )
}
