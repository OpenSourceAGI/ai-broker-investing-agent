"use client"

import { useEffect, useRef } from "react"
import { createChart, IChartApi, ISeriesApi, LineSeries, LineData } from "lightweight-charts"

interface PriceHistoryData {
  timestamp: number
  price: number
}

interface PolymarketPriceChartProps {
  data: PriceHistoryData[]
  height?: number
  showGrid?: boolean
}

export function PolymarketPriceChart({
  data,
  height = 80,
  showGrid = false,
}: PolymarketPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null)

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: "transparent" },
        textColor: "#666",
      },
      grid: {
        vertLines: { visible: showGrid, color: "rgba(197, 203, 206, 0.1)" },
        horzLines: { visible: showGrid, color: "rgba(197, 203, 206, 0.1)" },
      },
      rightPriceScale: {
        visible: false,
      },
      leftPriceScale: {
        visible: false,
      },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      crosshair: {
        vertLine: {
          visible: false,
        },
        horzLine: {
          visible: false,
        },
      },
      handleScroll: false,
      handleScale: false,
    })

    chartRef.current = chart

    // Create line series
    const lineSeries = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })

    seriesRef.current = lineSeries

    // Format data for lightweight-charts (time in seconds)
    const chartData: LineData[] = data
      .map((point) => ({
        time: point.timestamp as any,
        value: point.price,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number))

    lineSeries.setData(chartData)

    // Fit content
    chart.timeScale().fitContent()

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener("resize", handleResize)

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [data, height, showGrid])

  if (data.length === 0) {
    return (
      <div
        style={{ height: `${height}px` }}
        className="flex items-center justify-center text-xs text-muted-foreground"
      >
        No price history
      </div>
    )
  }

  return <div ref={chartContainerRef} style={{ height: `${height}px` }} />
}
