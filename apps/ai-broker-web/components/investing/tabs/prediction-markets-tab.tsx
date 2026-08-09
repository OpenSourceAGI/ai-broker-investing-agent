"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { TrendingUp, ExternalLink, Loader2, DollarSign, Activity, Clock, RefreshCw, Filter, Search, Users } from "lucide-react"
import { MarketDebate } from "@/components/investing/analysis/market-debate"
import { TopHoldersList } from "@/components/investing/analysis/top-holders-list"
import { Input } from "@/components/ui/input"
import { PolymarketPriceChart } from "@/components/investing/charts/polymarket-price-chart"
import { ChangeIcon } from "@/components/investing/stock-ticker/change-icon"
import { cn } from "@/lib/utils"
import { POLYMARKET_CATEGORIES } from "@/packages/investing/src/prediction/constants"

interface PolymarketMarket {
  id: string
  question: string
  slug: string
  eventSlug?: string
  volume24hr: number
  volumeTotal: number
  active: boolean
  closed: boolean
  outcomes: string[]
  outcomePrices: string[]
  clobTokenIds?: string[]
  image?: string
  description?: string
  endDate?: string
  tags?: string[]
  category?: string
  subcategory?: string
  priceChanges?: {
    daily: number | null
    weekly: number | null
    monthly: number | null
  }
}

interface PriceHistoryData {
  timestamp: number
  price: number
}

interface PriceChanges {
  daily: number | null
  weekly: number | null
  monthly: number | null
  yearly: number | null
}

// Helper function to calculate price changes from history
const calculatePriceChanges = (history: PriceHistoryData[], currentPrice: number): PriceChanges => {
  if (!history || history.length === 0) {
    return { daily: null, weekly: null, monthly: null, yearly: null }
  }

  const now = Math.floor(Date.now() / 1000) // Current time in seconds
  const oneDay = 24 * 60 * 60
  const oneWeek = 7 * oneDay
  const oneMonth = 30 * oneDay
  const oneYear = 365 * oneDay

  // Sort history by timestamp ascending
  const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp)

  // Find price at different time points
  const findPriceAtTime = (targetTime: number): number | null => {
    // Find the closest price point before or at the target time
    for (let i = sortedHistory.length - 1; i >= 0; i--) {
      if (sortedHistory[i].timestamp <= targetTime) {
        return sortedHistory[i].price
      }
    }
    return null
  }

  const dailyPrice = findPriceAtTime(now - oneDay)
  const weeklyPrice = findPriceAtTime(now - oneWeek)
  const monthlyPrice = findPriceAtTime(now - oneMonth)
  const yearlyPrice = findPriceAtTime(now - oneYear)

  return {
    daily: dailyPrice !== null ? (currentPrice - dailyPrice) * 100 : null,
    weekly: weeklyPrice !== null ? (currentPrice - weeklyPrice) * 100 : null,
    monthly: monthlyPrice !== null ? (currentPrice - monthlyPrice) * 100 : null,
    yearly: yearlyPrice !== null ? (currentPrice - yearlyPrice) * 100 : null,
  }
}

// Get background color class based on change magnitude
const getChangeBackgroundClass = (changePercent: number, isPositive: boolean) => {
  const absChange = Math.abs(changePercent)

  if (absChange <= 2) {
    return "" // No background for small changes
  } else if (absChange >= 50) {
    return isPositive ? "bg-emerald-500/40" : "bg-red-500/40"
  } else if (absChange >= 25) {
    return isPositive ? "bg-emerald-500/30" : "bg-red-500/30"
  } else if (absChange >= 10) {
    return isPositive ? "bg-emerald-500/20" : "bg-red-500/20"
  } else {
    return isPositive ? "bg-emerald-500/10" : "bg-red-500/10"
  }
}

// Get text color class based on change magnitude
const getChangeTextColor = (changePercent: number, isPositive: boolean) => {
  const absChange = Math.abs(changePercent)
  if (absChange <= 2) {
    return "text-muted-foreground" // Muted color for small changes
  }
  return isPositive ? "text-emerald-500" : "text-red-500"
}

// Get border class for extreme changes
const getChangeBorderClass = (changePercent: number, isPositive: boolean) => {
  const absChange = Math.abs(changePercent)
  if (absChange >= 50) {
    return isPositive ? "border border-emerald-500" : "border border-red-500"
  }
  return ""
}

// Get direction for ChangeIcon
const getChangeDirection = (changePercent: number): 'positive' | 'negative' | 'neutral' => {
  const absChange = Math.abs(changePercent)
  if (absChange <= 2) {
    return 'neutral'
  }
  return changePercent >= 0 ? 'positive' : 'negative'
}

