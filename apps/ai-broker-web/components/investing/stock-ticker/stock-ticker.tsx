"use client"

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react"
import { Plus, X, Settings, Play, Pause } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { StockIntervalDelta } from "./stock-deltas"
import { fetchTickerData } from "./utils"
import { defaultWatchlist, BATCH_SIZE } from "./constants"
import {
  readTickerCache,
  writeTickerCache,
  mergeTickerData,
  msUntilStale,
} from "@/lib/stock-ticker-cache"
import { useTickerConfig } from "@/lib/ui-config"
import type { TickerData, WatchlistItem, TickerItemProps } from "./types"

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

export function StockTicker({
  showIcon: showIconProp,
  showSymbol: showSymbolProp,
  showName: showNameProp,
  showPriceStock: showPriceStockProp,
  showPriceIndex: showPriceIndexProp,
  enabledIntervals: enabledIntervalsProp,
  orderHistorical: orderHistoricalProp,
  showMinusSign: showMinusSignProp,
  showDeltaSymbols: showDeltaSymbolsProp,
  setNeutralMagnitude: setNeutralMagnitudeProp,
  fixed
}: TickerItemProps = {}) {
  const { tickerConfig } = useTickerConfig()

  // Use props if provided, otherwise use config from context
  const showIcon = showIconProp ?? tickerConfig.showIcon
  const showSymbol = showSymbolProp ?? tickerConfig.showSymbol
  const showName = showNameProp ?? tickerConfig.showName
  const showPriceStock = showPriceStockProp ?? tickerConfig.showPriceStock
  const showPriceIndex = showPriceIndexProp ?? tickerConfig.showPriceIndex
  const enabledIntervals = enabledIntervalsProp ?? tickerConfig.enabledIntervals
  const orderHistorical = orderHistoricalProp ?? tickerConfig.orderHistorical
  const showMinusSign = showMinusSignProp ?? tickerConfig.showMinusSign
  const showDeltaSymbols = showDeltaSymbolsProp ?? tickerConfig.showDeltaSymbols
  const setNeutralMagnitude = setNeutralMagnitudeProp ?? tickerConfig.setNeutralMagnitude

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(defaultWatchlist)
  const [tickerData, setTickerData] = useState<TickerData[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [newSymbol, setNewSymbol] = useState("")
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState<"index" | "stock">("stock")
  const [dialogOpen, setDialogOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // When the full watchlist was last fetched; drives the stale-while-revalidate cache.
  const savedAtRef = useRef<number | null>(null)
  const refreshingRef = useRef(false)
  const tickerDataRef = useRef<TickerData[]>([])
  tickerDataRef.current = tickerData

  // Paint cached quotes before the first frame, even if they are stale.
  useIsomorphicLayoutEffect(() => {
    const cached = readTickerCache<TickerData>()
    if (!cached) return
    savedAtRef.current = cached.savedAt
    setTickerData(
      mergeTickerData([], cached.data, defaultWatchlist.map((item) => item.symbol))
    )
  }, [])

  const refresh = useCallback(
    async (symbols: string[], complete: boolean) => {
      if (refreshingRef.current) return
      refreshingRef.current = true
      const order = watchlist.map((item) => item.symbol)
      try {
        let gotAny = false
        for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
          const data = await fetchTickerData(symbols.slice(i, i + BATCH_SIZE))
          if (data.length === 0) continue
          gotAny = true
          // Replace quotes in place as each batch arrives; never blank the banner.
          const merged = mergeTickerData(tickerDataRef.current, data, order)
          tickerDataRef.current = merged
          setTickerData(merged)
          writeTickerCache(merged, savedAtRef.current ?? 0)
        }
        if (complete && gotAny) {
          savedAtRef.current = Date.now()
          writeTickerCache(tickerDataRef.current, savedAtRef.current)
        }
      } finally {
        refreshingRef.current = false
      }
    },
    [watchlist]
  )

  // Refresh when the cache is stale or missing symbols, then again whenever
  // it goes stale (TICKER_CACHE_TTL: hourly by default).
  useEffect(() => {
    if (isPaused) return
    let cancelled = false

    const run = async () => {
      const symbols = watchlist.map((item) => item.symbol)
      const entry = savedAtRef.current === null ? null : { savedAt: savedAtRef.current }
      const wait = msUntilStale(entry)
      if (wait === 0) {
        await refresh(symbols, true)
      } else {
        const have = new Set(tickerDataRef.current.map((d) => d.symbol))
        const missing = symbols.filter((s) => !have.has(s))
        if (missing.length > 0) await refresh(missing, false)
      }
      if (cancelled) return
      const next = savedAtRef.current === null ? null : { savedAt: savedAtRef.current }
      // If every fetch failed, retry in a minute rather than waiting a full TTL.
      const delay = msUntilStale(next) || 60_000
      refreshTimerRef.current = setTimeout(run, delay)
    }

    run()
    return () => {
      cancelled = true
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [isPaused, watchlist, refresh])

  // Drop removed symbols immediately.
  useEffect(() => {
    setTickerData((prev) =>
      mergeTickerData(prev, [], watchlist.map((item) => item.symbol))
    )
  }, [watchlist])

  // Auto-scroll effect with seamless loop
  useEffect(() => {
    if (isHovered || isPaused || !scrollRef.current) return

    const scrollContainer = scrollRef.current
    const scrollSpeed = 0.5

    const autoScroll = setInterval(() => {
      // When we reach halfway, reset to the beginning for seamless loop
      const halfWidth = scrollContainer.scrollWidth / 2

      if (scrollContainer.scrollLeft >= halfWidth) {
        scrollContainer.scrollLeft = 0
      } else {
        scrollContainer.scrollLeft += scrollSpeed
      }
    }, 16)

    return () => clearInterval(autoScroll)
  }, [isHovered, isPaused, tickerData])

  const addSymbol = () => {
    if (!newSymbol.trim() || !newName.trim()) return
    const exists = watchlist.some(
      (item) => item.symbol.toUpperCase() === newSymbol.toUpperCase()
    )
    if (exists) return

    setWatchlist((prev) => [
      ...prev,
      {
        symbol: newSymbol.toUpperCase(),
        name: newName,
        type: newType,
      },
    ])
    setNewSymbol("")
    setNewName("")
    setDialogOpen(false)
  }

  const removeSymbol = (symbol: string) => {
    setWatchlist((prev) => prev.filter((item) => item.symbol !== symbol))
  }

  const tickerContent = (
    <div className={cn(
      "w-full py-[1px] h-full bg-card border-b border-border flex items-center overflow-hidden max-w-full transition-all",
      tickerData.length === 0 && "h-0 border-0"
    )}>
      {/* Scrolling Ticker */}
      <div
        ref={scrollRef}
        className="overflow-x-auto z-100 flex-1 hover:cursor-grab active:cursor-grabbing scrollbar-hide"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex whitespace-nowrap">
          {tickerData.map((data, index) => (
            <StockIntervalDelta
              key={`second-${data.symbol}-${index}`}
              data={data}
              showIcon={showIcon}
              showSymbol={showSymbol}
              showName={showName}
              showPriceStock={showPriceStock}
              showPriceIndex={showPriceIndex}
              enabledIntervals={enabledIntervals}
              orderHistorical={orderHistorical}
              showMinusSign={showMinusSign}
              showDeltaSymbols={showDeltaSymbols}
              setNeutralMagnitude={setNeutralMagnitude}
            />
          ))}
        </div>
      </div>
      {/* Fixed Controls - Right Side */}
      <div className="flex items-center shrink-0 px-1 border-l border-border bg-card z-10">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsPaused(!isPaused)}
        >
          {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Settings className="h-3 w-3" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Configure Watchlist</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Add Symbol Form */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                <h4 className="text-sm font-medium">Add Symbol</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Symbol (e.g., AAPL)"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                  />
                  <Input
                    placeholder="Name (e.g., Apple)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={newType}
                    onChange={(e) =>
                      setNewType(e.target.value as "index" | "stock")
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="stock">Stock</option>
                    <option value="index">Index</option>
                  </select>
                  <Button onClick={addSymbol} size="sm" className="ml-auto">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>

              {/* Current Watchlist */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Current Symbols</h4>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {watchlist.map((item) => (
                    <div
                      key={item.symbol}
                      className="flex items-center justify-between p-2 bg-muted/30 rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">
                          {item.symbol}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {item.name}
                        </span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {item.type}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeSymbol(item.symbol)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )

  if (fixed) {
    return (
      <div className={cn(
        "sticky z-50 w-full",
        fixed === "top" ? "top-0" : "bottom-0"
      )}>
        {tickerContent}
      </div>
    )
  }

  return tickerContent
}
