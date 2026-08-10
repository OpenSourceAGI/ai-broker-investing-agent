"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { Chart, CandlestickSeries, LineSeries, HistogramSeries, AreaSeries, TimeScale, TimeScaleFitContentTrigger, Pane } from "lightweight-charts-react-components"
import { Button } from "@/components/ui/button"
import { rsi, macd, atr, stochasticOscillator, cci, obv } from "indicatorts"
import { TagInput, Tag } from "@/components/ui/tag-input"
import { Loader2 } from "lucide-react"
import { setStateInURL } from "@/lib/utils"
// Import types from lightweight-charts to avoid conflicts
import { type IChartApi, type Time, type LogicalRange } from "lightweight-charts"

interface ChartData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface TradeSignal {
  date: string
  time: number
  action: 'BUY' | 'SELL'
  price: number
}

interface StockChartProps {
  data: ChartData[]
  symbol: string
  onRangeChange?: (range: string, interval: string) => void
  tradeSignals?: TradeSignal[]
  onLoadMoreData?: (fromDate: string, toDate: string) => Promise<ChartData[]>
}

type ChartType = "candlestick" | "line" | "area"

// Available technical indicators
const INDICATOR_SUGGESTIONS: Tag[] = [
  { id: "rsi", value: "rsi", label: "RSI", type: "indicator" },
  { id: "macd", value: "macd", label: "MACD", type: "indicator" },
  { id: "atr", value: "atr", label: "ATR", type: "indicator" },
  { id: "stochastic", value: "stochastic", label: "Stochastic", type: "indicator" },
  { id: "cci", value: "cci", label: "CCI", type: "indicator" },
  { id: "obv", value: "obv", label: "OBV", type: "indicator" },
]

