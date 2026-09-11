"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
// @ts-ignore
import { ArrowLeft, Loader2, TrendingUp, TrendingDown, DollarSign, Activity, BarChart3, Star, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useSession } from "@/lib/auth/client"
import { DynamicStockChart } from "@/components/investing/charts/dynamic-stock-chart"
import { useDebouncedSymbol } from "@/lib/stocks/use-debounced-symbol"
import { TradeModal } from "@/components/investing/trading/trade-modal"

// Helper function to get stock logo URLs
function getStockLogoUrl(symbol: string, useGithub: boolean = true): string {
  // if (useGithub) {
  //   return `https://github.com/nvstly/icons/blob/main/ticker_icons/${symbol}.png?raw=true`
  // }
  return `https://img.logo.dev/ticker/${symbol}?token=pk_TttrZhYwSReZxFePkXo-Bg&size=38&retina=true`
}

interface QuoteData {
  symbol: string
  price: {
    regularMarketPrice: number
    regularMarketChange: number
    regularMarketChangePercent: number
    regularMarketOpen: number
    regularMarketDayHigh: number
    regularMarketDayLow: number
    regularMarketVolume: number
    marketCap: number
    exchangeName?: string
    longName?: string
    shortName?: string
    marketState?: string
    sector?: string
    industry?: string
  }
  summaryDetail: {
    fiftyTwoWeekHigh: number
    fiftyTwoWeekLow: number
    averageVolume: number
    dividendYield: number
    beta: number
    trailingPE: number
    sector?: string
    industry?: string
    longBusinessSummary?: string
  }
  defaultKeyStatistics: {
    enterpriseValue: number
    profitMargins: number
    trailingEps?: number
  }
  financialData?: {
    targetMeanPrice?: number
  }
  summaryProfile?: {
    sector?: string
    industry?: string
    longBusinessSummary?: string
  }
  peers?: string[]
}

interface TradeSignal {
  date: string
  time: number
  action: 'BUY' | 'SELL'
  price: number
}

interface QuoteViewProps {
  symbol: string
  showBackButton?: boolean
  tradeSignals?: TradeSignal[]
}

/**
 * Off-site destinations for a ticker. Research also carries what used to be the
 * separate Social and Filings groups — one entry each is not worth its own
 * section header.
 */
type ExternalLink = { name: string; host: string; href: (symbol: string) => string }

const EXTERNAL_LINKS: { brokers: ExternalLink[]; research: ExternalLink[] } = {
  brokers: [
    { name: "Robinhood", host: "robinhood.com", href: (s) => `https://robinhood.com/stocks/${s}` },
    { name: "Webull", host: "webull.com", href: (s) => `https://app.webull.com/stocks/${s}` },
    {
      name: "Fidelity",
      host: "fidelity.com",
      href: (s) =>
        `https://digital.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=${s}`,
    },
  ],
  research: [
    { name: "Yahoo Finance", host: "finance.yahoo.com", href: (s) => `https://finance.yahoo.com/quote/${s}` },
    { name: "TradingView", host: "tradingview.com", href: (s) => `https://www.tradingview.com/symbols/${s}` },
    { name: "Google Finance", host: "google.com", href: (s) => `https://www.google.com/finance/quote/${s}` },
    { name: "MarketWatch", host: "marketwatch.com", href: (s) => `https://www.marketwatch.com/investing/stock/${s}` },
    { name: "Finviz", host: "finviz.com", href: (s) => `https://finviz.com/quote.ashx?t=${s}` },
    { name: "Stocktwits", host: "stocktwits.com", href: (s) => `https://stocktwits.com/symbol/${s}` },
    {
      name: "SEC EDGAR",
      host: "sec.gov",
      href: (s) =>
        `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${s}&type=&dateb=&owner=exclude&count=40`,
    },
  ],
}

/** Google's public favicon service — no key, and it falls back to a generic globe. */
const faviconUrl = (host: string) =>
  `https://www.google.com/s2/favicons?domain=${host}&sz=64`

