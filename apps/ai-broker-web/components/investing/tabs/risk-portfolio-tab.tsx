"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
// import { demoRiskMetrics, demoPositions, demoTrades } from "@/lib/demo-data"
import { useSession } from "@/lib/auth-client"
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Shield,
  Clock
} from "lucide-react"

export function RiskPortfolioTab() {
  const { data: session } = useSession()
  const risk = session ? [] : demoRiskMetrics
  const positions = session ? [] : demoPositions  // Empty array if signed in
  const trades = session ? [] : demoTrades  // Empty array if signed in

  return (
    <div className="space-y-6">
      {/* Risk Dashboard */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-6">Risk Dashboard</h2>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4 border-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">VIX Level</span>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold mb-1">{risk.vix}</div>
            <Badge variant={risk.vixRegime === 'Low' ? 'default' : risk.vixRegime === 'High' ? 'destructive' : 'secondary'}>
              {risk.vixRegime} Volatility
            </Badge>
          </Card>

          <Card className="p-4 border-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Portfolio Vol</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold mb-1">{risk.portfolioVolatility}%</div>
            <Progress value={risk.portfolioVolatility} className="h-2" />
          </Card>

          <Card className="p-4 border-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Leverage</span>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold mb-1">{risk.currentLeverage}x</div>
            <div className="text-xs text-muted-foreground">Max: {risk.maxLeverage}x</div>
            <Progress value={(risk.currentLeverage / risk.maxLeverage) * 100} className="h-2 mt-2" />
          </Card>

          <Card className="p-4 border-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Daily VaR (95%)</span>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold text-red-500">${Math.abs(risk.varDaily).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Max expected daily loss</div>
          </Card>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold mb-3">Concentration Risk</h3>
          <div className="space-y-3">
            {risk.topConcentrations?.map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-sm font-bold">{item.exposure}%</span>
                </div>
                <Progress value={item.exposure} className="h-2" />
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Risk Controls */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-6">Risk Controls</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium mb-2 block">Max Leverage</label>
            <Input type="number" defaultValue={risk.maxLeverage} step="0.1" />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Max Single Asset (%)</label>
            <Input type="number" defaultValue="10" />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Max Sector Exposure (%)</label>
            <Input type="number" defaultValue="50" />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Max PM Allocation (%)</label>
            <Input type="number" defaultValue="15" />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium">Auto-Pause on Drawdown</div>
              <div className="text-xs text-muted-foreground">
                Pause all strategies if daily drawdown exceeds threshold
              </div>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium">Position Size Scaling</div>
              <div className="text-xs text-muted-foreground">
                Automatically adjust position sizes based on VIX regime
              </div>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium">Correlation Monitoring</div>
              <div className="text-xs text-muted-foreground">
                Alert when portfolio correlation exceeds limits
              </div>
            </div>
            <Switch defaultChecked />
          </div>
        </div>

        <div className="mt-6 p-4 bg-red-500/10 border-2 border-red-500/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <div>
                <div className="font-bold text-red-500">Emergency Controls</div>
                <div className="text-sm text-muted-foreground">
                  Immediately close all positions and pause all strategies
                </div>
              </div>
            </div>
            <Button variant="destructive" size="lg">
              STOP ALL
            </Button>
          </div>
        </div>
      </Card>

      {/* Portfolio Holdings */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-6">Portfolio Holdings</h2>

        <div className="overflow-x-auto touch-pan-x">
          <table className="w-full min-w-[640px]">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-3 font-semibold">Asset</th>
                <th className="p-3 font-semibold">Type</th>
                <th className="p-3 font-semibold">Entry Price</th>
                <th className="p-3 font-semibold">Current Price</th>
                <th className="p-3 font-semibold">Size</th>
                <th className="p-3 font-semibold">Unrealized P&L</th>
                <th className="p-3 font-semibold">Strategy</th>
                <th className="p-3 font-semibold">Opened</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr key={pos.id} className="border-b hover:bg-muted/50">
                  <td className="p-3 font-semibold">{pos.asset}</td>
                  <td className="p-3">
                    <Badge variant={pos.type === 'stock' ? 'default' : 'secondary'}>
                      {pos.type === 'stock' ? 'Stock' : 'PM'}
                    </Badge>
                  </td>
                  <td className="p-3">${pos.entryPrice.toFixed(2)}</td>
                  <td className="p-3">${pos.currentPrice.toFixed(2)}</td>
                  <td className="p-3">{pos.size.toLocaleString()}</td>
                  <td className="p-3">
                    <div className={`font-bold ${pos.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {pos.unrealizedPnL >= 0 ? '+' : ''}${pos.unrealizedPnL.toLocaleString()}
                    </div>
                    <div className={`text-xs ${pos.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {pos.unrealizedPnLPercent >= 0 ? '+' : ''}{pos.unrealizedPnLPercent.toFixed(2)}%
                    </div>
                  </td>
                  <td className="p-3 text-sm">{pos.strategy}</td>
                  <td className="p-3 text-sm">{new Date(pos.openedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {positions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">No positions yet</p>
              <p className="text-sm mt-2">Your portfolio holdings will appear here</p>
            </div>
          )}
        </div>
      </Card>

      {/* Trade History */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-6">Recent Trade History</h2>

        <div className="space-y-3">
          {trades.map((trade) => (
            <div key={trade.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg ${trade.action === 'buy' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  {trade.action === 'buy' ? (
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div>
                  <div className="font-semibold">{trade.asset}</div>
                  <div className="text-sm text-muted-foreground">
                    {trade.action.toUpperCase()} {trade.size.toLocaleString()} @ ${trade.price.toFixed(2)}
                  </div>
                </div>
                <Badge variant="outline">{trade.strategy}</Badge>
              </div>

              <div className="text-right">
                {trade.pnl !== undefined && (
                  <div className={`font-bold ${trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString()}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {new Date(trade.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
          {trades.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">No trade history yet</p>
              <p className="text-sm mt-2">Your recent trades will appear here</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
