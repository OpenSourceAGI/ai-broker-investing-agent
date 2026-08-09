"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StockSearch } from "@/components/investing/shared/stock-search"
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Calendar,
  DollarSign,
  Hash,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  BarChart3,
  Loader2,
  Brain,
  Clock,
  Shield
} from "lucide-react"

interface ShortRecommendation {
  symbol: string
  currentPrice: number
  strikePrice: number
  expirationDate: string
  expirationDays: number
  optionType: 'put' | 'call'
  reasoning: string
  confidence: number
  maxProfit: string
  maxLoss: string
  suggestedAmount: number
  portfolioPercentage: number
}

export function OrdersTab() {
  const [symbol, setSymbol] = useState("AAPL")
  const [orderType, setOrderType] = useState<"shares" | "dollars">("shares")
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [portfolio, setPortfolio] = useState<any>(null)
  const [currentPrice, setCurrentPrice] = useState(0)
  const [recommendation, setRecommendation] = useState<ShortRecommendation | null>(null)
  const [positions, setPositions] = useState<any[]>([])
  const [trades, setTrades] = useState<any[]>([])

  // Fetch portfolio data
  useEffect(() => {
    fetchPortfolio()
    fetchPositions()
    fetchTrades()
  }, [])

  // Fetch current price when symbol changes
  useEffect(() => {
    if (symbol) {
      fetchCurrentPrice()
    }
  }, [symbol])

  const fetchPortfolio = async () => {
    try {
      const res = await fetch('/api/user/portfolio')
      const json = await res.json()
      if (json.success && json.data) {
        setPortfolio(json.data)
      }
    } catch (err) {
      console.error('Error fetching portfolio:', err)
    }
  }

  const fetchPositions = async () => {
    try {
      const res = await fetch('/api/user/positions')
      const json = await res.json()
      if (json.success && json.data) {
        setPositions(json.data)
      }
    } catch (err) {
      console.error('Error fetching positions:', err)
    }
  }

  const fetchTrades = async () => {
    try {
      const res = await fetch('/api/user/trades')
      const json = await res.json()
      if (json.success && json.data) {
        setTrades(json.data.slice(0, 10)) // Last 10 trades
      }
    } catch (err) {
      console.error('Error fetching trades:', err)
    }
  }

  const fetchCurrentPrice = async () => {
    try {
      const res = await fetch(`/api/stocks/quote?symbol=${symbol}`)
      const json = await res.json()
      if (json.success && json.data) {
        setCurrentPrice(json.data.price || json.data.regularMarketPrice || 0)
      }
    } catch (err) {
      console.error('Error fetching price:', err)
    }
  }

  const calculateShares = () => {
    if (orderType === "shares") {
      return parseFloat(amount) || 0
    } else {
      const dollars = parseFloat(amount) || 0
      return currentPrice > 0 ? dollars / currentPrice : 0
    }
  }

  const calculateTotal = () => {
    if (orderType === "dollars") {
      return parseFloat(amount) || 0
    } else {
      const shares = parseFloat(amount) || 0
      return shares * currentPrice
    }
  }

  const getSuggestedAmount = () => {
    if (!portfolio) return 0

    // Suggest 5-10% of portfolio value for conservative approach
    const portfolioValue = portfolio.totalValue || portfolio.cash || 0
    const suggestedPercentage = 0.075 // 7.5%
    return portfolioValue * suggestedPercentage
  }

  const getAIRecommendation = async () => {
    if (!symbol) {
      setError("Please enter a stock symbol")
      return
    }

    setAiLoading(true)
    setError("")

    try {
      const res = await fetch('/api/short-advisor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          portfolioValue: portfolio?.totalValue || portfolio?.cash || 100000,
          riskTolerance: 'moderate'
        }),
      })

      const json = await res.json()

      if (json.success && json.data) {
        setRecommendation(json.data)
        // Auto-fill the suggested amount
        setAmount(json.data.suggestedAmount.toFixed(2))
        setOrderType("dollars")
      } else {
        setError(json.error || "Failed to get AI recommendation")
      }
    } catch (err: any) {
      console.error('Error getting AI recommendation:', err)
      setError(err.message || "Failed to get AI recommendation")
    } finally {
      setAiLoading(false)
    }
  }

  const handleSubmit = async () => {
    setError("")
    setSuccess(false)

    const shares = calculateShares()
    const total = calculateTotal()

    if (shares <= 0) {
      setError("Please enter a valid amount")
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/user/trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          action: 'short',
          shares,
          price: currentPrice,
        }),
      })

      const json = await res.json()

      if (json.success) {
        setSuccess(true)
        setAmount("")
        setRecommendation(null)
        // Refresh data
        await fetchPortfolio()
        await fetchPositions()
        await fetchTrades()
        setTimeout(() => {
          setSuccess(false)
        }, 3000)
      } else {
        setError(json.error || "Failed to execute trade")
      }
    } catch (err) {
      console.error('Error executing trade:', err)
      setError("Failed to execute trade")
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  }

  const suggestedAmount = getSuggestedAmount()

  return (
    <div className="space-y-6">
      {/* Short Trading Form */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="h-6 w-6 text-red-500" />
          <h2 className="text-2xl font-bold">Short Trading</h2>
        </div>
        <p className="text-muted-foreground mb-6">
          Short sell shares and profit when the price goes down. Get AI-powered recommendations for optimal entry points and position sizing.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Left Column: Trading Form */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="symbol">Stock Symbol</Label>
              <StockSearch
                value={symbol}
                onChange={(val) => setSymbol(val.toUpperCase())}
                onSelect={(val) => setSymbol(val)}
                placeholder="e.g., TSLA"
              />
            </div>

            {currentPrice > 0 && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Current Price</span>
                  <span className="text-xl font-bold">{formatCurrency(currentPrice)}</span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label>Order Type</Label>
              <RadioGroup value={orderType} onValueChange={(v) => setOrderType(v as "shares" | "dollars")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="shares" id="shares-short" />
                  <Label htmlFor="shares-short" className="flex items-center gap-2 cursor-pointer">
                    <Hash className="h-4 w-4" />
                    Number of Shares
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="dollars" id="dollars-short" />
                  <Label htmlFor="dollars-short" className="flex items-center gap-2 cursor-pointer">
                    <DollarSign className="h-4 w-4" />
                    Dollar Amount
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="amount-short">
                  {orderType === "shares" ? "Number of Shares" : "Dollar Amount"}
                </Label>
                {suggestedAmount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      setAmount(suggestedAmount.toFixed(2))
                      setOrderType("dollars")
                    }}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    Use Suggested: {formatCurrency(suggestedAmount)}
                  </Button>
                )}
              </div>
              <Input
                id="amount-short"
                type="number"
                step={orderType === "shares" ? "0.001" : "0.01"}
                min="0"
                placeholder={orderType === "shares" ? "e.g., 10 or 0.5" : "e.g., 1000"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {orderType === "shares" ? "Fractional shares supported" : `Suggested: ${((suggestedAmount / (portfolio?.totalValue || 100000)) * 100).toFixed(1)}% of portfolio`}
              </p>
            </div>

            {amount && parseFloat(amount) > 0 && currentPrice > 0 && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shares:</span>
                  <span className="font-medium">
                    {calculateShares().toFixed(6)} {symbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price per Share:</span>
                  <span className="font-medium">{formatCurrency(currentPrice)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="font-semibold">Total:</span>
                  <span className="font-bold text-lg">{formatCurrency(calculateTotal())}</span>
                </div>
                {portfolio && (
                  <div className="border-t pt-2 flex justify-between text-xs">
                    <span className="text-muted-foreground">Portfolio %:</span>
                    <span className="font-medium">
                      {((calculateTotal() / (portfolio.totalValue || portfolio.cash)) * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {portfolio && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-800 dark:text-blue-200">Portfolio Value:</span>
                  <span className="font-bold text-blue-800 dark:text-blue-200">
                    {formatCurrency(portfolio.totalValue || portfolio.cash)}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950 rounded-md border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Short trade executed successfully!
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={getAIRecommendation}
                disabled={aiLoading || !symbol}
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Get AI Recommendation
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleSubmit}
                disabled={loading || !amount || parseFloat(amount) <= 0 || currentPrice === 0}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-4 w-4 mr-2" />
                    Short {symbol}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Right Column: AI Recommendation */}
          <div>
            {recommendation ? (
              <Card className="p-4 border-2 border-primary bg-primary/5">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="h-5 w-5 text-primary" />
                  <h3 className="font-bold">AI Recommendation</h3>
                  <Badge variant="default" className="ml-auto">
                    {recommendation.confidence}% Confidence
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="p-3 bg-background/50 rounded-lg border">
                    <div className="text-xs text-muted-foreground mb-1">Strike Price</div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-lg">{formatCurrency(recommendation.strikePrice)}</span>
                      <Badge variant="outline">
                        {recommendation.optionType.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-3 bg-background/50 rounded-lg border">
                    <div className="text-xs text-muted-foreground mb-1">Expiration Date</div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{recommendation.expirationDate}</span>
                      <Badge variant="secondary" className="ml-auto">
                        {recommendation.expirationDays} days
                      </Badge>
                    </div>
                  </div>

                  <div className="p-3 bg-background/50 rounded-lg border">
                    <div className="text-xs text-muted-foreground mb-1">Suggested Position Size</div>
                    <div className="font-bold text-lg">{formatCurrency(recommendation.suggestedAmount)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {recommendation.portfolioPercentage.toFixed(1)}% of portfolio
                    </div>
                  </div>

                  <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">
                      Max Potential Profit
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-300">
                      {recommendation.maxProfit}
                    </div>
                  </div>

                  <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                    <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">
                      Max Potential Loss
                    </div>
                    <div className="text-sm text-red-700 dark:text-red-300">
                      {recommendation.maxLoss}
                    </div>
                  </div>

                  <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 flex items-center gap-2">
                      <Sparkles className="h-3 w-3" />
                      AI Analysis
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      {recommendation.reasoning}
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-8 border-2 border-dashed flex flex-col items-center justify-center text-center h-full">
                <Brain className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">AI-Powered Short Recommendations</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Click "Get AI Recommendation" to receive personalized short trading advice including:
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 text-left">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    Optimal strike price and expiration date
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    Suggested position size based on your portfolio
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    Risk/reward analysis with max profit/loss
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    AI-powered market analysis and reasoning
                  </li>
                </ul>
              </Card>
            )}
          </div>
        </div>
      </Card>

      {/* Open Positions */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-6">Open Positions</h2>
        <div className="overflow-x-auto touch-pan-x">
          <table className="w-full min-w-[640px]">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-3 font-semibold">Symbol</th>
                <th className="p-3 font-semibold">Type</th>
                <th className="p-3 font-semibold">Shares</th>
                <th className="p-3 font-semibold">Entry Price</th>
                <th className="p-3 font-semibold">Current Price</th>
                <th className="p-3 font-semibold">P&L</th>
                <th className="p-3 font-semibold">Opened</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr key={pos.id} className="border-b hover:bg-muted/50">
                  <td className="p-3 font-semibold">{pos.symbol}</td>
                  <td className="p-3">
                    <Badge variant={pos.type === 'long' ? 'default' : 'destructive'}>
                      {pos.type?.toUpperCase() || 'LONG'}
                    </Badge>
                  </td>
                  <td className="p-3">{pos.shares?.toFixed(4) || 0}</td>
                  <td className="p-3">${pos.entryPrice?.toFixed(2) || 0}</td>
                  <td className="p-3">${pos.currentPrice?.toFixed(2) || 0}</td>
                  <td className="p-3">
                    <div className={`font-bold ${(pos.unrealizedPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {(pos.unrealizedPnL || 0) >= 0 ? '+' : ''}${(pos.unrealizedPnL || 0).toLocaleString()}
                    </div>
                    <div className={`text-xs ${(pos.unrealizedPnLPercent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {(pos.unrealizedPnLPercent || 0) >= 0 ? '+' : ''}{(pos.unrealizedPnLPercent || 0).toFixed(2)}%
                    </div>
                  </td>
                  <td className="p-3 text-sm">{pos.openedAt ? new Date(pos.openedAt).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {positions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No open positions</p>
              <p className="text-sm mt-2">Your positions will appear here after placing trades</p>
            </div>
          )}
        </div>
      </Card>

      {/* Recent Trades */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-6">Recent Trades</h2>
        <div className="space-y-3">
          {trades.map((trade) => (
            <div key={trade.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg ${trade.action === 'buy' ? 'bg-green-500/10' :
                    trade.action === 'short' ? 'bg-red-500/10' :
                      'bg-blue-500/10'
                  }`}>
                  {trade.action === 'buy' || trade.action === 'cover' ? (
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div>
                  <div className="font-semibold">{trade.symbol}</div>
                  <div className="text-sm text-muted-foreground">
                    {trade.action?.toUpperCase()} {(trade.shares || 0).toFixed(4)} @ ${(trade.price || 0).toFixed(2)}
                  </div>
                </div>
                <Badge variant="outline">{trade.type || 'STOCK'}</Badge>
              </div>

              <div className="text-right">
                {trade.pnl !== undefined && trade.pnl !== null && (
                  <div className={`font-bold ${trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString()}
                  </div>
                )}
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {trade.createdAt ? new Date(trade.createdAt).toLocaleString() : '-'}
                </div>
              </div>
            </div>
          ))}
          {trades.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No trade history yet</p>
              <p className="text-sm mt-2">Your recent trades will appear here</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
