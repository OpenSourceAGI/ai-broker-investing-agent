"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StockSearch } from "@/components/investing/shared/stock-search"
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  BarChart3,
} from "lucide-react"

interface OptionStrategy {
  name: string
  type: 'income' | 'directional' | 'volatility' | 'range'
  description: string
  bullishBearish: 'bullish' | 'bearish' | 'neutral'
  riskLevel: 'low' | 'medium' | 'high'
  maxProfit: string
  maxLoss: string
  bestFor: string
  recommended: boolean
  strikePrice?: number
  expirationWindow?: string
  expirationDays?: number
  reasoning?: string
  confidence?: number
}

interface OptionsAdvisorResponse {
  success: boolean
  symbol: string
  currentPrice: number
  marketData: {
    trend: string
    volatility: string
    rsi?: number
    macd?: string
  }
  recommendedStrategy: OptionStrategy
  allStrategies: OptionStrategy[]
  llmAnalysis: string
}

export function OptionsAdvisor({ initialSymbol = 'AAPL' }: { initialSymbol?: string }) {
  const [symbol, setSymbol] = useState(initialSymbol)
  const [budget, setBudget] = useState('10000')
  const [riskTolerance, setRiskTolerance] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<OptionsAdvisorResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedStrategy, setSelectedStrategy] = useState<OptionStrategy | null>(null)

  const analyzeOptions = async () => {
    if (!symbol) {
      setError('Please enter a stock symbol')
      return
    }

    setIsAnalyzing(true)
    setError(null)

    try {
      const response = await fetch('/api/options-advisor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          budget: parseInt(budget),
          riskTolerance,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setResult(data)
        setSelectedStrategy(data.recommendedStrategy)
      } else {
        setError(data.error || 'Failed to analyze options strategies')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to analyze options strategies')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-500'
      case 'medium': return 'text-yellow-500'
      case 'high': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend.toLowerCase()) {
      case 'bullish': return <TrendingUp className="h-4 w-4 text-green-500" />
      case 'bearish': return <TrendingDown className="h-4 w-4 text-red-500" />
      default: return <Activity className="h-4 w-4 text-blue-500" />
    }
  }

  const getStrategyTypeColor = (type: string) => {
    switch (type) {
      case 'income': return 'bg-blue-500/10 text-blue-500'
      case 'directional': return 'bg-purple-500/10 text-purple-500'
      case 'volatility': return 'bg-orange-500/10 text-orange-500'
      case 'range': return 'bg-green-500/10 text-green-500'
      default: return 'bg-gray-500/10 text-gray-500'
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">AI Options Strategy Advisor</h2>
        </div>
        <p className="text-muted-foreground mb-6">
          Get AI-powered recommendations for the best options trading strategy based on real-time market data and technical analysis.
        </p>

        <div className="grid gap-4 md:grid-cols-4 mb-4">
          <div>
            <Label htmlFor="symbol">Stock Symbol</Label>
            <StockSearch
              value={symbol}
              onChange={(val) => setSymbol(val.toUpperCase())}
              onSelect={(val) => setSymbol(val)}
              placeholder="e.g., AAPL"
            />
          </div>
          <div>
            <Label htmlFor="budget">Budget ($)</Label>
            <Input
              id="budget"
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="10000"
            />
          </div>
          <div>
            <Label htmlFor="risk">Risk Tolerance</Label>
            <Select value={riskTolerance} onValueChange={(v: any) => setRiskTolerance(v)}>
              <SelectTrigger id="risk">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={analyzeOptions} disabled={isAnalyzing} className="w-full">
              {isAnalyzing ? (
                <>
                  <Activity className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analyze
                </>
              )}
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 border border-red-500 bg-red-50 dark:bg-red-950 rounded-lg text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </Card>

      {result && (
        <>
          {/* Market Analysis Summary */}
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">Market Analysis - {result.symbol}</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-sm text-muted-foreground">Current Price</div>
                  <div className="text-2xl font-bold">${result.currentPrice.toFixed(2)}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {getTrendIcon(result.marketData.trend)}
                <div>
                  <div className="text-sm text-muted-foreground">Trend</div>
                  <div className="text-lg font-semibold capitalize">{result.marketData.trend}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Activity className="h-8 w-8 text-orange-500" />
                <div>
                  <div className="text-sm text-muted-foreground">Volatility</div>
                  <div className="text-lg font-semibold capitalize">{result.marketData.volatility}</div>
                </div>
              </div>
              {result.marketData.rsi && (
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-8 w-8 text-blue-500" />
                  <div>
                    <div className="text-sm text-muted-foreground">RSI</div>
                    <div className="text-lg font-semibold">{result.marketData.rsi.toFixed(1)}</div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Recommended Strategy Highlight */}
          <Card className="p-6 border-2 border-primary bg-primary/5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              <h3 className="text-xl font-bold">Recommended Strategy</h3>
              {result.recommendedStrategy.confidence && (
                <Badge variant="default" className="ml-auto">
                  {result.recommendedStrategy.confidence}% Confidence
                </Badge>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="text-2xl font-bold mb-2">{result.recommendedStrategy.name}</h4>
                <div className="flex gap-2 mb-3">
                  <Badge className={getStrategyTypeColor(result.recommendedStrategy.type)}>
                    {result.recommendedStrategy.type}
                  </Badge>
                  <Badge variant={
                    result.recommendedStrategy.bullishBearish === 'bullish' ? 'default' :
                      result.recommendedStrategy.bullishBearish === 'bearish' ? 'destructive' : 'secondary'
                  }>
                    {result.recommendedStrategy.bullishBearish}
                  </Badge>
                  <Badge className={getRiskColor(result.recommendedStrategy.riskLevel)}>
                    {result.recommendedStrategy.riskLevel} risk
                  </Badge>
                </div>
                <p className="text-muted-foreground mb-4">{result.recommendedStrategy.description}</p>
                {result.recommendedStrategy.reasoning && (
                  <div className="bg-background/50 p-3 rounded-lg border">
                    <div className="text-sm font-semibold mb-1">AI Analysis:</div>
                    <div className="text-sm">{result.recommendedStrategy.reasoning}</div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm text-muted-foreground">Strike Price</div>
                    <div className="font-semibold">
                      ${result.recommendedStrategy.strikePrice?.toFixed(2) || 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm text-muted-foreground">Expiration Window</div>
                    <div className="font-semibold">
                      {result.recommendedStrategy.expirationWindow || 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="bg-background/50 p-3 rounded-lg border">
                  <div className="text-sm font-semibold mb-1">Max Profit:</div>
                  <div className="text-sm text-green-500">{result.recommendedStrategy.maxProfit}</div>
                </div>
                <div className="bg-background/50 p-3 rounded-lg border">
                  <div className="text-sm font-semibold mb-1">Max Loss:</div>
                  <div className="text-sm text-red-500">{result.recommendedStrategy.maxLoss}</div>
                </div>
              </div>
            </div>
          </Card>

          {/* All Strategies Grid */}
          <div>
            <h3 className="text-xl font-bold mb-4">All Options Strategies</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {result.allStrategies.map((strategy) => (
                <Card
                  key={strategy.name}
                  className={`p-4 cursor-pointer transition-all hover:shadow-lg ${selectedStrategy?.name === strategy.name ? 'border-2 border-primary' : ''
                    } ${strategy.recommended ? 'bg-primary/5' : ''}`}
                  onClick={() => setSelectedStrategy(strategy)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-bold text-lg">{strategy.name}</h4>
                    {strategy.recommended && (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    )}
                  </div>

                  <div className="flex gap-2 mb-3">
                    <Badge className={getStrategyTypeColor(strategy.type)} variant="outline">
                      {strategy.type}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        strategy.bullishBearish === 'bullish' ? 'border-green-500 text-green-500' :
                          strategy.bullishBearish === 'bearish' ? 'border-red-500 text-red-500' :
                            'border-blue-500 text-blue-500'
                      }
                    >
                      {strategy.bullishBearish}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {strategy.description}
                  </p>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Risk Level:</span>
                      <span className={`font-semibold ${getRiskColor(strategy.riskLevel)}`}>
                        {strategy.riskLevel.toUpperCase()}
                      </span>
                    </div>
                    {strategy.strikePrice && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Strike:</span>
                        <span className="font-semibold">${strategy.strikePrice.toFixed(2)}</span>
                      </div>
                    )}
                    {strategy.expirationWindow && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Expiration:</span>
                        <span className="font-semibold">{strategy.expirationWindow}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t text-xs">
                    <div className="font-semibold mb-1">Best For:</div>
                    <div className="text-muted-foreground">{strategy.bestFor}</div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Selected Strategy Details */}
          {selectedStrategy && (
            <Card className="p-6">
              <h3 className="text-xl font-bold mb-4">Strategy Details: {selectedStrategy.name}</h3>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Description</h4>
                    <p className="text-muted-foreground">{selectedStrategy.description}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Best Used For</h4>
                    <p className="text-muted-foreground">{selectedStrategy.bestFor}</p>
                  </div>
                  {selectedStrategy.reasoning && (
                    <div>
                      <h4 className="font-semibold mb-2">AI Recommendation</h4>
                      <p className="text-muted-foreground">{selectedStrategy.reasoning}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
                    <h4 className="font-semibold text-green-500 mb-2">Maximum Profit</h4>
                    <p className="text-sm">{selectedStrategy.maxProfit}</p>
                  </div>
                  <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/20">
                    <h4 className="font-semibold text-red-500 mb-2">Maximum Loss</h4>
                    <p className="text-sm">{selectedStrategy.maxLoss}</p>
                  </div>
                  <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                    <h4 className="font-semibold text-blue-500 mb-2">Risk Level</h4>
                    <p className="text-sm capitalize">{selectedStrategy.riskLevel}</p>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
