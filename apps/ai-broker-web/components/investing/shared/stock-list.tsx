"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { 
  TrendingUp, 
  TrendingDown, 
  Trash2, 
  Loader2, 
  RefreshCw, 
  Plus,
  Search
} from "lucide-react"
import { useSession } from "@/lib/auth-client"
import Link from "next/link"
import { toast } from "sonner"

// Common Stock interface to unify static and dynamic data
export interface StockData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap?: number
  indicator?: number // For static lists (e.g. RSI, MACD)
}

interface StockListProps {
  title?: string
  description?: string
  // Mode: 'static' uses provided stocks, 'watchlist' fetches from DB
  mode: "static" | "watchlist"
  // For static mode
  initialStocks?: StockData[]
  // For watchlist mode
  listId?: string | null // null = favorites
  // Display options
  showIndicator?: boolean
  indicatorLabel?: string
  icon?: any
  color?: string
}

export function StockList({
  title,
  description,
  mode,
  initialStocks = [],
  listId,
  showIndicator,
  indicatorLabel,
  icon: Icon,
  color,
}: StockListProps) {
  const { data: session } = useSession()
  const [stocks, setStocks] = useState<StockData[]>(initialStocks)
  const [loading, setLoading] = useState(mode === "watchlist")
  const [refreshing, setRefreshing] = useState(false)
  const [newSymbol, setNewSymbol] = useState("")
  const [adding, setAdding] = useState(false)
  
  // For static lists, just use initialStocks
  useEffect(() => {
    if (mode === "static") {
      setStocks(initialStocks)
    }
  }, [mode, initialStocks])

  // Fetch watchlist items and quotes
  const fetchWatchlistData = useCallback(async () => {
    if (mode !== "watchlist" || !session?.user) return

    try {
      setLoading(true)
      // 1. Fetch watchlist items
      const query = listId ? `?listId=${listId}` : ""
      const res = await fetch(`/api/user/watchlist${query}`)
      const json = await res.json()
      
      if (!json.success || !json.data) {
        throw new Error("Failed to fetch watchlist")
      }

      const items = json.data

      if (items.length === 0) {
        setStocks([])
        setLoading(false)
        return
      }

      // 2. Fetch quotes in parallel
      const quotePromises = items.map(async (item: any) => {
        try {
          const qRes = await fetch(`/api/stocks/quote/${item.symbol}`)
          const qJson = await qRes.json()
          if (qJson.success && qJson.data) {
            const p = qJson.data.price
            return {
              symbol: item.symbol,
              name: p.longName || p.shortName || item.name || item.symbol,
              price: p.regularMarketPrice,
              change: p.regularMarketChange,
              changePercent: p.regularMarketChangePercent,
              volume: p.regularMarketVolume,
              marketCap: p.marketCap,
            } as StockData
          }
        } catch (e) {
          console.error(`Failed to fetch quote for ${item.symbol}`, e)
        }
        return null
      })

      const results = await Promise.all(quotePromises)
      const validStocks = results.filter((s): s is StockData => s !== null)
      setStocks(validStocks)

    } catch (err) {
      console.error("Error loading watchlist:", err)
      toast.error("Failed to load watchlist data")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [mode, listId, session])

  useEffect(() => {
    fetchWatchlistData()
  }, [fetchWatchlistData])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchWatchlistData()
  }

  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSymbol.trim()) return

    try {
      setAdding(true)
      const res = await fetch("/api/user/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: newSymbol.toUpperCase(),
          listId: listId || undefined // undefined sends nothing, null sends null (both work with my API logic, but safer to be explicit)
        })
      })

      const json = await res.json()
      if (json.success) {
        toast.success(`Added ${newSymbol.toUpperCase()} to list`)
        setNewSymbol("")
        handleRefresh()
      } else {
        toast.error(json.error || "Failed to add symbol")
      }
    } catch (err) {
      toast.error("An error occurred")
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (symbol: string) => {
    try {
      const query = listId ? `&listId=${listId}` : ""
      const res = await fetch(`/api/user/watchlist?symbol=${symbol}${query}`, {
        method: "DELETE"
      })
      const json = await res.json()
      
      if (json.success) {
        setStocks(prev => prev.filter(s => s.symbol !== symbol))
        toast.success("Removed from list")
      } else {
        toast.error(json.error || "Failed to remove")
      }
    } catch (err) {
      toast.error("Failed to remove symbol")
    }
  }

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(num)
  }

  const formatNumber = (num: number) => {
    if (!num) return "-"
    return new Intl.NumberFormat('en-US', {
      notation: "compact",
      maximumFractionDigits: 1
    }).format(num)
  }

  if (loading) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header / Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {title && <h3 className="text-lg font-semibold">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        
        {mode === "watchlist" && (
          <div className="flex items-center gap-2">
            <form onSubmit={handleAddSymbol} className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Add Symbol..."
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  className="pl-8 w-[150px] h-9"
                />
              </div>
              <Button type="submit" size="sm" disabled={adding || !newSymbol}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="sr-only">Add</span>
              </Button>
            </form>
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        )}
      </div>

      {/* Grid View of Cards */}
      {stocks.length === 0 ? (
        <div className="flex h-[150px] flex-col items-center justify-center rounded-lg border border-dashed text-center">
          <p className="text-muted-foreground">No stocks in this list</p>
          {mode === "watchlist" && (
            <p className="text-xs text-muted-foreground mt-1">Add a symbol to get started</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stocks.map((stock) => (
            <Card key={stock.symbol} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-accent">
                     {/* Try to load logo, fallback to text */}
                     <img
                      src={`https://img.logo.dev/ticker/${stock.symbol}?token=pk_TttrZhYwSReZxFePkXo-Bg&size=32&retina=true`}
                      alt={stock.symbol}
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="grid gap-0.5">
                     <Link href={`/stock/${stock.symbol}`} className="font-bold hover:underline">
                      {stock.symbol}
                     </Link>
                     <span className="text-xs text-muted-foreground truncate max-w-[100px]" title={stock.name}>
                        {stock.name}
                     </span>
                  </div>
                </div>
                {mode === "watchlist" && (
                   <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemove(stock.symbol)}>
                      <Trash2 className="h-3 w-3" />
                   </Button>
                )}
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-baseline justify-between pt-2">
                  <div className="text-2xl font-bold">
                    {formatCurrency(stock.price)}
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-medium ${stock.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {stock.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {stock.changePercent.toFixed(2)}%
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <span className="block text-[10px] uppercase">Volume</span>
                    <span className="font-medium text-foreground">{formatNumber(stock.volume)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase">Mkt Cap</span>
                    <span className="font-medium text-foreground">{formatNumber(stock.marketCap || 0)}</span>
                  </div>
                </div>
                
                {showIndicator && stock.indicator !== undefined && (
                   <div className="mt-3 border-t pt-2">
                      <div className="flex justify-between text-xs">
                         <span className="text-muted-foreground">{indicatorLabel || "Indicator"}</span>
                         <span className="font-medium">{stock.indicator.toFixed(2)}</span>
                      </div>
                   </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
