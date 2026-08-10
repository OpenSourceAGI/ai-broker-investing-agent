"use client"

import * as React from "react"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// Helper function to get stock logo URLs
function getStockLogoUrl(symbol: string, useGithub: boolean = true): string {
  // if (useGithub) {
  //   return `https://github.com/nvstly/icons/blob/main/ticker_icons/${symbol}.png?raw=true`
  // }
  return `https://img.logo.dev/ticker/${symbol}?token=pk_TttrZhYwSReZxFePkXo-Bg&size=38&retina=true`
}

interface StockSearchProps {
  value: string
  onChange: (value: string) => void
  onSelect?: (symbol: string) => void
  placeholder?: string
  className?: string
}

export function StockSearch({
  value,
  onChange,
  onSelect,
  placeholder = "Search stocks...",
  className
}: StockSearchProps) {
  const [results, setResults] = React.useState<{ symbol: string, name: string }[]>([])
  const [isOpen, setIsOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false) // Added loading state
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [wrapperRef])

  React.useEffect(() => {
    const fetchResults = async () => {
      if (value.length < 1) {
        setResults([])
        return
      }

      try {
        setIsLoading(true)
        const res = await fetch(`/api/stocks/autocomplete?q=${encodeURIComponent(value)}&limit=5`)
        const data = await res.json()
        if (data.success) {
          setResults(data.data)
          // Only open dropdown if input is focused
          if (document.activeElement === wrapperRef.current?.querySelector('input')) {
            setIsOpen(true)
          }
        }
      } catch (err) {
        console.error("Autocomplete failed", err)
      } finally {
        setIsLoading(false)
      }
    }

    const timeoutId = setTimeout(fetchResults, 300)
    return () => clearTimeout(timeoutId)
  }, [value])

  const handleSelect = (symbol: string) => {
    onChange(symbol)
    setIsOpen(false)
    if (onSelect) {
      onSelect(symbol)
    }
  }

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={placeholder}
          className="pl-8"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true) }}
        />
        {isLoading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md z-50 max-h-60 overflow-y-auto">
          {results.map((item) => (
            <div
              key={item.symbol}
              className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground text-sm flex items-center gap-3"
              onClick={() => handleSelect(item.symbol)}
            >
              <img
                src={getStockLogoUrl(item.symbol, true)}
                alt={`${item.symbol} logo`}
                className="w-6 h-6 rounded object-contain flex-shrink-0 bg-white"
                onError={(e) => {
                  // Fallback to img.logo.dev if GitHub icon fails to load
                  const target = e.target as HTMLImageElement
                  if (target.src.includes('github.com')) {
                    target.src = getStockLogoUrl(item.symbol, false)
                  } else {
                    target.style.display = 'none'
                  }
                }}
              />
              <div className="flex items-center justify-between flex-1 min-w-0">
                <span className="font-bold">{item.symbol}</span>
                <span className="text-muted-foreground truncate max-w-[200px] text-xs ml-2">{item.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