export function PredictionMarketsTab() {
  const [markets, setMarkets] = useState<PolymarketMarket[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [limit, setLimit] = useState(50)
  const [timeWindow, setTimeWindow] = useState('24h')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [hideHighProb, setHideHighProb] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [priceHistory, setPriceHistory] = useState<Record<string, PriceHistoryData[]>>({})
  const [expandedHolders, setExpandedHolders] = useState<Set<string>>(new Set())
  const observerTarget = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    setLoadingMore(true)
    const pageSize = 20
    try {
      const categoryParam = selectedCategory !== 'all' ? `&category=${selectedCategory}` : ''
      const searchParam = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ''
      const response = await fetch(`/api/polymarket/markets?limit=${pageSize}&offset=${markets.length}&window=${timeWindow}${categoryParam}${searchParam}`)
      const data = await response.json()

      if (data.success && data.markets.length > 0) {
        setMarkets(prev => [...prev, ...data.markets])
        // Fetch price history for new markets only
        fetchPriceHistoryForMarkets(data.markets, false)
      }
    } catch (error) {
      console.error('Error loading more markets:', error)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, markets.length, selectedCategory, searchTerm, timeWindow])

  useEffect(() => {
    fetchMarkets()
  }, [timeWindow, selectedCategory, searchTerm])

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && markets.length > 0) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [loading, loadingMore, markets.length, loadMore])


  const fetchMarkets = async (sync = false) => {
    try {
      setLoading(true)
      const categoryParam = selectedCategory !== 'all' ? `&category=${selectedCategory}` : ''
      const syncParam = sync ? '&sync=true' : ''
      const searchParam = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ''
      const response = await fetch(`/api/polymarket/markets?limit=${limit}&window=${timeWindow}${categoryParam}${syncParam}${searchParam}`)
      const data = await response.json()

      if (data.success) {
        setMarkets(data.markets)
        // Fetch price history for markets with token IDs
        fetchPriceHistoryForMarkets(data.markets, sync)
      }
    } catch (error) {
      console.error('Error fetching markets:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const fetchPriceHistoryForMarkets = async (marketsToFetch: PolymarketMarket[], sync = false) => {
    const historyData: Record<string, PriceHistoryData[]> = {}

    // Fetch price history for first token of each market (typically "Yes" outcome)
    for (const market of marketsToFetch) {
      if (market.clobTokenIds && market.clobTokenIds.length > 0) {
        try {
          const tokenId = market.clobTokenIds[0] // First token (usually "Yes")
          const syncParam = sync ? '&sync=true' : ''
          const response = await fetch(`/api/polymarket/price-history?tokenId=${tokenId}&interval=1h${syncParam}`)
          const data = await response.json()

          if (data.success && data.data.length > 0) {
            historyData[market.id] = data.data
          }
        } catch (error) {
          console.error(`Error fetching price history for market ${market.id}:`, error)
        }
      }
    }

    // Merge with existing price history instead of replacing
    setPriceHistory(prev => ({ ...prev, ...historyData }))
  }

  const syncMarkets = async () => {
    try {
      setSyncing(true)
      await fetchMarkets(true)
    } finally {
      setSyncing(false)
    }
  }

  const syncAllMarkets = async () => {
    try {
      setSyncing(true)
      const response = await fetch('/api/polymarket/markets/sync-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          maxMarkets: 1000,
          syncPriceHistory: true
        })
      })
      const data = await response.json()

      if (data.success) {
        console.log(`Synced ${data.markets} markets with ${data.pricePoints} price data points in ${data.duration}`)
        await fetchMarkets()
      } else {
        console.error('Sync failed:', data.error)
      }
    } catch (error) {
      console.error('Error syncing all markets:', error)
    } finally {
      setSyncing(false)
    }
  }

  const syncAllHolders = async () => {
    try {
      setSyncing(true)
      const response = await fetch('/api/polymarket/holders/sync-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          maxMarkets: 100
        })
      })
      const data = await response.json()

      if (data.success) {
        console.log(`Synced holders for ${data.successCount}/${data.marketsProcessed} markets (${data.totalHolders} total holders) in ${data.duration}`)
        await fetchMarkets()
      } else {
        console.error('Sync holders failed:', data.error)
      }
    } catch (error) {
      console.error('Error syncing all holders:', error)
    } finally {
      setSyncing(false)
    }
  }

  const formatVolume = (volume: number | undefined | null) => {
    if (!volume || isNaN(volume)) return "$0"
    if (volume >= 1000000) return `$${(volume / 1000000).toFixed(2)}M`
    if (volume >= 1000) return `$${(volume / 1000).toFixed(0)}K`
    return `$${volume.toFixed(0)}`
  }

  const toggleHoldersExpanded = (marketId: string) => {
    setExpandedHolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(marketId)) {
        newSet.delete(marketId)
      } else {
        newSet.add(marketId)
      }
      return newSet
    })
  }

  const filteredMarkets = markets.filter(market => {
    if (!hideHighProb) return true
    // Check if any outcome is > 95%
    if (!market.outcomePrices) return true
    return !market.outcomePrices.some(price => parseFloat(price) > 0.95)
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading prediction markets...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={syncMarkets}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Data
                </>
              )}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={syncAllMarkets}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync All Markets
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={syncAllHolders}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" />
                  Sync All Holders
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex gap-2">
            <Button
              variant={timeWindow === '24h' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeWindow('24h')}
            >
              24h Volume
            </Button>
            <Button
              variant={timeWindow === 'total' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeWindow('total')}
            >
              Total Volume
            </Button>
          </div>

        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search markets... (Press Enter to search)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearchTerm(searchQuery)
                }
              }}
              className="pl-9"
            />
          </div>

          <div className="flex items-center space-x-2 bg-muted/30 px-3 py-1.5 rounded-md border">
            <Checkbox
              id="hide-probs"
              checked={hideHighProb}
              onCheckedChange={(checked) => setHideHighProb(checked as boolean)}
            />
            <Label htmlFor="hide-probs" className="text-sm font-medium cursor-pointer">
              Hide &gt; 95%
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {POLYMARKET_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

      </div>

      {/* Markets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredMarkets.map((market, index) => (
          <Card key={market.id} className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Market Info */}
              <div className="flex-1">
                <div className="flex items-start gap-4 mb-4">
                  {market.image && (
                    <img
                      src={market.image}
                      alt={market.question}
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    />
                  )}

                  {/* Highest Odds Outcome Card */}
                  {market.outcomes && market.outcomePrices && (() => {
                    const highestIdx = market.outcomePrices.reduce((maxIdx, price, idx) =>
                      parseFloat(price) > parseFloat(market.outcomePrices[maxIdx]) ? idx : maxIdx
                      , 0)
                    const outcome = market.outcomes[highestIdx]
                    const percentage = parseFloat(market.outcomePrices[highestIdx]) * 100
                    const currentPrice = parseFloat(market.outcomePrices[highestIdx])
                    const isYes = outcome.toLowerCase() === 'yes'
                    const isNo = outcome.toLowerCase() === 'no'

                    return (
                      <div
                        className={`px-2 py-1.5 rounded border flex-shrink-0 ${isYes
                          ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800'
                          : isNo
                            ? 'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-800'
                            : 'bg-muted border-border'
                          }`}
                      >
                        <div className="text-[10px] font-medium text-muted-foreground">
                          {outcome}
                        </div>
                        <div className={`text-lg font-bold leading-tight ${isYes
                          ? 'text-green-600 dark:text-green-400'
                          : isNo
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-primary'
                          }`}>
                          {percentage.toFixed(1)}%
                        </div>
                      </div>
                    )
                  })()}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap flex-1">
                        {/* Price Changes */}
                        {market.priceChanges && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {market.priceChanges.daily !== null && (
                              <div
                                className={cn(
                                  "flex font-bold items-center text-xs rounded-md gap-0 px-1",
                                  getChangeTextColor(market.priceChanges.daily, market.priceChanges.daily >= 0),
                                  getChangeBackgroundClass(market.priceChanges.daily, market.priceChanges.daily >= 0),
                                  getChangeBorderClass(market.priceChanges.daily, market.priceChanges.daily >= 0)
                                )}
                              >
                                <span className="font-mono tabular-nums">
                                  {market.priceChanges.daily >= 0 ? '+' : ''}{Math.round(market.priceChanges.daily)}
                                </span>
                                <ChangeIcon letter="d" direction={getChangeDirection(market.priceChanges.daily)} isPositive={market.priceChanges.daily >= 0} />
                              </div>
                            )}
                            {market.priceChanges.weekly !== null && (
                              <div
                                className={cn(
                                  "flex items-center font-semibold text-xs rounded-md gap-0 px-1",
                                  getChangeTextColor(market.priceChanges.weekly, market.priceChanges.weekly >= 0),
                                  getChangeBackgroundClass(market.priceChanges.weekly, market.priceChanges.weekly >= 0),
                                  getChangeBorderClass(market.priceChanges.weekly, market.priceChanges.weekly >= 0)
                                )}
                              >
                                <span className="font-mono tabular-nums">
                                  {market.priceChanges.weekly >= 0 ? '+' : ''}{Math.round(market.priceChanges.weekly)}
                                </span>
                                <ChangeIcon letter="w" direction={getChangeDirection(market.priceChanges.weekly)} isPositive={market.priceChanges.weekly >= 0} />
                              </div>
                            )}
                            {market.priceChanges.monthly !== null && (
                              <div
                                className={cn(
                                  "flex items-center font-semibold text-xs rounded-md gap-0 px-1",
                                  getChangeTextColor(market.priceChanges.monthly, market.priceChanges.monthly >= 0),
                                  getChangeBackgroundClass(market.priceChanges.monthly, market.priceChanges.monthly >= 0),
                                  getChangeBorderClass(market.priceChanges.monthly, market.priceChanges.monthly >= 0)
                                )}
                              >
                                <span className="font-mono tabular-nums">
                                  {market.priceChanges.monthly >= 0 ? '+' : ''}{Math.round(market.priceChanges.monthly)}
                                </span>
                                <ChangeIcon letter="m" direction={getChangeDirection(market.priceChanges.monthly)} isPositive={market.priceChanges.monthly >= 0} />
                              </div>
                            )}
                          </div>
                        )}

                        <h3 className="text-lg font-bold leading-tight">{market.question}</h3>
                      </div>
                      {/* <Badge variant="outline" className="flex-shrink-0">
                        #{index + 1}
                      </Badge> */}
                    </div>

                    <div className="flex gap-2 flex-wrap mt-2">
                      {market.category && (
                        <div className="flex gap-1 items-center">
                          <Badge variant="default" className="text-xs font-semibold">
                            {market.category}
                          </Badge>
                          {market.subcategory && (
                            <Badge variant="outline" className="text-xs">
                              {market.subcategory}
                            </Badge>
                          )}
                        </div>
                      )}
                      {market.tags && market.tags.length > 0 && (
                        <>
                          {market.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Price History Chart */}
                {priceHistory[market.id] && priceHistory[market.id].length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                      <Activity className="h-3 w-3" />
                      Price History (1h intervals)
                    </div>
                    <div className="rounded-lg overflow-hidden border border-border bg-card p-2">
                      <PolymarketPriceChart
                        data={priceHistory[market.id]}
                        height={100}
                        showGrid={true}
                      />
                    </div>
                  </div>
                )}

                {/* Polymarket Embed */}
                <div className="mb-4 rounded-lg overflow-hidden border border-border bg-background">
                  <iframe
                    src={`https://embed.polymarket.com/market.html?market=${market.slug}&features=volume,chart&theme=dark`}
                    width="100%"
                    height="330"
                    className="w-full dark:[color-scheme:dark] light:[color-scheme:light]"
                    style={{ border: 'none' }}
                    loading="lazy"
                  />
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Activity className="h-3 w-3" />
                      24h Volume
                    </div>
                    <div className="text-lg font-bold">{formatVolume(market.volume24hr)}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <DollarSign className="h-3 w-3" />
                      Total Volume
                    </div>
                    <div className="text-lg font-bold">{formatVolume(market.volumeTotal)}</div>
                  </div>

                  {market.endDate && (
                    <div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Clock className="h-3 w-3" />
                        Ends
                      </div>
                      <div className="text-sm font-semibold">
                        {new Date(market.endDate).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Debate Analysis */}
                <div className="mt-4">
                  <MarketDebate
                    marketId={market.id}
                    question={market.question}
                    currentYesPrice={market.outcomePrices && market.outcomePrices[0] ? parseFloat(market.outcomePrices[0]) : 0.5}
                    currentNoPrice={market.outcomePrices && market.outcomePrices[1] ? parseFloat(market.outcomePrices[1]) : 0.5}
                  />
                </div>

                {/* Top Holders Button */}
                <div className="mt-4">
                  <Button
                    variant={expandedHolders.has(market.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleHoldersExpanded(market.id)}
                    className="w-full"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    {expandedHolders.has(market.id) ? "Hide Top Holders" : "Show Top Holders"}
                  </Button>
                  {expandedHolders.has(market.id) && (
                    <TopHoldersList
                      marketId={market.id}
                      eventId={undefined}
                    />
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="text-green-500 flex lg:flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(
                    market.eventSlug
                      ? `https://polymarket.com/event/${market.eventSlug}/${market.slug}`
                      : `https://polymarket.com/event/${market.slug}`,
                    '_blank'
                  )}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Bet
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Infinite scroll trigger */}
      <div ref={observerTarget} className="h-10 flex items-center justify-center">
        {loadingMore && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading more markets...</span>
          </div>
        )}
      </div>

      {
        markets.length === 0 && !loading && (
          <Card className="p-12 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">No Markets Found</h3>
            <p className="text-muted-foreground">
              {searchTerm
                ? `No markets found matching "${searchTerm}". Try a different search term.`
                : 'Unable to load prediction markets at this time.'}
            </p>
            {searchTerm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('')
                  setSearchTerm('')
                }}
                className="mt-4"
              >
                Clear Search
              </Button>
            )}
          </Card>
        )
      }
    </div >
  )
}
