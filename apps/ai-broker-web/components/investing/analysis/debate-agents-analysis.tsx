'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface DebateAnalysisResult {
  success: boolean
  ticker: string
  result?: {
    company: string
    price: number
    decision: 'BUY' | 'SELL' | 'HOLD'
    analysis: string
    quote_data: any
    final_trade_decision: string
    token_usage: {
      total_tokens: number
      total_cost_usd: number
    }
    timestamp: string
  }
  error?: string
}

export function DebateAgentsAnalysis() {
  const [ticker, setTicker] = useState('')
  const [quickMode, setQuickMode] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DebateAnalysisResult | null>(null)

  const runAnalysis = async () => {
    if (!ticker.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/debate-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: ticker.toUpperCase(),
          quickMode,
          quiet: true
        })
      })

      const data = await response.json()
      setResult(data)
    } catch (error: any) {
      setResult({
        success: false,
        ticker: ticker.toUpperCase(),
        error: error.message || 'Analysis failed'
      })
    } finally {
      setLoading(false)
    }
  }

  const getDecisionIcon = (decision?: string) => {
    switch (decision) {
      case 'BUY':
        return <TrendingUp className="h-5 w-5 text-green-500" />
      case 'SELL':
        return <TrendingDown className="h-5 w-5 text-red-500" />
      default:
        return <Minus className="h-5 w-5 text-yellow-500" />
    }
  }

  const getDecisionColor = (decision?: string) => {
    switch (decision) {
      case 'BUY':
        return 'bg-green-500/10 text-green-500 border-green-500/20'
      case 'SELL':
        return 'bg-red-500/10 text-red-500 border-red-500/20'
      default:
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Multi-Agent Debate Analysis</CardTitle>
        <CardDescription>
          AI-powered stock analysis using multiple specialized agents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter ticker symbol (e.g., AAPL)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === 'Enter' && runAnalysis()}
            disabled={loading}
            className="flex-1"
          />
          <Button onClick={runAnalysis} disabled={loading || !ticker.trim()}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze'
            )}
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="quick-mode"
            checked={quickMode}
            onCheckedChange={setQuickMode}
            disabled={loading}
          />
          <Label htmlFor="quick-mode" className="text-sm">
            Quick Mode (faster, less detailed)
          </Label>
        </div>

        {result && (
          <div className="space-y-4 mt-6">
            {result.success && result.result ? (
              <>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="text-lg font-semibold">{result.result.company}</h3>
                    <p className="text-sm text-muted-foreground">{result.ticker}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      ${result.result.price?.toFixed(2)}
                    </p>
                    <Badge variant="outline" className={getDecisionColor(result.result.decision)}>
                      <span className="flex items-center gap-1">
                        {getDecisionIcon(result.result.decision)}
                        {result.result.decision}
                      </span>
                    </Badge>
                  </div>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <p className="whitespace-pre-wrap">{result.result.analysis}</p>
                    </div>
                  </CardContent>
                </Card>

                {result.result.quote_data && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Market Data</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Market Cap</p>
                          <p className="font-semibold">
                            ${(result.result.quote_data.marketCap / 1e9).toFixed(2)}B
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Volume</p>
                          <p className="font-semibold">
                            {result.result.quote_data.volume?.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">P/E Ratio</p>
                          <p className="font-semibold">
                            {result.result.quote_data.trailingPE?.toFixed(2) || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">52W Range</p>
                          <p className="font-semibold">
                            ${result.result.quote_data.fiftyTwoWeekLow?.toFixed(2)} - $
                            {result.result.quote_data.fiftyTwoWeekHigh?.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {result.result.token_usage && (
                  <div className="text-xs text-muted-foreground text-right">
                    Tokens: {result.result.token_usage.total_tokens.toLocaleString()} •
                    Cost: ${result.result.token_usage.total_cost_usd.toFixed(4)}
                  </div>
                )}
              </>
            ) : (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="text-base text-destructive">Analysis Failed</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{result.error}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
