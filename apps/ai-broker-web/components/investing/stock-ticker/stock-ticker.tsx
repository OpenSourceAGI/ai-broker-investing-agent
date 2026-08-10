"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
import { defaultWatchlist, BATCH_SIZE, BATCH_DELAY } from "./constants"
import { useTickerConfig } from "@/lib/ui-config"
import type { TickerData, WatchlistItem, TickerItemProps } from "./types"

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
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const batchLoadRef = useRef<NodeJS.Timeout | null>(null)
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)

  const updateTickerDataInBatches = useCallback(async () => {
    const symbols = watchlist.map((item) => item.symbol)
    const totalBatches = Math.ceil(symbols.length / BATCH_SIZE)

    // Reset ticker data when starting fresh
    setTickerData([])
    setCurrentBatchIndex(0)

    const loadBatch = async (batchIndex: number) => {
      const startIdx = batchIndex * BATCH_SIZE
      const endIdx = Math.min(startIdx + BATCH_SIZE, symbols.length)
      const batchSymbols = symbols.slice(startIdx, endIdx)

      if (batchSymbols.length > 0) {
        const data = await fetchTickerData(batchSymbols)
        if (data.length > 0) {
          setTickerData((prev) => [...prev, ...data])
        }
      }

      // Schedule next batch if there are more
      const nextBatchIndex = (batchIndex + 1) % totalBatches
      setCurrentBatchIndex(nextBatchIndex)

      if (batchLoadRef.current) {
        clearTimeout(batchLoadRef.current)
      }

      // If we've completed all batches, wait before starting over
      // Otherwise, wait the delay before loading the next batch
      batchLoadRef.current = setTimeout(() => {
        if (nextBatchIndex === 0) {
          // Starting over - reload all batches
          setTickerData([])
        }
        loadBatch(nextBatchIndex)
      }, BATCH_DELAY)
    }

    // Start loading the first batch
    loadBatch(0)
  }, [watchlist])

  const updateTickerData = useCallback(async () => {
    const symbols = watchlist.map((item) => item.symbol)
    const data = await fetchTickerData(symbols)
    if (data.length > 0) {
      setTickerData(data)
    }
  }, [watchlist])

  useEffect(() => {
    // Start batched loading on mount
    updateTickerDataInBatches()

    return () => {
      // Cleanup batch loading timeout
      if (batchLoadRef.current) {
        clearTimeout(batchLoadRef.current)
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [updateTickerDataInBatches])

  // Pause/Resume batch loading
  useEffect(() => {
    if (isPaused && batchLoadRef.current) {
      clearTimeout(batchLoadRef.current)
    } else if (!isPaused) {
      // Resume batch loading when unpaused
      updateTickerDataInBatches()
    }
  }, [isPaused, updateTickerDataInBatches])

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
