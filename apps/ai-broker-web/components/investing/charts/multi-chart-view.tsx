"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { X, Plus, GripVertical } from "lucide-react"
import { TechnicalChart } from "./technical-chart"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import type { IChartApi, ISeriesApi } from "lightweight-charts"
import { useTheme } from "next-themes"

interface ChartTab {
  id: string
  symbol: string
  data: ChartData[]
  chartRef?: IChartApi
  seriesRef?: ISeriesApi<any>
}

interface ChartData {
  time: string | number
  open: number
  high: number
  low: number
  close: number
}

interface MultiChartViewProps {
  initialSymbol?: string
}

export function MultiChartView({ initialSymbol = "AAPL" }: MultiChartViewProps) {
  const [tabs, setTabs] = useState<ChartTab[]>([
    { id: "1", symbol: initialSymbol, data: [] }
  ])
  const [activeTab, setActiveTab] = useState("1")
  const [layout, setLayout] = useState<"horizontal" | "vertical">("horizontal")
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [newSymbol, setNewSymbol] = useState("")
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const { resolvedTheme } = useTheme()

  const chartRefs = useRef<Map<string, IChartApi>>(new Map())
  const seriesRefs = useRef<Map<string, ISeriesApi<any>>>(new Map())
  const isSyncing = useRef(false)

  // Fetch data for a symbol
  const fetchChartData = useCallback(async (symbol: string, tabId: string) => {
    setLoading(prev => ({ ...prev, [tabId]: true }))
    try {
      const res = await fetch(`/api/stocks/historical/${symbol}?range=1y&interval=1d`)
      const json = await res.json()

      if (json.success && json.data) {
        const chartData: ChartData[] = json.data.map((quote: any) => ({
          time: quote.date || quote.time,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          close: quote.close
        })).filter((d: ChartData) => d.open && d.close)

        setTabs(prev => prev.map(tab =>
          tab.id === tabId ? { ...tab, data: chartData } : tab
        ))
      }
    } catch (error) {
      console.error("Error fetching chart data:", error)
    } finally {
      setLoading(prev => ({ ...prev, [tabId]: false }))
    }
  }, [])

  // Load initial data
  useEffect(() => {
    tabs.forEach(tab => {
      if (tab.data.length === 0) {
        fetchChartData(tab.symbol, tab.id)
      }
    })
  }, [tabs, fetchChartData])

  // Add new chart tab
  const addTab = useCallback(() => {
    if (!newSymbol.trim()) return

    const newId = Date.now().toString()
    const newTab: ChartTab = {
      id: newId,
      symbol: newSymbol.toUpperCase(),
      data: []
    }

    setTabs(prev => [...prev, newTab])
    setActiveTab(newId)
    fetchChartData(newSymbol.toUpperCase(), newId)
    setNewSymbol("")
  }, [newSymbol, fetchChartData])

  // Close tab
  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const filtered = prev.filter(tab => tab.id !== tabId)
      if (filtered.length === 0) {
        // Keep at least one tab
        return prev
      }

      // If closing active tab, switch to another
      if (activeTab === tabId) {
        const currentIndex = prev.findIndex(t => t.id === tabId)
        const newActiveIndex = currentIndex > 0 ? currentIndex - 1 : 0
        setActiveTab(filtered[newActiveIndex].id)
      }

      return filtered
    })

    // Clean up refs
    chartRefs.current.delete(tabId)
    seriesRefs.current.delete(tabId)
  }, [activeTab])

  // Register chart and series refs
  const registerChart = useCallback((tabId: string, chart: IChartApi, series: ISeriesApi<any>) => {
    chartRefs.current.set(tabId, chart)
    seriesRefs.current.set(tabId, series)
    setupSync()
  }, [])

  // Sync visible range across all charts
  const setupSync = useCallback(() => {
    if (!syncEnabled) return

    const charts = Array.from(chartRefs.current.entries())

    charts.forEach(([tabId, chart]) => {
      // Sync time scale
      const timeScale = chart.timeScale()

      timeScale.subscribeVisibleLogicalRangeChange(timeRange => {
        if (isSyncing.current) return

        isSyncing.current = true
        charts.forEach(([otherId, otherChart]) => {
          if (otherId !== tabId && timeRange) {
            try {
              otherChart.timeScale().setVisibleLogicalRange(timeRange)
            } catch (e) {
              // Ignore errors if range is invalid
            }
          }
        })
        isSyncing.current = false
      })

      // Sync crosshair
      chart.subscribeCrosshairMove(param => {
        if (isSyncing.current) return

        const series = seriesRefs.current.get(tabId)
        if (!series || !param.time) return

        const dataPoint = param.seriesData.get(series)

        isSyncing.current = true
        charts.forEach(([otherId, otherChart]) => {
          if (otherId !== tabId) {
            const otherSeries = seriesRefs.current.get(otherId)
            if (otherSeries && dataPoint) {
              try {
                otherChart.setCrosshairPosition(
                  (dataPoint as any).value || (dataPoint as any).close,
                  param.time!,
                  otherSeries
                )
              } catch (e) {
                // Ignore errors
              }
            } else {
              otherChart.clearCrosshairPosition()
            }
          }
        })
        isSyncing.current = false
      })
    })
  }, [syncEnabled])

  // Re-setup sync when sync is toggled
  useEffect(() => {
    if (syncEnabled) {
      setupSync()
    } else {
      // Clear all sync subscriptions
      chartRefs.current.forEach((chart) => {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(() => { })
        chart.unsubscribeCrosshairMove(() => { })
      })
    }
  }, [syncEnabled, setupSync])

  return (
    <div className="w-full space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Add new chart */}
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Symbol (e.g. AAPL)"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && addTab()}
                className="w-32"
              />
              <Button
                onClick={addTab}
                size="sm"
                disabled={!newSymbol.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Chart
              </Button>
            </div>

            {/* Layout toggle */}
            <div className="flex gap-2">
              <Button
                variant={layout === "horizontal" ? "default" : "outline"}
                size="sm"
                onClick={() => setLayout("horizontal")}
              >
                Side by Side
              </Button>
              <Button
                variant={layout === "vertical" ? "default" : "outline"}
                size="sm"
                onClick={() => setLayout("vertical")}
              >
                Top/Bottom
              </Button>
            </div>

            {/* Sync toggle */}
            <Button
              variant={syncEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setSyncEnabled(!syncEnabled)}
            >
              <GripVertical className="h-4 w-4 mr-1" />
              {syncEnabled ? "Sync On" : "Sync Off"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center gap-2 border-b">
          <TabsList className="flex-1">
            {tabs.map((tab) => (
              <div key={tab.id} className="inline-flex items-center">
                <TabsTrigger value={tab.id} className="relative pr-8">
                  {tab.symbol}
                  {loading[tab.id] && (
                    <span className="absolute right-8 top-1/2 -translate-y-1/2">
                      <span className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                    </span>
                  )}
                </TabsTrigger>
                {tabs.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 -ml-6 z-10"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </TabsList>
        </div>

        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            <div className={`grid gap-4 ${tabs.length > 1 && syncEnabled
              ? layout === "horizontal"
                ? "grid-cols-2"
                : "grid-rows-2"
              : "grid-cols-1"
              }`}>
              {/* Current tab chart */}
              <Card>
                <CardContent className="pt-6">
                  <TechnicalChart
                    data={tab.data}
                    title={`${tab.symbol} Price Chart`}
                    symbol={tab.symbol}
                    onChartReady={(chart, series) => registerChart(tab.id, chart, series)}
                    colors={{
                      backgroundColor: 'transparent',
                      textColor: resolvedTheme === 'dark' ? '#ffffff' : '#000000',
                    }}
                  />
                </CardContent>
              </Card>

              {/* Show another chart if sync is enabled and there are multiple tabs */}
              {syncEnabled && tabs.length > 1 && (
                <Card>
                  <CardContent className="pt-6">
                    {(() => {
                      // Find next tab to display
                      const currentIndex = tabs.findIndex(t => t.id === tab.id)
                      const nextIndex = (currentIndex + 1) % tabs.length
                      const nextTab = tabs[nextIndex]

                      return (
                        <TechnicalChart
                          data={nextTab.data}
                          title={`${nextTab.symbol} Price Chart`}
                          symbol={nextTab.symbol}
                          onChartReady={(chart, series) => registerChart(nextTab.id, chart, series)}
                          colors={{
                            backgroundColor: 'transparent',
                            textColor: resolvedTheme === 'dark' ? '#ffffff' : '#000000',
                          }}
                        />
                      )
                    })()}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
