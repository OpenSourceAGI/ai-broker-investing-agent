"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, TrendingUp, Activity, Clock, AlertTriangle, Copy, RefreshCw, Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react"

export function CopyTradingTab() {
  const [traders, setTraders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [source, setSource] = useState("polymarket")

  const fetchData = async (currentSource: string) => {
    setLoading(true)
    try {
      let res
      if (currentSource === 'nvstly') {
        res = await fetch('/api/nvstly/leaders')
      } else {
        res = await fetch(`/api/leaderboard?source=${currentSource}`)
      }
      const data = await res.json()
      if (data.success) {
        setTraders(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      if (source === 'nvstly') {
        await fetch('/api/nvstly/sync', { method: 'POST' })
      } else {
        await fetch('/api/leaderboard/sync', { method: 'POST' })
      }
      await fetchData(source)
    } catch (error) {
      console.error("Failed to sync:", error)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    fetchData(source)
  }, [source])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Top Traders Leaderboard</h2>
        <div className="flex items-center gap-4">
          <Tabs value={source} onValueChange={setSource}>
            <TabsList>
              <TabsTrigger value="polymarket">Polymarket</TabsTrigger>
              <TabsTrigger value="zulu">ZuluTrade</TabsTrigger>
              <TabsTrigger value="nvstly">NVSTLY</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync Data
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto touch-pan-x">
          <table className="w-full min-w-[640px]">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-4 font-semibold">Rank</th>
                <th className="p-4 font-semibold">Trader</th>
                <th className="p-4 font-semibold">Overall P&L</th>
                <th className="p-4 font-semibold">Win Rate</th>
                <th className="p-4 font-semibold">
                  {source === 'nvstly' ? 'Total Trades' : 'Active Positions'}
                </th>
                <th className="p-4 font-semibold">
                  {source === 'nvstly' ? 'Avg Return' : 'Portfolio Value'}
                </th>
                <th className="p-4 font-semibold">
                  {source === 'nvstly' ? 'Broker' : 'Avg Hold'}
                </th>
                <th className="p-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : traders.map((trader) => (
                <tr key={trader.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {trader.rank <= 3 && <Trophy className={`h-5 w-5 ${trader.rank === 1 ? 'text-yellow-500' : trader.rank === 2 ? 'text-gray-400' : 'text-orange-600'}`} />}
                      <span className="font-bold text-lg">{trader.rank}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold">{trader.name}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-green-500 font-bold">
                      {source === 'nvstly'
                        ? `${trader.totalGain ?? 0}%`
                        : source === 'zulu'
                          ? `$${(trader.overallPnL ?? 0).toLocaleString()}`
                          : `${(trader.overallPnL ?? 0).toFixed(0)}`}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold">{(trader.winRate ?? 0).toFixed(0)}%</div>
                  </td>
                  <td className="p-4">
                    <Badge variant="secondary">
                      {source === 'nvstly' ? trader.trades : trader.activePositions}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold">
                      {source === 'nvstly'
                        ? `${trader.avgReturn ?? 0}%`
                        : `$${(trader.currentValue ?? 0).toLocaleString()}`}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">
                      {source === 'nvstly' ? trader.broker || 'N/A' : trader.avgHoldingPeriod}
                    </div>
                  </td>
                  <td className="p-4">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          {source === 'nvstly' ? 'View Trades' : (
                            <>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy
                            </>
                          )}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>
                            <div className="flex items-center gap-3">
                              {trader.rank <= 3 && (
                                <Trophy className={`h-6 w-6 ${trader.rank === 1 ? 'text-yellow-500' :
                                  trader.rank === 2 ? 'text-gray-400' :
                                    'text-orange-600'
                                  }`} />
                              )}
                              <div>
                                <div className="text-xl">{trader.name}</div>
                                <div className="text-sm font-normal text-muted-foreground">
                                  Rank #{trader.rank} • {source === 'nvstly' ? trader.trades : trader.activePositions} {source === 'nvstly' ? 'trades' : 'positions'}
                                </div>
                              </div>
                            </div>
                          </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-6">
                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-3 bg-muted rounded-lg">
                              <div className="text-xs text-muted-foreground mb-1">
                                {source === 'nvstly' ? 'Total Gain' : 'Overall P&L'}
                              </div>
                              <div className={`text-lg font-bold ${(source === 'nvstly' ? (trader.totalGain ?? 0) : (trader.overallPnL ?? 0)) >= 0
                                ? 'text-green-500'
                                : 'text-red-500'
                                }`}>
                                {source === 'nvstly'
                                  ? `${(trader.totalGain ?? 0) >= 0 ? '+' : ''}${trader.totalGain ?? 0}%`
                                  : source === 'zulu'
                                    ? `$${(trader.overallPnL ?? 0).toLocaleString()}`
                                    : `${(trader.overallPnL ?? 0).toFixed(2)}%`}
                              </div>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                              <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
                              <div className="text-lg font-bold">{trader.winRate ?? 0}%</div>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                              <div className="text-xs text-muted-foreground mb-1">
                                {source === 'nvstly' ? 'Avg Return' : 'Max Drawdown'}
                              </div>
                              <div className={`text-lg font-bold ${source === 'nvstly'
                                ? ((trader.avgReturn ?? 0) >= 0 ? 'text-green-500' : 'text-red-500')
                                : 'text-red-500'
                                }`}>
                                {source === 'nvstly'
                                  ? `${(trader.avgReturn ?? 0) >= 0 ? '+' : ''}${trader.avgReturn ?? 0}%`
                                  : `${trader.maxDrawdown ?? 0}%`}
                              </div>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                              <div className="text-xs text-muted-foreground mb-1">
                                {source === 'nvstly' ? 'Reputation' : 'Volatility'}
                              </div>
                              <div className="text-lg font-bold">
                                {source === 'nvstly' ? (trader.rep ?? 0) : `${trader.volatility ?? 0}%`}
                              </div>
                            </div>
                          </div>

                          {/* Recent Trades - NVSTLY specific */}
                          {source === 'nvstly' && trader.orders && trader.orders.length > 0 && (
                            <div>
                              <h3 className="font-semibold mb-3">Recent Trades</h3>
                              <div className="space-y-2 max-h-96 overflow-y-auto">
                                {trader.orders.map((trade: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={`p-2 rounded ${trade.type === 'buy' ? 'bg-green-500/10' :
                                        trade.type === 'sell' ? 'bg-blue-500/10' :
                                          'bg-red-500/10'
                                        }`}>
                                        {trade.type === 'buy' ? (
                                          <ArrowUpRight className="h-4 w-4 text-green-500" />
                                        ) : trade.type === 'sell' ? (
                                          <ArrowUpRight className="h-4 w-4 text-blue-500" />
                                        ) : (
                                          <ArrowDownRight className="h-4 w-4 text-red-500" />
                                        )}
                                      </div>
                                      <div>
                                        <div className="font-semibold">{trade.symbol}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {new Date(trade.time).toLocaleDateString()} at ${trade.price.toFixed(2)}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <Badge variant={
                                        trade.type === 'buy' ? 'default' :
                                          trade.type === 'sell' ? 'secondary' :
                                            'destructive'
                                      }>
                                        {trade.type.toUpperCase()}
                                      </Badge>
                                      {trade.gain !== undefined && (
                                        <div className={`text-sm font-semibold mt-1 ${trade.gain >= 0 ? 'text-green-500' : 'text-red-500'
                                          }`}>
                                          {trade.gain >= 0 ? '+' : ''}{trade.gain}%
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Markets - Non-NVSTLY */}
                          {source !== 'nvstly' && (
                            <div>
                              <h3 className="font-semibold mb-2">Trading Markets</h3>
                              <div className="flex gap-2 flex-wrap">
                                {trader.markets?.map((market: any, i: number) => (
                                  <Badge key={i} variant="secondary">{market}</Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Copy Configuration - Non-NVSTLY */}
                          {source !== 'nvstly' && (
                            <div>
                              <h3 className="font-semibold mb-3">Copy Configuration</h3>
                              <div className="space-y-4">
                                <div>
                                  <label className="text-sm font-medium mb-2 block">
                                    Allocation Amount
                                  </label>
                                  <Input type="number" placeholder="10000" defaultValue="10000" />
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Capital to allocate for copying this trader
                                  </p>
                                </div>

                                <div>
                                  <label className="text-sm font-medium mb-2 block">
                                    Max Position Size (% of allocation)
                                  </label>
                                  <Input type="number" placeholder="20" defaultValue="20" />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                  <div>
                                    <div className="font-medium">Copy All Markets</div>
                                    <div className="text-xs text-muted-foreground">
                                      Follow trades across all market categories
                                    </div>
                                  </div>
                                  <Switch defaultChecked />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                  <div>
                                    <div className="font-medium">Auto-Rebalance</div>
                                    <div className="text-xs text-muted-foreground">
                                      Automatically match trader's position sizing
                                    </div>
                                  </div>
                                  <Switch />
                                </div>
                              </div>
                            </div>
                          )}

                          {source !== 'nvstly' && (
                            <div className="flex gap-2">
                              <Button className="flex-1">
                                Start Copying
                              </Button>
                              <Button variant="outline">
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {source === 'nvstly' && (
        <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-primary/20">
          <div className="flex items-start gap-4">
            <TrendingUp className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold mb-2">About NVSTLY Leaders</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Track the performance of top traders on NVSTLY, a platform for copy trading and social investing.
                Leaders are ranked by their total gain, win rate, and overall reputation score.
              </p>
              <p className="text-sm text-muted-foreground">
                Click "View Trades" to see detailed trade history and performance metrics for each leader.
                Use the "Sync Data" button to fetch the latest leaderboard data from all available NVSTLY leaders.
              </p>
            </div>
          </div>
        </Card>
      )}

      {source !== 'nvstly' && (
        <Card className="p-6">
          <h3 className="text-xl font-bold mb-4">Active Copy Trading</h3>
          <div className="space-y-3"></div>
        </Card>
      )}

      {/* Risk Disclaimer */}
      <Card className="p-4 border-yellow-500/50 bg-yellow-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <strong className="text-foreground">Risk Disclaimer:</strong> Copy Trading does not amount to investment advice. The value of your investments may go up or down. Your capital is at risk. Past performance is not an indication of future results.
          </div>
        </div>
      </Card>
    </div>
  )
}