export function StockChart({ data: initialData, symbol, onRangeChange, tradeSignals = [] }: StockChartProps) {
  const [activeTags, setActiveTags] = useState<Tag[]>([])
  const [showVolume, setShowVolume] = useState(true)
  const [chartType, setChartType] = useState<ChartType>("candlestick")
  const [selectedRange, setSelectedRange] = useState("1y")
  const [secondaryData, setSecondaryData] = useState<Record<string, ChartData[]>>({})
  const [chartData, setChartData] = useState<ChartData[]>(initialData)
  const [loadingData, setLoadingData] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const candlestickSeriesRef = useRef<any>(null)
  const lineSeriesRef = useRef<any>(null)
  const areaSeriesRef = useRef<any>(null)
  const chartRef = useRef<any>(null)

  // Update internal state when props change, but being careful not to overwrite cumulative data unless symbol changes
  useEffect(() => {
    // If symbol changed, reset data completely
    setChartData(initialData)
  }, [symbol])

  // If initialData updates for the *same* symbol (e.g. range change from parent), we might replace or merge.
  // For now, let's assume parent range change replaces data.
  // We'll trust initialData unless we are in "infinite scroll" mode where we manually append.
  useEffect(() => {
    // Basic check: if initialData is significantly different or we don't have data, update.
    // This might clash with fetchMoreData if parent also updates. 
    // ideally parent handles "initial" load only.
    if (initialData.length > 0 && (chartData.length === 0 || initialData[0].date !== chartData[0].date || initialData[initialData.length - 1].date !== chartData[chartData.length - 1].date)) {
      // Merging strategy could be complex. For validity, if sizes match closer to initial, take it.
      // However, if we just fetched MORE data locally, we don't want to revert to `initialData` if it's smaller.
      if (chartData.length < initialData.length) {
        setChartData(initialData);
      }
    }
  }, [initialData])


  // Initialize indicators from URL or Default
  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    const urlState = setStateInURL(null) as Record<string, string>
    const indicators = urlState.indicators

    if (indicators) {
      const initialTags = indicators.split(',').map((id: string) =>
        INDICATOR_SUGGESTIONS.find(t => t.id === id)
      ).filter(Boolean) as Tag[]

      if (initialTags.length > 0) {
        setActiveTags(prev => {
          const symbolTags = prev.filter(t => t.type === 'symbol')
          // Avoid duplicates
          const existingIds = new Set(symbolTags.map(t => t.id));
          const newTags = initialTags.filter(t => !existingIds.has(t.id));
          return [...symbolTags, ...newTags]
        })
      }
    } else {
      // DEFAULT: Enable all indicators if none specified AND no symbols
      setActiveTags(prev => {
        if (prev.length > 0) return prev; // Don't override if already set

        const symbolTags = prev.filter(t => t.type === 'symbol')
        const defaultIndicators = INDICATOR_SUGGESTIONS.filter(t => t.type === 'indicator')
        return [...symbolTags, ...defaultIndicators]
      })
    }
  }, [])

  // Sync indicators to URL
  useEffect(() => {
    const indicators = activeTags
      .filter(t => t.type === 'indicator')
      .map(t => t.id)
      .join(',')

    setStateInURL({ indicators })
  }, [activeTags])

  // Fetch data for new stock tags (comparison overlays)
  useEffect(() => {
    const fetchMissingData = async () => {
      const stockTags = activeTags.filter(t => t.type === "symbol" && t.value !== symbol && !secondaryData[t.value])

      if (stockTags.length === 0) return

      setLoadingData(true)
      try {
        const promises = stockTags.map(async (tag) => {
          const rangeParam = selectedRange === "1y" ? "1y" : selectedRange
          const intervalParam = "1d"

          const res = await fetch(`/api/stocks/historical/${tag.value}?range=${rangeParam}&interval=${intervalParam}`)
          const json = await res.json()
          if (json.success) {
            return { symbol: tag.value, data: json.data }
          }
          return null
        })

        const results = await Promise.all(promises)
        setSecondaryData(prev => {
          const next = { ...prev }
          results.forEach(r => {
            if (r) next[r.symbol] = r.data
          })
          return next
        })

      } catch (error) {
        console.error("Failed to fetch secondary data", error)
      } finally {
        setLoadingData(false)
      }
    }

    fetchMissingData()
  }, [activeTags, symbol, selectedRange, secondaryData])

  // Search function for TagInput
  const handleStockSearch = useCallback(async (query: string) => {
    const res = await fetch(`/api/stocks/autocomplete?q=${encodeURIComponent(query)}&limit=5`)
    const json = await res.json()
    if (json.success) {
      return json.data.map((item: any) => ({
        id: item.symbol,
        value: item.symbol,
        label: item.name,
        type: "symbol"
      }))
    }
    return []
  }, [])

  // --- Dynamic Loading / Infinite Scroll Logic ---
  const fetchMoreData = useCallback(async (currentOldestTime: number) => {
    if (loadingMore) return;

    // Calculate period to fetch (e.g., 1 year prior to oldest current data)
    // currentOldestTime is in seconds
    const currentOldestDate = new Date(currentOldestTime * 1000);

    // Stop if we are already far back (e.g. 50 years) to prevent loops
    if (currentOldestDate.getFullYear() < 1980) return;

    console.log("[StockChart] Loading more data prior to", currentOldestDate.toISOString());
    setLoadingMore(true);

    try {
      const endDate = currentOldestTime; // Fetch up to current oldest
      const startDate = new Date(currentOldestDate);
      startDate.setFullYear(startDate.getFullYear() - 1); // 1 year back
      const startDateTimestamp = Math.floor(startDate.getTime() / 1000);

      // Use generic API which accepts periods
      const res = await fetch(`/api/stocks/historical/${symbol}?interval=1d&period1=${startDateTimestamp}&period2=${endDate}`);
      const json = await res.json();

      if (json.success && json.data && json.data.length > 0) {
        const newPoints: ChartData[] = json.data.map((d: any) => ({
          date: d.date || d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume
        })).filter((d: ChartData) => d.open && d.close);

        // Deduplicate
        const existingDates = new Set(chartData.map(d => d.date));
        const uniqueNew = newPoints.filter(d => !existingDates.has(d.date));

        if (uniqueNew.length > 0) {
          // Combine and Sort
          const combined = [...uniqueNew, ...chartData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          setChartData(combined);
          console.log("[StockChart] Appended", uniqueNew.length, "points");
        }
      }
    } catch (e) {
      console.error("[StockChart] Error fetching more data", e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, symbol, chartData]);


  // Handler for visible range changes
  const onVisibleRangeChange = (range: LogicalRange | null) => {
    // We need to check if we are near the start (left side) of the data
    if (!range || !candlestickSeriesRef.current) return;

    // barsInLogicalRange tells us indices
    const barsInfo = candlestickSeriesRef.current.barsInLogicalRange(range);

    // If barsBefore is small (e.g. less than 50 bars hidden to the left), load more!
    if (barsInfo && barsInfo.barsBefore !== null && barsInfo.barsBefore < 50) {
      if (chartData.length > 0) {
        const firstTime = Math.floor(new Date(chartData[0].date).getTime() / 1000);
        // Debounce/Throttle done by loadingMore flag interaction in fetchMoreData
        fetchMoreData(firstTime);
      }
    }
  };


  if (chartData.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-muted-foreground relative">
        {loadingData ? <Loader2 className="animate-spin" /> : "No chart data available"}
      </div>
    )
  }

  // --- Data Transformation Memoization ---

  const times = useMemo(() => chartData.map(d => Math.floor(new Date(d.date).getTime() / 1000) as Time), [chartData])

  const candlestickData = useMemo(() => chartData.map((item, i) => ({
    time: times[i],
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
  })), [chartData, times])

  const lineData = useMemo(() => chartData.map((item, i) => ({
    time: times[i],
    value: item.close,
  })), [chartData, times])

  const volumeData = useMemo(() => chartData.map((item, i) => ({
    time: times[i],
    value: item.volume,
    color: item.close >= item.open ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)",
  })).filter(item => item.value > 0), [chartData, times])

  const indicatorSeries = useMemo(() => {
    const closes = chartData.map(d => d.close)
    const highs = chartData.map(d => d.high)
    const lows = chartData.map(d => d.low)
    const volumes = chartData.map(d => d.volume)

    return activeTags.filter(t => t.type === "indicator").map(tag => {
      try {
        switch (tag.value) {
          case "rsi": {
            const values = rsi(closes, { period: 14 })
            return {
              id: tag.id, // Ensure unique ID for key
              type: "line",
              name: "RSI (14)",
              data: values.map((v: any, i: number) => ({
                time: times[i + (closes.length - values.length)],
                value: v
              })).filter((x: any) => x.value != null && !isNaN(x.value)),
              options: { color: "#2196F3", lineWidth: 2, priceScaleId: tag.id, scaleMargins: { top: 0.1, bottom: 0.1 } }
            }
          }
          case "macd": {
            const { macdLine, signalLine } = macd(closes, { fast: 12, slow: 26, signal: 9 })
            const offset = closes.length - macdLine.length
            const histogram = macdLine.map((m: any, i: number) => m - signalLine[i])

            return {
              id: tag.id,
              type: "macd",
              name: "MACD",
              data: {
                macd: macdLine.map((v: any, i: number) => ({ time: times[i + offset], value: v })).filter((x: any) => x.value != null && !isNaN(x.value)),
                signal: signalLine.map((v: any, i: number) => ({ time: times[i + offset], value: v })).filter((x: any) => x.value != null && !isNaN(x.value)),
                histogram: histogram.map((v: any, i: number) => ({
                  time: times[i + offset],
                  value: v,
                  color: v >= 0 ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)"
                })).filter((x: any) => x.value != null && !isNaN(x.value))
              }
            }
          }
          case "atr": {
            const { atrLine } = atr(highs, lows, closes, { period: 14 })
            const offset = closes.length - atrLine.length
            return {
              id: tag.id,
              type: "line",
              name: "ATR (14)",
              data: atrLine.map((v: any, i: number) => ({ time: times[i + offset], value: v })).filter((x: any) => x.value != null && !isNaN(x.value)),
              options: { color: "#FF9800", lineWidth: 2, priceScaleId: tag.id }
            }
          }
          case "stochastic": {
            const { k, d } = stochasticOscillator(highs, lows, closes, { kPeriod: 14, dPeriod: 3 })
            const offset = closes.length - k.length
            return {
              id: tag.id,
              type: "stochastic",
              name: "Stoch (14, 3)",
              data: {
                k: k.map((v: any, i: number) => ({ time: times[i + offset], value: v })).filter((x: any) => x.value != null && !isNaN(x.value)),
                d: d.map((v: any, i: number) => ({ time: times[i + offset], value: v })).filter((x: any) => x.value != null && !isNaN(x.value)),
              }
            }
          }
          case "cci": {
            const values = cci(highs, lows, closes, { period: 20 })
            const offset = closes.length - values.length
            return {
              id: tag.id,
              type: "line",
              name: "CCI (20)",
              data: values.map((v: any, i: number) => ({ time: times[i + offset], value: v })).filter((x: any) => x.value != null && !isNaN(x.value)),
              options: { color: "#9C27B0", lineWidth: 2, priceScaleId: tag.id }
            }
          }
          case "obv": {
            const values = obv(closes, volumes)
            return {
              id: tag.id,
              type: "line",
              name: "OBV",
              data: values.map((v: any, i: number) => ({ time: times[i], value: v })).filter((x: any) => x.value != null && !isNaN(x.value)),
              options: { color: "#4CAF50", lineWidth: 2, priceScaleId: tag.id }
            }
          }
        }
      } catch (e) {
        console.error("Indicator error", e)
      }
      return null
    }).filter(Boolean)
  }, [chartData, activeTags, times])

  const overlaySeries = useMemo(() => {
    return activeTags
      .filter(t => t.type === "symbol" && t.value !== symbol && secondaryData[t.value])
      .map((tag, idx) => {
        const sData = secondaryData[tag.value]
        const color = ["#ff5722", "#e91e63", "#9c27b0"][idx % 3]
        return {
          id: tag.id,
          name: tag.value,
          data: sData.map(d => ({
            time: Math.floor(new Date(d.date).getTime() / 1000) as Time,
            value: d.close
          })),
          options: { color, lineWidth: 2 }
        }
      })
  }, [activeTags, secondaryData, symbol])


  const chartOptions = {
    layout: {
      background: { color: "transparent" },
      textColor: "#888888",
    },
    grid: {
      vertLines: { color: "#2a2a2a" },
      horzLines: { color: "#2a2a2a" },
    },
    crosshair: { mode: 1 },
    height: 500,
  }

  const candlestickOptions = {
    upColor: "#22c55e",
    downColor: "#ef4444",
    borderUpColor: "#22c55e",
    borderDownColor: "#ef4444",
    wickUpColor: "#22c55e",
    wickDownColor: "#ef4444",
  }

  const ranges = [
    { value: "1d", label: "1D", interval: "5m" },
    { value: "5d", label: "5D", interval: "15m" },
    { value: "1mo", label: "1M", interval: "1h" },
    { value: "6mo", label: "6M", interval: "1d" },
    { value: "1y", label: "1Y", interval: "1d" },
    { value: "5y", label: "5Y", interval: "1wk" },
  ]

  const chartTypes = [
    { value: "candlestick", label: "Candlestick" },
    { value: "line", label: "Line" },
    { value: "area", label: "Area" },
  ]

  const handleRangeChange = (range: string, interval: string) => {
    setSelectedRange(range)
    if (onRangeChange) {
      onRangeChange(range, interval)
    }
  }

  const markers = useMemo(() => {
    if (!tradeSignals || tradeSignals.length === 0) return []
    return tradeSignals.map(signal => ({
      time: signal.time as Time,
      position: signal.action === 'BUY' ? 'belowBar' : 'aboveBar' as any,
      color: signal.action === 'BUY' ? '#22c55e' : '#ef4444',
      shape: signal.action === 'BUY' ? 'arrowUp' : 'arrowDown' as any,
      text: signal.action,
    }))
  }, [tradeSignals])

  useEffect(() => {
    let activeSeries: any = null
    if (chartType === 'candlestick' && candlestickSeriesRef.current) activeSeries = candlestickSeriesRef.current
    else if (chartType === 'line' && lineSeriesRef.current) activeSeries = lineSeriesRef.current
    else if (chartType === 'area' && areaSeriesRef.current) activeSeries = areaSeriesRef.current

    if (activeSeries && markers.length > 0) {
      try {
        activeSeries.setMarkers(markers)
      } catch (error) { console.error('Error setting markers:', error) }
    }
  }, [markers, chartType])

  return (
    <div className="w-full space-y-4">
      {/* Chart Controls */}
      <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
        {/* Top Row: Tag Input + Basic Controls */}
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          <div className="flex-1 min-w-[300px]">
            <TagInput
              placeholder="Add indicators (RSI, MACD) or symbols (AAPL)..."
              tags={activeTags}
              onTagsChange={setActiveTags}
              suggestions={INDICATOR_SUGGESTIONS}
              onSearch={handleStockSearch}
            />
          </div>

          <div className="flex gap-2 items-center">
            <Button
              variant={showVolume ? "default" : "outline"}
              size="sm"
              onClick={() => setShowVolume(!showVolume)}
            >
              {showVolume ? "Hide Volume" : "Show Volume"}
            </Button>
          </div>
        </div>

        {/* Second Row: Time & Type */}
        <div className="flex flex-wrap gap-4 items-center justify-between border-t border-border/50 pt-2">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-muted-foreground mr-1">Range:</span>
            {ranges.map((range) => (
              <Button
                key={range.value}
                variant={selectedRange === range.value ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleRangeChange(range.value, range.interval)}
              >
                {range.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-muted-foreground mr-1">Type:</span>
            {chartTypes.map((type) => (
              <Button
                key={type.value}
                variant={chartType === type.value ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setChartType(type.value as ChartType)}
              >
                {type.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {(loadingData || loadingMore) && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background/80 p-2 rounded-md flex items-center shadow-md">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-xs">{loadingMore ? "Loading history..." : "Loading data..."}</span>
        </div>
      )}

      {/* Chart */}
      <div className="relative border rounded-lg overflow-hidden bg-card">
        <Chart
          ref={chartRef}
          key={`chart-${showVolume}-${activeTags.length}-${chartType}`}
          options={chartOptions}
        >

          {/* Main price pane (Pane 0) */}
          <Pane stretchFactor={3}>
            {chartType === "candlestick" && (
              <CandlestickSeries
                ref={candlestickSeriesRef}
                data={candlestickData}
                options={candlestickOptions}
              />
            )}
            {chartType === "line" && (
              <LineSeries
                ref={lineSeriesRef}
                data={lineData}
                options={{ color: "#2196F3", lineWidth: 2 as any }}
              />
            )}
            {chartType === "area" && (
              <AreaSeries
                ref={areaSeriesRef}
                data={lineData}
                options={{
                  topColor: "rgba(33, 150, 243, 0.4)",
                  bottomColor: "rgba(33, 150, 243, 0.0)",
                  lineColor: "#2196F3",
                  lineWidth: 2 as any
                }}
              />
            )}

            {overlaySeries.map(series => (
              <LineSeries
                key={series.id}
                data={series.data}
                options={series.options as any}
              />
            ))}
          </Pane>

          {showVolume && (
            <Pane stretchFactor={1}>
              <HistogramSeries
                data={volumeData}
                options={{ priceFormat: { type: "volume" } }}
              />
            </Pane>
          )}

          {indicatorSeries.map((indicator: any) => (
            <Pane key={indicator.id} stretchFactor={1}>
              {indicator.type === "macd" ? (
                <>
                  <LineSeries data={indicator.data.macd} options={{ color: "#2196F3", lineWidth: 1 }} />
                  <LineSeries data={indicator.data.signal} options={{ color: "#FF9800", lineWidth: 1 }} />
                  <HistogramSeries data={indicator.data.histogram} />
                </>
              ) : indicator.type === "stochastic" ? (
                <>
                  <LineSeries data={indicator.data.k} options={{ color: "#2196F3", lineWidth: 1 }} />
                  <LineSeries data={indicator.data.d} options={{ color: "#FF9800", lineWidth: 1 }} />
                </>
              ) : (
                <LineSeries data={indicator.data} options={indicator.options as any} />
              )}
            </Pane>
          ))}

          <TimeScale
            onVisibleLogicalRangeChange={onVisibleRangeChange}
          >
            <TimeScaleFitContentTrigger deps={[chartData.length > 0 ? chartData[0].date : 0, activeTags.length, showVolume, chartType]} />
          </TimeScale>
        </Chart>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground px-2">
        {activeTags.length > 0 && <span>Active:</span>}
        {activeTags.map(tag => (
          <span key={tag.id} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${tag.type === 'indicator' ? 'bg-blue-500' : 'bg-pink-500'}`}></span>
            {tag.label}
          </span>
        ))}
      </div>
    </div>
  )
}
