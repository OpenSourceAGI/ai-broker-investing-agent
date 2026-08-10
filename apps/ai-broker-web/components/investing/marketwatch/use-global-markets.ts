import { useState, useEffect, useCallback } from "react"
import type { MarketIndex } from "@/components/ui/financial-markets-table"

const REFRESH_INTERVAL_MS = 60000

export function useGlobalMarkets() {
  const [globalMarkets, setGlobalMarkets] = useState<MarketIndex[]>([])
  const [loading, setLoading] = useState(true)

  const fetchGlobalMarkets = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/markets/global")
      const json = await res.json()
      if (json.success && json.data) {
        setGlobalMarkets(json.data)
      }
    } catch (error) {
      console.error("Failed to fetch global markets", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGlobalMarkets()
    const interval = setInterval(fetchGlobalMarkets, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchGlobalMarkets])

  return {
    globalMarkets,
    loading,
    refetch: fetchGlobalMarkets,
  }
}
