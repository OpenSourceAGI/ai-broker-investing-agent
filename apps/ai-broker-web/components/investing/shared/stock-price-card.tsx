"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, Activity, TrendingUp, TrendingDown, RefreshCw } from "lucide-react"
import { StockPriceChart } from "@/components/investing/charts/stock-price-chart"
import { ChangeIcon } from "@/components/investing/stock-ticker/change-icon"
import { cn } from "@/lib/utils"

interface HistoricalData {
  date: string
  close: number
  open: number
  high: number
  low: number
  volume?: number
}

interface PriceChanges {
  daily: number | null
  weekly: number | null
  monthly: number | null
  yearly: number | null
}

interface StockPriceCardProps {
  symbol: string
  name?: string
  currentPrice?: number
  range?: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y"
  showControls?: boolean
  className?: string
}

// Helper function to calculate price changes from history
const calculatePriceChanges = (history: HistoricalData[], currentPrice: number): PriceChanges => {
  if (!history || history.length === 0) {
    return { daily: null, weekly: null, monthly: null, yearly: null }
  }

  const now = new Date()
  const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Find price at different time points
  const findPriceAtDaysAgo = (daysAgo: number): number | null => {
    const targetDate = new Date(now)
    targetDate.setDate(targetDate.getDate() - daysAgo)
    const targetDateStr = targetDate.toISOString().split('T')[0]

    // Find the closest price point before or at the target date
    for (let i = sortedHistory.length - 1; i >= 0; i--) {
      if (sortedHistory[i].date <= targetDateStr) {
        return sortedHistory[i].close
      }
    }
    return null
  }

  const dailyPrice = findPriceAtDaysAgo(1)
  const weeklyPrice = findPriceAtDaysAgo(7)
  const monthlyPrice = findPriceAtDaysAgo(30)
  const yearlyPrice = findPriceAtDaysAgo(365)

  return {
    daily: dailyPrice !== null ? ((currentPrice - dailyPrice) / dailyPrice) * 100 : null,
    weekly: weeklyPrice !== null ? ((currentPrice - weeklyPrice) / weeklyPrice) * 100 : null,
    monthly: monthlyPrice !== null ? ((currentPrice - monthlyPrice) / monthlyPrice) * 100 : null,
    yearly: yearlyPrice !== null ? ((currentPrice - yearlyPrice) / yearlyPrice) * 100 : null,
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

export function StockPriceCard({
  symbol,
  name,
  currentPrice,
  range = "1mo",
  showControls = true,
  className,
}: StockPriceCardProps) {
  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRange, setSelectedRange] = useState(range)
  const [price, setPrice] = useState(currentPrice)
  const [priceChanges, setPriceChanges] = useState<PriceChanges>({
    daily: null,
    weekly: null,
    monthly: null,
    yearly: null,
  })

  const fetchData = async (refresh = false) => {
    try {
      setLoading(true)

      // Fetch quote if we don't have current price
      if (!price) {
        const quoteRes = await fetch(`/api/stocks/quote/${symbol}`)
        const quoteData = await quoteRes.json()
        if (quoteData.success) {
          setPrice(quoteData.data.price.regularMarketPrice)
        }
      }

      // Fetch historical data
      const cacheParam = refresh ? 'cache=false' : ''
      const response = await fetch(`/api/stocks/historical/${symbol}?range=${selectedRange}&interval=1d&${cacheParam}`)
      const data = await response.json()

      if (data.success && data.data) {
        setHistoricalData(data.data)

        // Calculate price changes
        const latestPrice = price || data.data[data.data.length - 1]?.close
        if (latestPrice) {
          const changes = calculatePriceChanges(data.data, latestPrice)
          setPriceChanges(changes)
        }
      }
    } catch (error) {
      console.error('Error fetching stock data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [symbol, selectedRange])

  const ranges = [
    { value: "1d", label: "1D" },
    { value: "5d", label: "5D" },
    { value: "1mo", label: "1M" },
    { value: "3mo", label: "3M" },
    { value: "6mo", label: "6M" },
    { value: "1y", label: "1Y" },
  ]

  return (
    <Card className={cn("p-6", className)}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">{symbol}</h3>
              {price && (
                <Badge variant="outline" className="font-mono">
                  ${price.toFixed(2)}
                </Badge>
              )}
            </div>
            {name && <p className="text-sm text-muted-foreground mt-1">{name}</p>}
          </div>

          {showControls && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          )}
        </div>

        {/* Price Changes */}
        {!loading && price && (
          <div className="flex items-center gap-1 flex-wrap">
            {priceChanges.daily !== null && (
              <div
                className={cn(
                  "flex font-bold items-center text-xs rounded-md gap-0 px-1",
                  getChangeTextColor(priceChanges.daily, priceChanges.daily >= 0),
                  getChangeBackgroundClass(priceChanges.daily, priceChanges.daily >= 0),
                  getChangeBorderClass(priceChanges.daily, priceChanges.daily >= 0)
                )}
              >
                <span className="font-mono tabular-nums">
                  {priceChanges.daily >= 0 ? '+' : ''}{priceChanges.daily.toFixed(2)}%
                </span>
                <ChangeIcon letter="d" direction={getChangeDirection(priceChanges.daily)} isPositive={priceChanges.daily >= 0} />
              </div>
            )}
            {priceChanges.weekly !== null && (
              <div
                className={cn(
                  "flex items-center font-semibold text-xs rounded-md gap-0 px-1",
                  getChangeTextColor(priceChanges.weekly, priceChanges.weekly >= 0),
                  getChangeBackgroundClass(priceChanges.weekly, priceChanges.weekly >= 0),
                  getChangeBorderClass(priceChanges.weekly, priceChanges.weekly >= 0)
                )}
              >
                <span className="font-mono tabular-nums">
                  {priceChanges.weekly >= 0 ? '+' : ''}{priceChanges.weekly.toFixed(2)}%
                </span>
                <ChangeIcon letter="w" direction={getChangeDirection(priceChanges.weekly)} isPositive={priceChanges.weekly >= 0} />
              </div>
            )}
            {priceChanges.monthly !== null && (
              <div
                className={cn(
                  "flex items-center font-semibold text-xs rounded-md gap-0 px-1",
                  getChangeTextColor(priceChanges.monthly, priceChanges.monthly >= 0),
                  getChangeBackgroundClass(priceChanges.monthly, priceChanges.monthly >= 0),
                  getChangeBorderClass(priceChanges.monthly, priceChanges.monthly >= 0)
                )}
              >
                <span className="font-mono tabular-nums">
                  {priceChanges.monthly >= 0 ? '+' : ''}{priceChanges.monthly.toFixed(2)}%
                </span>
                <ChangeIcon letter="m" direction={getChangeDirection(priceChanges.monthly)} isPositive={priceChanges.monthly >= 0} />
              </div>
            )}
            {priceChanges.yearly !== null && (
              <div
                className={cn(
                  "flex items-center font-semibold text-xs rounded-md gap-0 px-1",
                  getChangeTextColor(priceChanges.yearly, priceChanges.yearly >= 0),
                  getChangeBackgroundClass(priceChanges.yearly, priceChanges.yearly >= 0),
                  getChangeBorderClass(priceChanges.yearly, priceChanges.yearly >= 0)
                )}
              >
                <span className="font-mono tabular-nums">
                  {priceChanges.yearly >= 0 ? '+' : ''}{priceChanges.yearly.toFixed(2)}%
                </span>
                <ChangeIcon letter="y" direction={getChangeDirection(priceChanges.yearly)} isPositive={priceChanges.yearly >= 0} />
              </div>
            )}
          </div>
        )}

        {/* Chart */}
        {loading ? (
          <div className="h-[120px] flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden border border-border bg-card">
            <StockPriceChart data={historicalData} height={120} />
          </div>
        )}

        {/* Range Controls */}
        {showControls && (
          <div className="flex gap-2 flex-wrap">
            {ranges.map((r) => (
              <Button
                key={r.value}
                variant={selectedRange === r.value ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedRange(r.value as any)}
                disabled={loading}
              >
                {r.label}
              </Button>
            ))}
          </div>
        )}

        {/* Data Info */}
        {!loading && historicalData.length > 0 && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Activity className="h-3 w-3" />
            {historicalData.length} data points • {selectedRange.toUpperCase()} range
          </div>
        )}
      </div>
    </Card>
  )
}