function ExternalLinkItem({ link, symbol }: { link: ExternalLink; symbol: string }) {
  return (
    <DropdownMenuItem asChild>
      <a href={link.href(symbol)} target="_blank" rel="noopener noreferrer">
        <img
          src={faviconUrl(link.host)}
          alt=""
          aria-hidden="true"
          width={16}
          height={16}
          loading="lazy"
          className="mr-2 h-4 w-4 rounded-sm"
        />
        {link.name}
      </a>
    </DropdownMenuItem>
  )
}

export function QuoteView({ symbol: inputSymbol, showBackButton = true, tradeSignals = [] }: QuoteViewProps) {
  // The parent feeds this straight from a search box, so it changes on every
  // keystroke. Settle it before fetching: otherwise typing "GOOGL" sends a
  // quote plus three historical requests for each of GOO, GOOG and GOOGL.
  const symbol = useDebouncedSymbol(inputSymbol)
  const router = useRouter()
  const { data: session } = useSession()
  const [data, setData] = useState<QuoteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [isInWatchlist, setIsInWatchlist] = useState(false)
  const [watchlistLoading, setWatchlistLoading] = useState(false)
  const [tradeModalOpen, setTradeModalOpen] = useState(false)
  const [peerStockInfo, setPeerStockInfo] = useState<Map<string, { name: string; marketCap: number }>>(new Map())
  const [industryInfo, setIndustryInfo] = useState<{ emoji: string; number: number; name: string } | null>(null)
  const [sectorInfo, setSectorInfo] = useState<{ emoji: string; number: number; name: string } | null>(null)

  // Sector emoji mapping
  const sectorEmojis: Record<string, string> = {
    'Finance': '💰',
    'Real Estate': '🏢',
    'Consumer Discretionary': '🛍️',
    'Technology': '💻',
    'Industrials': '🏭',
    'Health Care': '🏥',
    'Basic Materials': '⚗️',
    'Consumer Staples': '🛒',
    'Energy': '⚡',
    'Miscellaneous': '📦',
    'Utilities': '💡',
    'Telecommunications': '📞',
  }

  // Fetch industry and sector info from stock-names.json and sectors-industries.json
  useEffect(() => {
    if (!symbol) return

    const loadIndustryAndSectorInfo = async () => {
      try {
        // Import stock names to get the industryId for this symbol
        const { stockNames: stockNamesData } = await import('investing/stocks')
        const stockData = stockNamesData.find(
          (stock) => stock[0] === symbol.toUpperCase()
        )

        if (!stockData) return

        const industryId = stockData[2] // Third element is industryId

        // Import sectors-industries data
        // Format: { sectors: { name: number }, industries: [[id, name, emoji, sectorId], ...] }
        const sectorsIndustriesData = await import('@/packages/investing/src/stock-names-data/sectors-industries.json')
        const industries = sectorsIndustriesData.industries as Array<[number, string, string, number]>
        const sectors = sectorsIndustriesData.sectors as Record<string, number>

        // Find the industry by industryId
        const industryMatch = industries.find((ind) => ind[0] === industryId)

        if (industryMatch) {
          const [id, name, emoji, sectorId] = industryMatch
          setIndustryInfo({
            number: id,
            name: name,
            emoji: emoji,
          })

          // Find the sector name from sectorId
          const sectorEntry = Object.entries(sectors).find(([_, num]) => num === sectorId)
          if (sectorEntry) {
            const [sectorName, sectorNumber] = sectorEntry
            const sectorEmoji = sectorEmojis[sectorName] || '📊'
            setSectorInfo({
              number: sectorNumber,
              name: sectorName,
              emoji: sectorEmoji,
            })
          }
        }
      } catch (error) {
        console.error('Error loading industry/sector info:', error)
      }
    }

    loadIndustryAndSectorInfo()
  }, [symbol])

  // Fetch peer stock information from stock-names.json
  useEffect(() => {
    if (!data?.peers || data.peers.length === 0) return

    const loadStockInfo = async () => {
      try {
        // Import stock names and clean function from investing package
        const { stockNames: stockNamesData, cleanCompanyName } = await import('investing/stocks')
        const infoMap = new Map<string, { name: string; marketCap: number }>()

        data.peers?.slice(0, 10).forEach((peerSymbol: string) => {
          const stockData = stockNamesData.find(
            (stock) => stock[0] === peerSymbol.toUpperCase()
          )
          if (stockData) {
            infoMap.set(peerSymbol, {
              name: cleanCompanyName(stockData[1]),
              marketCap: stockData[3], // Market cap is in millions
            })
          }
        })

        setPeerStockInfo(infoMap)
      } catch (error) {
        console.error('Error loading stock info:', error)
      }
    }

    loadStockInfo()
  }, [data?.peers])

  // Check if symbol is in watchlist
  useEffect(() => {
    if (!symbol || !session?.user) {
      setIsInWatchlist(false)
      return
    }

    const checkWatchlist = async () => {
      try {
        const res = await fetch('/api/user/watchlist')

        // Handle 401 gracefully - user is not authenticated
        if (res.status === 401) {
          setIsInWatchlist(false)
          return
        }

        const json = await res.json()
        if (json.success && json.data) {
          const inWatchlist = json.data.some((item: any) => item.symbol === symbol.toUpperCase())
          setIsInWatchlist(inWatchlist)
        }
      } catch (err) {
        // Silently handle errors - watchlist is a non-critical feature
        setIsInWatchlist(false)
      }
    }

    checkWatchlist()
  }, [symbol, session])

  useEffect(() => {
    if (!symbol) {
      setLoading(false)
      return
    }

    // Abort the previous symbol's request when the symbol changes again, so a
    // slow response for an earlier ticker cannot overwrite the current one.
    const controller = new AbortController()

    const fetchQuote = async () => {
      try {
        setLoading(true)
        setError("") // Clear any previous errors

        const res = await fetch(`/api/stocks/quote/${encodeURIComponent(symbol)}`, {
          signal: controller.signal,
        })
        const json = await res.json()
        if (controller.signal.aborted) return

        if (json.success && json.data) {
          setData(json.data)
          setError("") // Clear error on success
        } else {
          setData(null)
          setError(json.error || "Failed to fetch quote data")
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return
        console.error(err)
        setError("An error occurred while fetching data")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    fetchQuote()
    return () => controller.abort()
  }, [symbol])


  // New state for performance metrics
  const [performance, setPerformance] = useState<{
    day: number | null,
    week: number | null,
    month: number | null,
    month3: number | null,
    month6: number | null,
    year: number | null,
    year5: number | null,
    ytd: number | null
  }>({
    day: null,
    week: null,
    month: null,
    month3: null,
    month6: null,
    year: null,
    year5: null,
    ytd: null
  })

  // Fetch historical data for calculating performance metrics
  useEffect(() => {
    if (!symbol) return

    const controller = new AbortController()

    const fetchPerformanceData = async () => {
      try {
        const hasRows = (payload: any) =>
          payload?.success && Array.isArray(payload.data) && payload.data.length > 0

        const fetchRange = async (range: string) => {
          const res = await fetch(
            `/api/stocks/historical/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
            { signal: controller.signal },
          )
          return res.json()
        }

        // Shorter ranges are a fallback for symbols whose history does not go
        // back five years. A 400/404 means the symbol itself is no good, so
        // stop there rather than asking twice more for the same missing stock.
        let json = await fetchRange("5y")
        for (const range of ["2y", "1y"]) {
          if (hasRows(json) || json?.code === "INVALID_SYMBOL" || json?.code === "SYMBOL_NOT_FOUND") break
          json = await fetchRange(range)
        }
        if (controller.signal.aborted) return

        if (json.success && json.data && Array.isArray(json.data)) {
          const history = json.data
          if (history.length === 0) return

          const currentPrice = history[history.length - 1].close
          const now = new Date()

          const findPriceAtDate = (targetDate: Date) => {
            // Find closest date in history (going backwards)
            const targetTime = targetDate.getTime()
            // Sort by difference
            const closest = history.reduce((prev: any, curr: any) => {
              return (Math.abs(new Date(curr.date).getTime() - targetTime) < Math.abs(new Date(prev.date).getTime() - targetTime) ? curr : prev);
            });
            return closest.close;
          }

          const getChange = (daysAgo: number) => {
            const targetDate = new Date()
            targetDate.setDate(now.getDate() - daysAgo)
            const startPrice = findPriceAtDate(targetDate)
            return startPrice ? ((currentPrice - startPrice) / startPrice) : null
          }

          const getDateChange = (targetDate: Date) => {
            const startPrice = findPriceAtDate(targetDate)
            return startPrice ? ((currentPrice - startPrice) / startPrice) : null
          }

          // Calculate available metrics based on data range
          const oldestDate = new Date(history[0].date)
          const dataRangeDays = Math.floor((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24))

          setPerformance({
            day: dataRangeDays >= 1 ? getChange(1) : null,
            week: dataRangeDays >= 7 ? getChange(7) : null,
            month: dataRangeDays >= 30 ? getChange(30) : null,
            month3: dataRangeDays >= 90 ? getChange(90) : null,
            month6: dataRangeDays >= 180 ? getChange(180) : null,
            year: dataRangeDays >= 365 ? getChange(365) : null,
            year5: dataRangeDays >= 365 * 5 ? getChange(365 * 5) : null, // Will likely be null with 1-2y data
            ytd: getDateChange(new Date(new Date().getFullYear(), 0, 1))
          })
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return
        // Silently handle errors - performance metrics are non-critical
        console.error("Performance data fetch error:", err)
      }
    }

    fetchPerformanceData()
    return () => controller.abort()
  }, [symbol])

  const toggleWatchlist = async () => {
    if (!session?.user) {
      alert('Please sign in to add to watchlist')
      return
    }

    setWatchlistLoading(true)
    try {
      if (isInWatchlist) {
        // Remove from watchlist
        const res = await fetch(`/api/user/watchlist?symbol=${symbol}`, {
          method: 'DELETE',
        })
        const json = await res.json()
        if (json.success) {
          setIsInWatchlist(false)
        }
      } else {
        // Add to watchlist
        const res = await fetch('/api/user/watchlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            symbol: symbol.toUpperCase(),
            name: data?.price?.longName || data?.price?.shortName || symbol,
          }),
        })
        const json = await res.json()
        if (json.success) {
          setIsInWatchlist(true)
        }
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error)
    } finally {
      setWatchlistLoading(false)
    }
  }

  // Helper to format large numbers
  const formatNumber = (num: number) => {
    if (!num) return "N/A"
    return new Intl.NumberFormat('en-US', {
      notation: "compact",
      maximumFractionDigits: 0
    }).format(num)
  }

  // Helper to format currency
  const formatCurrency = (num: number) => {
    if (num === undefined || num === null) return "N/A"
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num)
  }

  // Helper to format percent
  const formatPercent = (num: number) => {
    if (num === undefined || num === null) return "N/A"
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num)
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 p-6 flex-col">
        {showBackButton && (
          <Link href="/dashboard">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Button>
          </Link>
        )}
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <h3 className="text-lg font-bold">Error Loading Quote</h3>
              <p>{error || "Stock data not found"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const price = data.price || {}
  const summary = data.summaryDetail || {}

  const isPositive = price.regularMarketChange >= 0

  return (
    <div className="flex flex-1 flex-col p-4 lg:p-6">
      <div className="w-full max-w-7xl mx-auto space-y-6">

        {/* Header Section */}
        <div className="flex flex-col gap-4">
          {/* Stock Info Row */}
          <div className="flex items-center gap-3 flex-wrap">
            <img
              src={getStockLogoUrl(symbol, true)}
              alt={`${symbol} logo`}
              className="w-10 h-10 rounded object-contain flex-shrink-0 bg-white"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                if (target.src.includes('github.com')) {
                  target.src = getStockLogoUrl(symbol, false)
                } else {
                  target.style.display = 'none'
                }
              }}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-semibold">{price.longName || price.shortName || symbol}</span>
              <Badge variant="outline" className="font-mono text-base px-2 py-0.5">
                {symbol}
              </Badge>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground">${formatNumber(price.marketCap)}</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground">
                P/E {summary.trailingPE ? summary.trailingPE.toFixed(2) : "N/A"}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in...
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Brokers</DropdownMenuLabel>
                  {EXTERNAL_LINKS.brokers.map((link) => (
                    <ExternalLinkItem key={link.name} link={link} symbol={symbol} />
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Research</DropdownMenuLabel>
                  {EXTERNAL_LINKS.research.map((link) => (
                    <ExternalLinkItem key={link.name} link={link} symbol={symbol} />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {session?.user && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleWatchlist}
                    disabled={watchlistLoading}
                    className="h-8 w-8"
                    title={isInWatchlist ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    <Star
                      className={`h-5 w-5 ${isInWatchlist
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                        }`}
                    />
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setTradeModalOpen(true)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Buy / Short
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Price Chart with Lazy Loading */}
        <DynamicStockChart
          symbol={symbol}
          initialRange="1y"
          interval="1d"
          performance={performance}
        />

        {/* Key Stats Grid */}


        {/* SEC Filings Link */}
        {/* <Card>
            <CardHeader>
                <CardTitle>SEC Filings</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        View official SEC filings for {symbol} including 10-K, 10-Q, 8-K reports and ownership forms.
                    </p>
                    <div className="flex gap-2">
                        <Link href={`/api/stocks/filings/${symbol}`} target="_blank">
                            <Button variant="outline" size="sm">
                                View JSON Data
                            </Button>
                        </Link>
                        <Link href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${symbol}&type=&dateb=&owner=exclude&count=40`} target="_blank">
                            <Button variant="outline" size="sm">
                                View on SEC.gov
                            </Button>
                        </Link>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Note: Some companies may not have SEC filings or use different ticker symbols for SEC reporting.
                    </p>
                </div>
            </CardContent>
         </Card> */}



        {/* Industry & Peers */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Industry & Sector</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Sector</div>
                  <div className="text-lg font-bold flex items-center gap-2">
                    {sectorInfo?.emoji && <span>{sectorInfo.emoji}</span>}
                    {sectorInfo?.name || data.summaryProfile?.sector || data.summaryDetail?.sector || data.price?.sector || "N/A"}
                    {sectorInfo?.number && (
                      <span className="text-sm text-muted-foreground">#{sectorInfo.number}</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Industry</div>
                  <div className="text-lg font-bold flex items-center gap-2">
                    {industryInfo?.emoji && <span>{industryInfo.emoji}</span>}
                    {industryInfo?.name || data.summaryProfile?.industry || data.summaryDetail?.industry || data.price?.industry || "N/A"}
                    {industryInfo?.number && (
                      <span className="text-sm text-muted-foreground">#{industryInfo.number}</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Description</div>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {data.summaryProfile?.longBusinessSummary || "No description available."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Related Stocks</CardTitle>
            </CardHeader>
            <CardContent>
              {data.peers && data.peers.length > 0 ? (
                <div className="space-y-2">
                  {data.peers.slice(0, 10).map((peerSymbol: string) => {
                    const stockInfo = peerStockInfo.get(peerSymbol)
                    return (
                      <Link key={peerSymbol} href={`/stock/${peerSymbol}`}>
                        <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="flex items-center gap-3">
                            <img
                              src={getStockLogoUrl(peerSymbol, true)}
                              alt={`${peerSymbol} logo`}
                              className="w-6 h-6 rounded object-contain flex-shrink-0 bg-white"
                              onError={(e) => {
                                // Fallback to img.logo.dev if GitHub icon fails to load
                                const target = e.target as HTMLImageElement
                                if (target.src.includes('github.com')) {
                                  target.src = getStockLogoUrl(peerSymbol, false)
                                } else {
                                  target.style.display = 'none'
                                }
                              }}
                            />
                            <Badge variant="outline" className="font-mono">
                              {peerSymbol}
                            </Badge>
                            <span className="text-sm font-medium">
                              {stockInfo?.name || peerSymbol}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {stockInfo?.marketCap ? formatNumber(stockInfo.marketCap * 1000000) : 'N/A'}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No related stocks found.</div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Trade Modal */}
      <TradeModal
        open={tradeModalOpen}
        onOpenChange={setTradeModalOpen}
        symbol={symbol}
        currentPrice={price.regularMarketPrice}
        stockName={price.longName || price.shortName || symbol}
      />
    </div>
  )
}
