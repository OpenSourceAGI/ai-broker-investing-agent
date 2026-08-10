"use client"

import { useState } from "react"
import { Loader2, Pencil, Trash2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { StockList } from "@/components/investing/shared/stock-list"
import { FinancialTable } from "@/components/ui/financial-markets-table"
import { useSession } from "@/lib/auth-client"

import { mockIndexes, mostTrending, highestBreakout, fallbackGlobalMarketIndices } from "./mock-data"
import { useWatchlists } from "./use-watchlists"
import { useGlobalMarkets } from "./use-global-markets"
import { CreateListDialog } from "./create-list-dialog"
import { RenameListDialog } from "./rename-list-dialog"
import { MarketStatsCards } from "./market-stats-cards"

export function MarketScanner() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState("global-markets")

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameListId, setRenameListId] = useState<string | null>(null)
  const [renameListName, setRenameListName] = useState("")

  const { globalMarkets, loading: loadingGlobalMarkets } = useGlobalMarkets()

  const { watchlists, createList, deleteList, renameList } = useWatchlists({
    session,
    onListCreated: (list) => setActiveTab(`list-${list.id}`),
    onListDeleted: () => setActiveTab("favorites"),
  })

  const handleOpenRename = (listId: string, currentName: string) => {
    setRenameListId(listId)
    setRenameListName(currentName)
    setRenameOpen(true)
  }

  const handleRename = async (newName: string): Promise<boolean> => {
    if (!renameListId) return false
    const success = await renameList(renameListId, newName)
    if (success) {
      setRenameListId(null)
      setRenameListName("")
    }
    return success
  }

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Market Scanner</h2>
          <p className="text-muted-foreground">
            Track market indexes, trending stocks, and your custom watchlists.
          </p>
        </div>
        <CreateListDialog onCreateList={createList} />
        <RenameListDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          currentName={renameListName}
          onRename={handleRename}
        />
      </div>

      <MarketStatsCards
        indexCount={mockIndexes.length}
        trendingCount={mostTrending.length}
        breakoutCount={highestBreakout.length}
        watchlistCount={watchlists.length + 1}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="w-full overflow-x-auto touch-pan-x pb-2">
          <TabsList>
            <TabsTrigger value="global-markets">Global Markets</TabsTrigger>
            <TabsTrigger value="indexes">Indexes</TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="breakout">Breakout</TabsTrigger>
            <TabsTrigger value="favorites">Favorites</TabsTrigger>
            {watchlists.map(list => (
              <TabsTrigger key={list.id} value={`list-${list.id}`}>
                {list.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="global-markets">
          {loadingGlobalMarkets ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <FinancialTable
              title="Index"
              indices={globalMarkets.length > 0 ? globalMarkets : fallbackGlobalMarketIndices}
              onIndexSelect={(indexId) => console.log("Selected index:", indexId)}
            />
          )}
        </TabsContent>

        <TabsContent value="indexes">
          <StockList
            title="Market Indexes"
            mode="static"
            initialStocks={mockIndexes}
          />
        </TabsContent>

        <TabsContent value="trending">
          <StockList
            title="Most Trending"
            mode="static"
            initialStocks={mostTrending}
            showIndicator
            indicatorLabel="Momentum"
          />
        </TabsContent>

        <TabsContent value="breakout">
          <StockList
            title="Highest Breakout"
            mode="static"
            initialStocks={highestBreakout}
            showIndicator
            indicatorLabel="ATR"
          />
        </TabsContent>

        <TabsContent value="favorites">
          <StockList
            title="Favorites"
            description="Your default watchlist"
            mode="watchlist"
            listId={null}
          />
        </TabsContent>

        {watchlists.map(list => (
          <TabsContent key={list.id} value={`list-${list.id}`}>
            <div className="flex flex-col gap-4">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => handleOpenRename(list.id, list.name)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </Button>
                <Button variant="destructive" size="sm" onClick={() => deleteList(list.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete List
                </Button>
              </div>
              <StockList
                title={list.name}
                description={list.description}
                mode="watchlist"
                listId={list.id}
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
