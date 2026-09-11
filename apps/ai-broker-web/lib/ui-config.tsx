"use client"

import * as React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useSession } from "@/lib/auth/client"

export interface TickerConfig {
  showIcon: boolean
  showSymbol: boolean
  showName: boolean
  showPriceStock: boolean
  showPriceIndex: boolean
  enabledIntervals: ("d" | "w" | "m" | "y")[]
  orderHistorical: boolean
  showMinusSign: boolean
  showDeltaSymbols: boolean
  setNeutralMagnitude: number
}

export interface UIConfig {
  ticker: TickerConfig
}

export const defaultTickerConfig: TickerConfig = {
  showIcon: true,
  showSymbol: false,
  showName: true,
  showPriceStock: false,
  showPriceIndex: false,
  enabledIntervals: ["d", "w", "m", "y"],
  orderHistorical: true,
  showMinusSign: false,
  showDeltaSymbols: true,
  setNeutralMagnitude: 5,
}

export const defaultUIConfig: UIConfig = {
  ticker: defaultTickerConfig,
}

interface UIConfigContextType {
  config: UIConfig
  updateConfig: (newConfig: Partial<UIConfig>) => void
  updateTickerConfig: (newConfig: Partial<TickerConfig>) => void
  loading: boolean
  saving: boolean
  saveConfig: () => Promise<void>
}

const UIConfigContext = createContext<UIConfigContextType | undefined>(undefined)

export function UIConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<UIConfig>(defaultUIConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { data: session, isPending: sessionPending } = useSession()

  // Fetch the saved config once we know who is asking. Settings are per-user,
  // so requesting them while signed out can only 401 — every anonymous page
  // load used to spend a request to be told that. Signed-out visitors keep the
  // defaults below.
  useEffect(() => {
    if (sessionPending) return

    if (!session?.user) {
      setConfig(defaultUIConfig)
      setLoading(false)
      return
    }

    const controller = new AbortController()

    const fetchConfig = async () => {
      try {
        const response = await fetch("/api/user/settings", { signal: controller.signal })
        if (response.ok) {
          const data = await response.json()
          if (data.uiConfig) {
            const parsed = typeof data.uiConfig === "string"
              ? JSON.parse(data.uiConfig)
              : data.uiConfig
            setConfig({
              ...defaultUIConfig,
              ...parsed,
              ticker: {
                ...defaultTickerConfig,
                ...parsed?.ticker,
              },
            })
          }
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return
        console.error("Failed to fetch UI config:", error)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    fetchConfig()
    return () => controller.abort()
  }, [session?.user?.id, sessionPending])

  const updateConfig = useCallback((newConfig: Partial<UIConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ...newConfig,
    }))
  }, [])

  const updateTickerConfig = useCallback((newConfig: Partial<TickerConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ticker: {
        ...prev.ticker,
        ...newConfig,
      },
    }))
  }, [])

  const saveConfig = useCallback(async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uiConfig: JSON.stringify(config) }),
      })
      if (!response.ok) {
        throw new Error("Failed to save config")
      }
    } catch (error) {
      console.error("Failed to save UI config:", error)
      throw error
    } finally {
      setSaving(false)
    }
  }, [config])

  return (
    <UIConfigContext.Provider
      value={{
        config,
        updateConfig,
        updateTickerConfig,
        loading,
        saving,
        saveConfig,
      }}
    >
      {children}
    </UIConfigContext.Provider>
  )
}

export function useUIConfig() {
  const context = useContext(UIConfigContext)
  if (context === undefined) {
    throw new Error("useUIConfig must be used within a UIConfigProvider")
  }
  return context
}

export function useTickerConfig() {
  const { config, updateTickerConfig, loading, saving, saveConfig } = useUIConfig()
  return {
    tickerConfig: config.ticker,
    updateTickerConfig,
    loading,
    saving,
    saveConfig,
  }
}
