"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { Chart, CandlestickSeries, LineSeries, HistogramSeries, AreaSeries, TimeScale, TimeScaleFitContentTrigger, Pane } from "lightweight-charts-react-components"
import { Button } from "@/components/ui/button"
import { rsi, macd, atr, stochasticOscillator, cci, obv } from "indicatorts"
import { TagInput, Tag } from "@/components/ui/tag-input"
import { Loader2, CandlestickChart, TrendingUp, ChevronDown, ChevronRight } from "lucide-react"
import { setStateInURL } from "@/lib/utils"
import { type IChartApi, type Time, type LogicalRange } from "lightweight-charts"
import grab from 'grab-url';

interface DynamicStockChartProps {
  symbol: string
  initialRange?: string // '1d', '5d', '1mo', '3mo', '6mo', '1y', etc.
  interval?: string // '1m', '5m', '15m', '1h', '1d', etc.
  performance?: {
    day: number | null
    week: number | null
    month: number | null
    month3: number | null
    month6: number | null
    year: number | null
    year5: number | null
    ytd: number | null
  }
}

interface ChartData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Available technical indicators
const INDICATOR_SUGGESTIONS: Tag[] = [
  { id: "rsi", value: "rsi", label: "RSI", type: "indicator" },
  { id: "macd", value: "macd", label: "MACD", type: "indicator" },
  { id: "atr", value: "atr", label: "ATR", type: "indicator" },
  { id: "stochastic", value: "stochastic", label: "Stochastic", type: "indicator" },
  { id: "cci", value: "cci", label: "CCI", type: "indicator" },
  // { id: "obv", value: "obv", label: "OBV", type: "indicator" },
]

type ChartType = "candlestick" | "line" | "area"

/**
 * Table rows at or below this height are the separators lightweight-charts
 * draws between panes, not panes themselves.
 */
const SEPARATOR_MAX_HEIGHT = 10

