import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap,
  Globe,
  TrendingUp,
  DollarSign,
  CheckCircle,
  ArrowRight,
  Lock,
  Smartphone,
  BarChart3,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { InfoTooltip } from "@/components/landing/info-tooltip";

export function BrokerPlatformsSection() {
  const brokers = [
    {
      name: "Alpaca",
      logo: "https://i.imgur.com/d8JZhkL.png",
      description:
        "Commission-free API-first trading for stocks, ETFs, and crypto",
      features: [
        "Developer-friendly REST & WebSocket API",
        "Paper trading for testing",
        "Real-time market data",
        "Fractional shares support",
      ],
      assets: ["US Stocks", "ETFs", "Crypto"],
      color: "from-yellow-500 to-orange-500",
      icon: Zap,
      status: "Active",
      docs: "https://alpaca.markets",
    },
    {
      name: "Polymarket",
      logo: "https://i.imgur.com/wgC2nEU.png",
      description:
        "Decentralized prediction market platform for trading on real-world events",
      features: [
        "Trade on news & events",
        "Polygon blockchain-based",
        "Real-time market data",
        "Social trading features",
      ],
      assets: ["Prediction Markets", "Events", "Politics", "Crypto"],
      color: "from-purple-500 to-violet-600",
      icon: BarChart3,
      status: "Active",
      docs: "https://polymarket.com",
    },
    {
      name: "Robinhood",
      logo: "https://i.imgur.com/5Pfj1iS.png",
      description:
        "Popular retail platform with simple API and zero commissions",
      features: [
        "Zero-commission trades",
        "Easy-to-use interface",
        "Crypto trading included",
        "Cash management features",
      ],
      assets: ["US Stocks", "ETFs", "Options", "Crypto"],
      color: "from-pink-500 to-rose-600",
      icon: TrendingUp,
      status: "Coming Soon",
      docs: "https://robinhood.com",
    },
    {
      name: "Webull",
      logo: "https://i.imgur.com/SbT9hzR.png",
      description:
        "Modern mobile-first platform with advanced charting and API",
      features: [
        "Commission-free trading",
        "Level 2 market data",
        "Extended hours trading",
        "Social trading features",
      ],
      assets: ["US Stocks", "ETFs", "Options", "Crypto"],
      color: "from-green-500 to-emerald-600",
      icon: Smartphone,
      status: "Coming Soon",
      docs: "https://www.webull.com",
    },
    {
      name: "Interactive Brokers",
      logo: "https://i.imgur.com/RnvCj2J.png",
      description:
        "Global institutional-grade trading with comprehensive API access",
      features: [
        "135+ markets worldwide",
        "Stocks, options, futures, FX, bonds",
        "TWS API & FIX protocol",
        "Low margin rates",
      ],
      assets: ["Global Stocks", "Options", "Futures", "FX"],
      color: "from-blue-500 to-indigo-600",
      icon: Globe,
      status: "Coming Soon",
      docs: "https://www.interactivebrokers.com/en/trading/ib-api.php",
    },
  ];
  return (
    <section className="relative sm:px-6 lg:px-8 bg-muted/30">
      <div className="mx-auto max-w-7xl">
        {/* Flow Arrow */}
        <div className="my-8 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2">
            <span className="text-sm text-muted-foreground">
              Order flow to auto trade on
            </span>
            <ArrowRight className="h-4 w-4 text-primary" />
          </div>
        </div>

        {/* Broker Cards Grid */}
        <div className="flex gap-4 overflow-x-auto pb-4 mb-12 custom-scrollbar">
          {brokers.map((broker) => (
            <Card
              key={broker.name}
              className="group relative flex-shrink-0 w-52 overflow-hidden hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/50"
            >
              {/* Gradient Background */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${broker.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}
              />

              <div className="p-4 relative">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-14 flex items-center justify-center bg-white p-1.5 rounded-md">
                      {broker.logo.startsWith("http") ? (
                        <img
                          src={broker.logo}
                          alt={`${broker.name} logo`}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-4xl">{broker.logo}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold">{broker.name}</h3>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge
                          variant={
                            broker.status === "Active" ? "default" : "secondary"
                          }
                          className="text-xs"
                        >
                          {broker.status === "Active" ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" /> Active
                            </>
                          ) : (
                            <>🚀 {broker.status}</>
                          )}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <InfoTooltip>
                      <p className="mb-1.5">{broker.description}</p>
                      <ul className="space-y-0.5">
                        {broker.features.map((feature, idx) => (
                          <li key={idx}>• {feature}</li>
                        ))}
                      </ul>
                    </InfoTooltip>
                    <broker.icon className={`h-6 w-6 text-primary opacity-50`} />
                  </div>
                </div>

                {/* Assets */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {broker.assets.map((asset) => (
                    <Badge key={asset} variant="outline" className="text-xs">
                      {asset}
                    </Badge>
                  ))}
                </div>

                {/*
                <Button
                  variant={broker.status === "Active" ? "default" : "outline"}
                  className="w-full group-hover:shadow-md transition-all"
                  asChild={broker.status === "Active"}
                  disabled={broker.status !== "Active"}
                >
                  {broker.status === "Active" ? (
                    <Link href="/dashboard">
                      Connect {broker.name}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  ) : (
                    <>Coming Soon</>
                  )}
                </Button> */}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
