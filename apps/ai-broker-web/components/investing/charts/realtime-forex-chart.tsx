"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Activity, Maximize2 } from "lucide-react"
import { createChart, CandlestickSeries, IChartApi, ISeriesApi, CandlestickData, LineData, UTCTimestamp } from "lightweight-charts"
import { TooltipPrimitive } from "@/lib/lightweight-charts/plugins/tooltip"

interface RealtimeForexChartProps {
  instrument?: string
  timeframe?: string
  height?: number
}

const TIMEFRAMES = [
  { value: "m1", label: "1 Minute" },
  { value: "m5", label: "5 Minutes" },
  { value: "m15", label: "15 Minutes" },
  { value: "h1", label: "1 Hour" },
]

export function RealtimeForexChart({
  instrument = "eurusd",
  timeframe = "m1",
  height = 500
}: RealtimeForexChartProps) {
  const [selectedInstrument, setSelectedInstrument] = useState(instrument)
  const [selectedTimeframe, setSelectedTimeframe] = useState(timeframe)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [instruments, setInstruments] = useState<any[]>([])
  const [instrumentsLoading, setInstrumentsLoading] = useState(true)

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch available instruments
  useEffect(() => {
    async function fetchInstruments() {
      try {
        const response = await fetch('/api/forex/instruments')
        const result = await response.json()
        if (result.success && result.data) {
          setInstruments(result.data)
        }
      } catch (err) {
        console.error('Failed to fetch instruments:', err)
      } finally {
        setInstrumentsLoading(false)
      }
    }
    fetchInstruments()
  }, [])
  const lastCandleRef = useRef<CandlestickData | null>(null)

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    })

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })

    // Add tooltip
    const tooltipPrimitive = new TooltipPrimitive({
      tooltip: {
        title: selectedInstrument.toUpperCase(),
        followMode: 'tracking',
      },
      priceExtractor: (data) => {
        if ((data as any).close !== undefined) {
          return `$${(data as any).close.toFixed(5)}`
        }
        return ''
      },
    })
    candlestickSeries.attachPrimitive(tooltipPrimitive)

    chartRef.current = chart
    seriesRef.current = candlestickSeries

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [height, selectedInstrument])

  // Fetch initial historical data
  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch last 500 candles for historical context
      const url = `/api/forex/realtime/${selectedInstrument}?timeframe=${selectedTimeframe}&last=500&format=json`
      const response = await fetch(url)
      const result = await response.json()

      if (result.success && result.data && seriesRef.current) {
        // Convert to candlestick format
        const chartData: CandlestickData[] = result.data
          .map((item: any) => ({
            time: Math.floor(item.timestamp / 1000) as UTCTimestamp,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
          }))
          .sort((a: CandlestickData, b: CandlestickData) => (a.time as number) - (b.time as number))

        seriesRef.current.setData(chartData)

        // Store last candle for updates
        if (chartData.length > 0) {
          lastCandleRef.current = chartData[chartData.length - 1]
          setCurrentPrice(chartData[chartData.length - 1].close)
        }

        // Fit content and scroll to show recent data
        chartRef.current?.timeScale().fitContent()
        chartRef.current?.timeScale().scrollToPosition(5, true)
      } else {
        setError(result.error || "Failed to fetch data")
      }
    } catch (err: any) {
      console.error("Fetch error:", err)
      setError(err.message || "Failed to fetch data")
    } finally {
      setLoading(false)
    }
  }, [selectedInstrument, selectedTimeframe])

  // Fetch real-time updates
  const fetchRealtimeUpdate = useCallback(async () => {
    try {
      // Get the latest tick/candle
      const url = `/api/forex/realtime/${selectedInstrument}?timeframe=${selectedTimeframe}&last=1&format=json`
      const response = await fetch(url)
      const result = await response.json()

      if (result.success && result.data && result.data.length > 0 && seriesRef.current) {
        const latest = result.data[0]
        const newCandle: CandlestickData = {
          time: Math.floor(latest.timestamp / 1000) as UTCTimestamp,
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
        }

        // Update or append based on timestamp
        if (lastCandleRef.current) {
          if (newCandle.time === lastCandleRef.current.time) {
            // Update existing candle
            seriesRef.current.update(newCandle)
          } else if (newCandle.time > lastCandleRef.current.time) {
            // New candle - append
            seriesRef.current.update(newCandle)
            lastCandleRef.current = newCandle
          }
        } else {
          // First update
          seriesRef.current.update(newCandle)
          lastCandleRef.current = newCandle
        }

        setCurrentPrice(newCandle.close)
        setLastUpdate(new Date())
      }
    } catch (err: any) {
      console.error("Real-time update error:", err)
      // Don't show error for individual update failures
    }
  }, [selectedInstrument, selectedTimeframe])

  // Load initial data
  useEffect(() => {
    fetchInitialData()
  }, [fetchInitialData])

  // Start real-time updates
  useEffect(() => {
    if (isLive && !loading) {
      // Update every 1 second for tick data, or based on timeframe
      const updateInterval = selectedTimeframe === 'tick' ? 1000 : 5000

      updateIntervalRef.current = setInterval(fetchRealtimeUpdate, updateInterval)

      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current)
        }
      }
    }
  }, [isLive, loading, fetchRealtimeUpdate, selectedTimeframe])

  const handleGoToRealtime = () => {
    chartRef.current?.timeScale().scrollToPosition(0, true)
  }

  const toggleLive = () => {
    setIsLive(!isLive)
  }

  const handleInstrumentChange = (value: string) => {
    setSelectedInstrument(value)
    lastCandleRef.current = null
  }

  const handleTimeframeChange = (value: string) => {
    setSelectedTimeframe(value)
    lastCandleRef.current = null
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <CardTitle className="text-2xl">
              {instruments.find(i => i.symbol === selectedInstrument)?.name || selectedInstrument.toUpperCase()}
            </CardTitle>

            {currentPrice !== null && (
              <div className="text-2xl font-mono">
                ${currentPrice.toFixed(5)}
              </div>
            )}

            {isLive && (
              <Badge variant="default" className="animate-pulse">
                <Activity className="w-3 h-3 mr-1" />
                LIVE
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedInstrument} onValueChange={handleInstrumentChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[400px]">
                {instrumentsLoading ? (
                  <SelectItem value="loading" disabled>
                    Loading instruments...
                  </SelectItem>
                ) : instruments.length > 0 ? (
                  <>
                    {/* Group instruments by category */}
                    {['forex', 'crypto', 'stocks', 'etfs', 'indices', 'commodities', 'bonds'].map(category => {
                      const categoryInstruments = instruments.filter(i => i.category === category)
                      if (categoryInstruments.length === 0) return null
                      return (
                        <div key={category}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                            {category}
                          </div>
                          {categoryInstruments.map((inst) => (
                            <SelectItem key={inst.symbol} value={inst.symbol}>
                              {inst.name}
                            </SelectItem>
                          ))}
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <SelectItem value="none" disabled>
                    No instruments available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>

            <Select value={selectedTimeframe} onValueChange={handleTimeframeChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEFRAMES.map((tf) => (
                  <SelectItem key={tf.value} value={tf.value}>
                    {tf.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={isLive ? "default" : "outline"}
              size="sm"
              onClick={toggleLive}
            >
              {isLive ? "Pause" : "Resume"} Live
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleGoToRealtime}
            >
              <Maximize2 className="w-4 h-4 mr-1" />
              Go to Realtime
            </Button>
          </div>
        </div>

        {lastUpdate && (
          <p className="text-sm text-muted-foreground">
            Last update: {lastUpdate.toLocaleTimeString()}
          </p>
        )}
      </CardHeader>

      <CardContent>
        {error ? (
          <div className="text-center text-red-500 py-8">{error}</div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <div ref={chartContainerRef} className="w-full" style={{ height: `${height}px` }} />
        )}
      </CardContent>
    </Card>
  )
}