export function DynamicStockChart({
  symbol,
  initialRange = "1y",
  interval = "1d",
  performance
}: DynamicStockChartProps) {
  const [activeTags, setActiveTags] = useState<Tag[]>([])
  const [showVolume, setShowVolume] = useState(true)
  // Ids of the panes below the price chart the user has folded away.
  const [collapsedPanes, setCollapsedPanes] = useState<Set<string>>(new Set())
  // Pixel offset and height of each rendered pane, read back from the chart so
  // the labels sit on the pane they name instead of being guessed from the
  // stretch factors.
  const [paneLayout, setPaneLayout] = useState<{ top: number; height: number }[]>([])
  const [chartType, setChartType] = useState<ChartType>("candlestick")
  const [selectedRange, setSelectedRange] = useState(initialRange)
  const [secondaryData, setSecondaryData] = useState<Record<string, ChartData[]>>({})
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candlestickSeriesRef = useRef<any>(null)
  const lineSeriesRef = useRef<any>(null)
  const areaSeriesRef = useRef<any>(null)
  const chartRef = useRef<any>(null)
  const chartWrapperRef = useRef<HTMLDivElement>(null)
  const lastSymbol = useRef<string>(symbol)

  // Fetch initial data on mount or symbol change
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoadingData(true)
      setError(null)
      try {
        const json = await grab('stocks/historical/' + symbol, {
          range: selectedRange,
          interval
        })

        if (json.error) {
          setError(json.error || "Network error")
          return
        }

        // Handle both nested data structure (data.data) and flat structure (data)
        const dataArray = Array.isArray(json.data?.data) ? json.data.data :
          Array.isArray(json.data) ? json.data : null;

        if (json.success && dataArray) {
          const transformedData: ChartData[] = dataArray.map((d: any) => ({
            date: d.date || d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume
          })).filter((d: ChartData) => d.open && d.close)
          setChartData(transformedData)
        } else {
          const errorMsg = json.error || json.hint || "Failed to load data - invalid response format"
          console.error("Invalid API response:", json)
          setError(errorMsg)
        }
      } catch (e) {
        console.error("Error fetching initial chart data", e)
        setError("Failed to fetch chart data")
      } finally {
        setLoadingData(false)
      }
    }

    // Fetch data whenever symbol, selectedRange, or interval changes
    fetchInitialData()
  }, [symbol, selectedRange, interval])

  // Initialize indicators from URL or Default
  useEffect(() => {
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
          const existingIds = new Set(symbolTags.map(t => t.id));
          const newTags = initialTags.filter(t => !existingIds.has(t.id));
          return [...symbolTags, ...newTags]
        })
      }
    } else {
      setActiveTags(prev => {
        if (prev.length > 0) return prev;
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

      try {
        const promises = stockTags.map(async (tag) => {
          const rangeParam = selectedRange === "1y" ? "1y" : selectedRange
          const intervalParam = "1d"

          const res = await fetch(`/api/stocks/historical/${tag.value}?range=${rangeParam}&interval=${intervalParam}`)
          const json = await res.json()
          if (json.success) {
            // Handle both nested data structure (data.data) and flat structure (data)
            const dataArray = Array.isArray(json.data?.data) ? json.data.data :
              Array.isArray(json.data) ? json.data : null;
            return { symbol: tag.value, data: dataArray }
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

    const currentOldestDate = new Date(currentOldestTime * 1000);
    if (currentOldestDate.getFullYear() < 1980) return;

    console.log("[DynamicStockChart] Loading more data prior to", currentOldestDate.toISOString());
    setLoadingMore(true);

    try {
      const endDate = currentOldestTime;
      const startDate = new Date(currentOldestDate);
      startDate.setFullYear(startDate.getFullYear() - 1);
      const startDateTimestamp = Math.floor(startDate.getTime() / 1000);

      const res = await fetch(`/api/stocks/historical/${symbol}?interval=1d&period1=${startDateTimestamp}&period2=${endDate}`);
      const json = await res.json();

      // Handle both nested data structure (data.data) and flat structure (data)
      const dataArray = Array.isArray(json.data?.data) ? json.data.data :
        Array.isArray(json.data) ? json.data : null;

      if (json.success && dataArray && dataArray.length > 0) {
        const newPoints: ChartData[] = dataArray.map((d: any) => ({
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
        }
      }
    } catch (e) {
      console.error("[DynamicStockChart] Error fetching more data", e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, symbol, chartData]);

  /**
   * Pick the bar size that suits a visible window of `spanDays`.
   *
   * Zooming does not change the data underneath it, so a chart loaded at daily
   * bars stays daily however far in you go — past a few weeks the candles are
   * just stretched apart with nothing between them. Matching the interval to
   * the span means zooming in actually resolves more detail.
   */
  const intervalForSpan = (spanDays: number): string => {
    if (spanDays <= 2) return "5m"
    if (spanDays <= 10) return "15m"
    if (spanDays <= 60) return "1h"
    if (spanDays <= 365 * 3) return "1d"
    return "1wk"
  }

  /** Bar size currently loaded; starts at the caller's choice. */
  const loadedInterval = useRef<string>(interval)
  const zoomFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoomFetchController = useRef<AbortController | null>(null)

  /**
   * Reload the visible window at `nextInterval`. Requests the exact window on
   * screen rather than a named range, so the bars returned are the ones being
   * looked at.
   */
  const refetchForZoom = useCallback(async (fromSec: number, toSec: number, nextInterval: string) => {
    zoomFetchController.current?.abort()
    const controller = new AbortController()
    zoomFetchController.current = controller

    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/stocks/historical/${encodeURIComponent(symbol)}?interval=${nextInterval}&period1=${Math.floor(fromSec)}&period2=${Math.ceil(toSec)}`,
        { signal: controller.signal }
      )
      const json = await res.json()
      if (controller.signal.aborted) return

      const dataArray = Array.isArray(json.data?.data) ? json.data.data :
        Array.isArray(json.data) ? json.data : null

      if (json.success && dataArray && dataArray.length > 0) {
        const rebased: ChartData[] = dataArray.map((d: any) => ({
          date: d.date || d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume
        })).filter((d: ChartData) => d.open && d.close)

        if (rebased.length > 0) {
          loadedInterval.current = nextInterval
          // Replacing the series re-runs the indicator memos against the new
          // bars, so RSI/MACD/etc. are recomputed at the zoomed resolution.
          setChartData(rebased.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()))
        }
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return
      console.error("[DynamicStockChart] Zoom refetch failed", e)
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false)
    }
  }, [symbol])

  // Handler for visible range changes
  const onVisibleRangeChange = (range: LogicalRange | null) => {
    if (!range || !candlestickSeriesRef.current || chartData.length === 0) return;

    // barsInLogicalRange tells us indices
    // Safely access barsInLogicalRange if it exists on the series API
    const seriesApi = candlestickSeriesRef.current;
    if (seriesApi && seriesApi.barsInLogicalRange) {
      const barsInfo = seriesApi.barsInLogicalRange(range);

      if (barsInfo && barsInfo.barsBefore !== null && barsInfo.barsBefore < 50) {
        const firstTime = Math.floor(new Date(chartData[0].date).getTime() / 1000);
        fetchMoreData(firstTime);
      }
    }

    // Re-resolve the data to the zoom level, once the zooming settles. Wheel
    // events fire continuously, so without the delay this would issue a request
    // per notch.
    const firstIndex = Math.max(0, Math.floor(range.from))
    const lastIndex = Math.min(chartData.length - 1, Math.ceil(range.to))
    if (lastIndex <= firstIndex) return

    const fromSec = new Date(chartData[firstIndex].date).getTime() / 1000
    const toSec = new Date(chartData[lastIndex].date).getTime() / 1000
    const spanDays = (toSec - fromSec) / 86400
    if (!Number.isFinite(spanDays) || spanDays <= 0) return

    const nextInterval = intervalForSpan(spanDays)
    if (nextInterval === loadedInterval.current) return

    if (zoomFetchTimer.current) clearTimeout(zoomFetchTimer.current)
    zoomFetchTimer.current = setTimeout(() => {
      refetchForZoom(fromSec, toSec, nextInterval)
    }, 400)
  };

  // Drop any pending zoom work when the symbol or requested range changes.
  useEffect(() => {
    loadedInterval.current = interval
    return () => {
      if (zoomFetchTimer.current) clearTimeout(zoomFetchTimer.current)
      zoomFetchController.current?.abort()
    }
  }, [symbol, selectedRange, interval])

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
              id: tag.id,
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

  /**
   * Bumped whenever the chart should re-fit to its content: a new symbol,
   * range, indicator set or chart type. Deliberately not bumped when a zoom
   * refetch swaps the bars, so the zoom survives.
   */
  const [fitKey, setFitKey] = useState(0)

  useEffect(() => {
    setFitKey(key => key + 1)
  }, [symbol, selectedRange, interval, activeTags.length, showVolume, chartType, collapsedPanes.size])

  /**
   * The panes stacked under the price chart, in render order: volume first when
   * shown, then one per active indicator. Each carries the label drawn on it
   * and whether the user has folded it away.
   */
  const bottomPanes = useMemo(() => {
    const panes: { id: string; label: string }[] = []
    if (showVolume) panes.push({ id: "volume", label: "Volume" })
    for (const indicator of indicatorSeries as any[]) {
      panes.push({ id: indicator.id, label: indicator.name })
    }
    return panes
  }, [showVolume, indicatorSeries])

  const visiblePanes = useMemo(
    () => bottomPanes.filter(pane => !collapsedPanes.has(pane.id)),
    [bottomPanes, collapsedPanes]
  )

  const togglePane = useCallback((id: string) => {
    setCollapsedPanes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /**
   * Measure where each pane actually sits, so a label can be drawn on it.
   *
   * The heights are read from the chart's own layout rather than derived from
   * the stretch factors: the time axis and the one-pixel separators between
   * panes take space the ratios do not account for, so computed positions drift
   * further down the stack. lightweight-charts lays the panes out as table rows
   * — the tall ones are panes, the 1px ones separators — and the last tall row
   * is the time axis, which is not a pane and is dropped.
   */
  const measurePanes = useCallback(() => {
    const wrapper = chartWrapperRef.current
    const table = wrapper?.querySelector("table")
    if (!wrapper || !table) return

    const wrapperTop = wrapper.getBoundingClientRect().top
    const rows = Array.from(table.querySelectorAll("tr"))
      .map(row => row.getBoundingClientRect())
      .filter(rect => rect.height > SEPARATOR_MAX_HEIGHT)

    setPaneLayout(
      rows.slice(0, -1).map(rect => ({ top: rect.top - wrapperTop, height: rect.height }))
    )
  }, [])

  useEffect(() => {
    if (chartData.length === 0) return

    // The chart lays out after this render, and settles over a frame or two
    // while it sizes its canvases, so measure again shortly after.
    const frame = requestAnimationFrame(measurePanes)
    const settle = setTimeout(measurePanes, 250)

    const wrapper = chartWrapperRef.current
    const observer = wrapper ? new ResizeObserver(measurePanes) : null
    if (wrapper && observer) observer.observe(wrapper)

    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(settle)
      observer?.disconnect()
    }
  }, [measurePanes, chartData.length, visiblePanes.length, chartType])

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
    { value: "1d", label: "1D", interval: "5m", perfKey: "day" as const },
    { value: "5d", label: "5D", interval: "15m", perfKey: "week" as const },
    { value: "1mo", label: "1M", interval: "1h", perfKey: "month" as const },
    { value: "6mo", label: "6M", interval: "1d", perfKey: "month6" as const },
    { value: "1y", label: "1Y", interval: "1d", perfKey: "year" as const },
    { value: "5y", label: "5Y", interval: "1wk", perfKey: "year5" as const },
  ]

  // Helper to format percent
  const formatPercent = (num: number | null) => {
    if (num === null || num === undefined) return null
    const formatted = (num * 100).toFixed(num >= 0.1 || num <= -0.1 ? 0 : 1)
    return num >= 0 ? `+${formatted}%` : `${formatted}%`
  }

  const chartTypes = [
    { value: "candlestick", label: "Candlestick", icon: CandlestickChart },
    { value: "line", label: "Line", icon: TrendingUp },
  ]

  return (
    <div className="w-full space-y-4">
      {/* Chart Controls */}
      <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">


        {/* Second Row: Time & Type */}
        <div className="flex flex-wrap gap-4 items-center justify-between border-t border-border/50 pt-2">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-muted-foreground mr-1">Range:</span>
            {ranges.map((range) => {
              const perfValue = performance?.[range.perfKey] ?? null
              const perfFormatted = formatPercent(perfValue)
              const isPositive = perfValue !== null && perfValue !== undefined && perfValue >= 0

              return (
                <Button
                  key={range.value}
                  variant={selectedRange === range.value ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2 text-xs flex items-center gap-1.5"
                  onClick={() => setSelectedRange(range.value)}
                >
                  <span className="font-medium">{range.label}</span>
                  {perfFormatted && (
                    <span className={`text-xs font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                      {perfFormatted}
                    </span>
                  )}
                </Button>
              )
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            onClick={() => setChartType(chartType === "candlestick" ? "line" : "candlestick")}
            title={chartType === "candlestick" ? "Switch to Line Chart" : "Switch to Candlestick Chart"}
          >
            {chartType === "candlestick" ? (
              <CandlestickChart className="h-4 w-4" />
            ) : (
              <TrendingUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {(loadingData || loadingMore) && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background/80 p-2 rounded-md flex items-center shadow-md">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-xs">{loadingMore ? "Loading history..." : "Loading data..."}</span>
        </div>
      )}

      {error && (
        <div className="text-red-500 text-center text-sm py-4">{error}</div>
      )}

      {/* Chart */}
      <div ref={chartWrapperRef} className="relative border rounded-lg overflow-hidden bg-card">
        {chartData.length > 0 ? (
          <Chart
            ref={chartRef}
            key={`chart-${showVolume}-${activeTags.length}-${chartType}-${visiblePanes.length}`}
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

            {/* Panes under the price chart, in the order `bottomPanes` lists
                them so the measured layout lines up with the labels. */}
            {visiblePanes.map(pane => {
              if (pane.id === "volume") {
                return (
                  <Pane key="volume" stretchFactor={1}>
                    <HistogramSeries
                      data={volumeData}
                      options={{ priceFormat: { type: "volume" } }}
                    />
                  </Pane>
                )
              }

              const indicator = (indicatorSeries as any[]).find(i => i.id === pane.id)
              if (!indicator) return null

              return (
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
              )
            })}

            <TimeScale
              onVisibleLogicalRangeChange={onVisibleRangeChange}
            >
              {/* Re-fit only on a deliberate change of what is charted. Keying
                  this on the data itself would refit after a zoom refetch and
                  throw away the zoom the user just made. */}
              <TimeScaleFitContentTrigger deps={[fitKey]} />
            </TimeScale>
          </Chart>
        ) : (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            {!loadingData && "No data available"}
          </div>
        )}

        {/* One label per pane, positioned over the pane it names. Pane 0 is the
            price chart and is never collapsible, so the labels below start at
            the second measured pane. */}
        {chartData.length > 0 && visiblePanes.map((pane, index) => {
          const position = paneLayout[index + 1]
          if (!position) return null

          return (
            <button
              key={pane.id}
              type="button"
              onClick={() => togglePane(pane.id)}
              style={{ top: position.top + 2 }}
              className="absolute left-2 z-20 flex items-center gap-1 rounded bg-background/75 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
              title={`Collapse ${pane.label}`}
            >
              <ChevronDown className="h-3 w-3" />
              {pane.label}
            </button>
          )
        })}
      </div>

      {/* Folded-away panes, kept visible so they can be brought back. */}
      {collapsedPanes.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-xs text-muted-foreground">Hidden:</span>
          {bottomPanes
            .filter(pane => collapsedPanes.has(pane.id))
            .map(pane => (
              <button
                key={pane.id}
                type="button"
                onClick={() => togglePane(pane.id)}
                className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                title={`Show ${pane.label}`}
              >
                <ChevronRight className="h-3 w-3" />
                {pane.label}
              </button>
            ))}
        </div>
      )}

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

      {/* <div className="flex flex-wrap gap-4 text-xs text-muted-foreground px-2">
        {activeTags.length > 0 && <span>Active:</span>}
        {activeTags.map(tag => (
          <span key={tag.id} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${tag.type === 'indicator' ? 'bg-blue-500' : 'bg-pink-500'}`}></span>
            {tag.label}
          </span>
        ))}
      </div> */}
    </div>
  )
}
