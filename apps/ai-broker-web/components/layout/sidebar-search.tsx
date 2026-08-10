"use client"

import * as React from "react"
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { useSidebar } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function SidebarSearch() {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<{ symbol: string, name: string }[]>([])
  const [isOpen, setIsOpen] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { state, toggleSidebar } = useSidebar()

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
      if (query.length < 1) {
        setResults([])
        return
      }

      try {
        const res = await fetch(`/api/stocks/autocomplete?q=${encodeURIComponent(query)}&limit=5`)
        const data = await res.json()
        if (data.success) {
          setResults(data.data)
          if (document.activeElement === wrapperRef.current?.querySelector('input')) {
            setIsOpen(true)
          }
        }
      } catch (err) {
        console.error("Autocomplete failed", err)
      }
    }

    const timeoutId = setTimeout(fetchResults, 300)
    return () => clearTimeout(timeoutId)
  }, [query])

  const handleSelect = (symbol: string) => {
    setQuery(symbol)
    setIsOpen(false)
    if (state === "expanded") {
      toggleSidebar()
    }
    router.push(`/stock/${symbol}`)
  }

  if (state === "collapsed") {
    return (
      <Button variant="ghost" size="icon" onClick={() => toggleSidebar()}>
        <Search className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <div ref={wrapperRef} className="relative w-full px-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search stocks..."
          className="pl-8 h-8 bg-sidebar-accent/50 border-sidebar-border"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true) }}
        />
      </div>
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-2 right-2 mt-1 bg-popover border border-border rounded-md shadow-md z-50 max-h-60 overflow-y-auto">
          {results.map((item) => (
            <div
              key={item.symbol}
              className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground text-sm flex items-center gap-2"
              onClick={() => handleSelect(item.symbol)}
            >
              <img
                src={`https://img.logo.dev/ticker/${item.symbol}?token=pk_TttrZhYwSReZxFePkXo-Bg&size=38&retina=true`}
                alt={`${item.symbol} logo`}
                className="w-5 h-5 rounded object-contain flex-shrink-0 bg-white"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
              />
              <div className="flex items-center justify-between flex-1 min-w-0">
                <span className="font-bold text-xs">{item.symbol}</span>
                <span className="text-muted-foreground truncate max-w-[100px] text-xs ml-1">{item.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
