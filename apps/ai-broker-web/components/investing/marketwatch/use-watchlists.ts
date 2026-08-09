import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import type { Watchlist } from "./types"

interface UseWatchlistsOptions {
  session: { user?: unknown } | null
  onListCreated?: (list: Watchlist) => void
  onListDeleted?: (listId: string) => void
}

export function useWatchlists({ session, onListCreated, onListDeleted }: UseWatchlistsOptions) {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [loading, setLoading] = useState(false)

  const fetchWatchlists = useCallback(async () => {
    if (!session?.user) return
    try {
      setLoading(true)
      const res = await fetch("/api/user/watchlists")
      const json = await res.json()
      if (json.success) {
        setWatchlists(json.data)
      }
    } catch (error) {
      console.error("Failed to fetch watchlists", error)
    } finally {
      setLoading(false)
    }
  }, [session?.user])

  useEffect(() => {
    fetchWatchlists()
  }, [fetchWatchlists])

  const createList = async (name: string): Promise<Watchlist | null> => {
    if (!name.trim()) return null

    try {
      const res = await fetch("/api/user/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()

      if (json.success) {
        toast.success("Watchlist created")
        setWatchlists(prev => [...prev, json.data])
        onListCreated?.(json.data)
        return json.data
      } else {
        toast.error(json.error || "Failed to create list")
        return null
      }
    } catch {
      toast.error("An error occurred")
      return null
    }
  }

  const deleteList = async (listId: string): Promise<boolean> => {
    if (!confirm("Are you sure you want to delete this list?")) return false

    try {
      const res = await fetch(`/api/user/watchlists?id=${listId}`, {
        method: "DELETE",
      })
      const json = await res.json()

      if (json.success) {
        toast.success("Watchlist deleted")
        setWatchlists(prev => prev.filter(l => l.id !== listId))
        onListDeleted?.(listId)
        return true
      } else {
        toast.error(json.error || "Failed to delete list")
        return false
      }
    } catch {
      toast.error("An error occurred")
      return false
    }
  }

  const renameList = async (listId: string, newName: string): Promise<boolean> => {
    if (!newName.trim()) return false

    try {
      const res = await fetch("/api/user/watchlists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: listId, name: newName }),
      })
      const json = await res.json()

      if (json.success) {
        toast.success("Watchlist renamed")
        setWatchlists(prev =>
          prev.map(l => l.id === listId ? { ...l, name: newName } : l)
        )
        return true
      } else {
        toast.error(json.error || "Failed to rename list")
        return false
      }
    } catch {
      toast.error("An error occurred")
      return false
    }
  }

  return {
    watchlists,
    loading,
    createList,
    deleteList,
    renameList,
    refetch: fetchWatchlists,
  }
}
