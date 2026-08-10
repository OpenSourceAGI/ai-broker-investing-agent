"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Trophy, TrendingUp, Activity, Loader2, RefreshCw, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Trade {
  symbol: string
  type: "buy" | "sell" | "short"
  price: number
  time: string
  gain?: number
  previousPrice?: number
}

interface Leader {
  id: string
  name: string
  rank: number
  rep: number
  trades: number
  winRate: number
  totalGain: number
  avgReturn: number
  orders?: Trade[]
  broker?: string
}

export function LeadersTab() {
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetchLeaders = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/nvstly/leaders')
      const data = await res.json()
      if (data.success) {
        setLeaders(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch leaders:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/nvstly/sync', {
        method: 'GET'
      })
      await fetchLeaders()
    } catch (error) {
      console.error("Failed to sync:", error)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    fetchLeaders()
  }, [])

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-500'
    if (rank === 2) return 'text-gray-400'
    if (rank === 3) return 'text-orange-600'
    return 'text-muted-foreground'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Investment Leaders</h2>
          <p className="text-muted-foreground">Top-performing traders from NVSTLY</p>
        </div>
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

      {/* Leaders Table */}
      <Card>
        <div className="overflow-x-auto touch-pan-x">
          <table className="w-full min-w-[640px]">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-4 font-semibold">Rank</th>
                <th className="p-4 font-semibold">Trader</th>
                <th className="p-4 font-semibold">Total Gain</th>
                <th className="p-4 font-semibold">Win Rate</th>
                <th className="p-4 font-semibold">Avg Return</th>
                <th className="p-4 font-semibold">Trades</th>
                <th className="p-4 font-semibold">Reputation</th>
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
              ) : leaders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center p-8 text-muted-foreground">
                    No leaders data available. Click "Sync Data" to fetch the latest leaders.
                  </td>
                </tr>
              ) : leaders.map((leader) => (
                <tr key={leader.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {leader.rank <= 3 && (
                        <Trophy className={`h-5 w-5 ${getRankColor(leader.rank)}`} />
                      )}
                      <span className="font-bold text-lg">{leader.rank}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold">{leader.name}</div>
                    {leader.broker && (
                      <div className="text-xs text-muted-foreground">{leader.broker}</div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className={`font-bold ${leader.totalGain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {leader.totalGain >= 0 ? '+' : ''}{leader.totalGain}%
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold">{leader.winRate}%</div>
                  </td>
                  <td className="p-4">
                    <div className={`font-semibold ${leader.avgReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {leader.avgReturn >= 0 ? '+' : ''}{leader.avgReturn}%
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge variant="secondary">{leader.trades}</Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <Activity className="h-4 w-4 text-primary" />
                      <span className="font-medium">{leader.rep}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          View Trades
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>
                            <div className="flex items-center gap-3">
                              {leader.rank <= 3 && (
                                <Trophy className={`h-6 w-6 ${getRankColor(leader.rank)}`} />
                              )}
                              <div>
                                <div className="text-xl">{leader.name}</div>
                                <div className="text-sm font-normal text-muted-foreground">
                                  Rank #{leader.rank} • {leader.trades} trades
                                </div>
                              </div>
                            </div>
                          </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-6">
                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-3 bg-muted rounded-lg">
                              <div className="text-xs text-muted-foreground mb-1">Total Gain</div>
                              <div className={`text-lg font-bold ${leader.totalGain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {leader.totalGain >= 0 ? '+' : ''}{leader.totalGain}%
                              </div>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                              <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
                              <div className="text-lg font-bold">{leader.winRate}%</div>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                              <div className="text-xs text-muted-foreground mb-1">Avg Return</div>
                              <div className={`text-lg font-bold ${leader.avgReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {leader.avgReturn >= 0 ? '+' : ''}{leader.avgReturn}%
                              </div>
                            </div>
                            <div className="p-3 bg-muted rounded-lg">
                              <div className="text-xs text-muted-foreground mb-1">Reputation</div>
                              <div className="text-lg font-bold">{leader.rep}</div>
                            </div>
                          </div>

                          {/* Recent Trades */}
                          {leader.orders && leader.orders.length > 0 && (
                            <div>
                              <h3 className="font-semibold mb-3">Recent Trades</h3>
                              <div className="space-y-2 max-h-96 overflow-y-auto">
                                {leader.orders.map((trade, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={`p-2 rounded ${
                                        trade.type === 'buy' ? 'bg-green-500/10' :
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
                                        <div className={`text-sm font-semibold mt-1 ${
                                          trade.gain >= 0 ? 'text-green-500' : 'text-red-500'
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

      {/* Info Card */}
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
              Use the "Sync Data" button to fetch the latest leaderboard data.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
