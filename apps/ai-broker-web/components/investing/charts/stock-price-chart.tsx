"use client"

import { useEffect, useRef } from "react"
import { createChart, IChartApi, ISeriesApi, LineData } from "lightweight-charts"

interface HistoricalData {
  date: string
  close: number
  open: number
  high: number
  low: number
  volume?: number
}

interface StockPriceChartProps {
  data: HistoricalData[]
  height?: number
  showGrid?: boolean
  color?: string
}

export function StockPriceChart({
  data,
  height = 120,
  showGrid = true,
  color = "#3b82f6",
}: StockPriceChartProps) {
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
        textColor: "#888",
      },
      grid: {
        vertLines: { visible: showGrid, color: "rgba(197, 203, 206, 0.1)" },
        horzLines: { visible: showGrid, color: "rgba(197, 203, 206, 0.1)" },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
      },
      leftPriceScale: {
        visible: false,
      },
      timeScale: {
        visible: true,
        borderVisible: false,
        timeVisible: false,
      },
      crosshair: {
        vertLine: {
          visible: true,
          labelVisible: false,
        },
        horzLine: {
          visible: true,
          labelVisible: true,
        },
      },
    })

    chartRef.current = chart

    // Determine color based on overall trend
    const firstPrice = data[0]?.close || 0
    const lastPrice = data[data.length - 1]?.close || 0
    const isPositive = lastPrice >= firstPrice
    const lineColor = isPositive ? "#22c55e" : "#ef4444"

    // Create area series for filled chart
    const areaSeries = chart.addAreaSeries({
      lineColor: color || lineColor,
      topColor: isPositive ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)",
      bottomColor: "rgba(0, 0, 0, 0)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    })

    // Format data for lightweight-charts
    const chartData: LineData[] = data
      .map((point) => {
        // Convert date string to timestamp in seconds
        const timestamp = Math.floor(new Date(point.date).getTime() / 1000)
        return {
          time: timestamp as any,
          value: point.close,
        }
      })
      .sort((a, b) => (a.time as number) - (b.time as number))

    areaSeries.setData(chartData)

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
  }, [data, height, showGrid, color])

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
