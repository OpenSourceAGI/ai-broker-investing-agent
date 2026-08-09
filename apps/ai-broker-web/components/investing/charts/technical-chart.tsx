"use client"

import { useEffect, useRef, useMemo } from "react"
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi, type CandlestickData } from "lightweight-charts"

interface TechnicalChartProps {
  data: {
    time: string | number // 'yyyy-mm-dd' or timestamp
    value?: number
    open?: number
    high?: number
    low?: number
    close?: number
  }[]
  title?: string
  colors?: {
    backgroundColor?: string
    lineColor?: string
    textColor?: string
    areaTopColor?: string
    areaBottomColor?: string
  }
  onVisibleRangeChange?: (range: { from: number; to: number }) => void
  onChartReady?: (chart: IChartApi, series: any) => void
  symbol?: string
  chartType?: "line" | "candlestick"
  height?: number
  showVolume?: boolean
}

export function TechnicalChart({
  data,
  title = "Price Chart",
  colors = {},
  onVisibleRangeChange,
  onChartReady,
  symbol,
  chartType = "candlestick",
  height = 300,
  showVolume = false
}: TechnicalChartProps) {
  console.log('[TechnicalChart] Render', { dataLength: data.length, title, symbol })

  const {
    backgroundColor = 'transparent',
    textColor = 'black',
  } = colors

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)

  // Memoize the data transformation to prevent recalculation on every render
  const validData = useMemo(() => {
    console.log('[TechnicalChart] Transforming data', data.length)
    return data.map(d => {
      let timeVal = d.time
      // If valid ISO string with time, convert to timestamp
      if (typeof d.time === 'string' && d.time.includes('T')) {
        const date = new Date(d.time)
        if (!isNaN(date.getTime())) {
          timeVal = Math.floor(date.getTime() / 1000) as any
        }
      }

      return {
        time: timeVal as any,
        open: d.open || d.value || 0,
        high: d.high || d.value || 0,
        low: d.low || d.value || 0,
        close: d.close || d.value || 0
      }
    }).filter(d => d.open !== 0 || d.close !== 0) as CandlestickData[]
  }, [data])

  // Initialize chart once on mount
  useEffect(() => {
    if (!containerRef.current) return

    console.log('[TechnicalChart] Initializing chart')

    // Create chart
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: backgroundColor },
        textColor,
      },
      grid: {
        vertLines: { color: 'rgba(197, 203, 206, 0.1)' },
        horzLines: { color: 'rgba(197, 203, 206, 0.1)' },
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.3)',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.3)',
      },
      height,
      width: containerRef.current.clientWidth,
    })

    chartRef.current = chart

    // Create candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })

    seriesRef.current = candlestickSeries

    // Set data
    candlestickSeries.setData(validData)

    console.log('[TechnicalChart] Chart initialized')

    // Call onChartReady if provided
    if (onChartReady) {
      onChartReady(chart, candlestickSeries)
    }

    // Handle resize
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      console.log('[TechnicalChart] Chart removed')
    }
  }, []) // Only run once on mount

  // Update data when it changes
  useEffect(() => {
    if (seriesRef.current && validData.length > 0) {
      console.log('[TechnicalChart] Updating data', validData.length)
      seriesRef.current.setData(validData)
    }
  }, [validData])

  console.log('[TechnicalChart] Rendering container')

  return (
    <div className="w-full relative" style={{ height: `${height}px` }}>
      {title && <div className="absolute top-2 left-2 z-10 text-sm font-medium text-muted-foreground">{title}</div>}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
