"use client"

import React, { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { QuoteView } from "@/components/investing/shared/quote-view"
import { StockSearch } from "@/components/investing/shared/stock-search"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { MarkdownRenderer } from "@/components/investing/shared/markdown-renderer"
import { demoStrategies, Strategy } from "@/lib/demo-data"
import {
  Play,
  Pause,
  Settings,
  TrendingUp,
  TrendingDown,
  Activity,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Brain,
  FileText,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2
} from "lucide-react"
import {
  stockAgentsAPI,
  NewsResearcherAnalysisResponse,
  DebateAnalystAnalysisResponse,
  BacktestResponse
} from "@/lib/api/stock-agents-api"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { setStateInURL } from "@/lib/utils"

interface TradeSignal {
  date: string
  time: number
  action: 'BUY' | 'SELL'
  price: number
}

interface BacktestResult {
  strategyName: string
  strategyId: string
  finalValue: number
  totalReturn: number
  totalReturnPercent: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  sharpeRatio?: number
  maxDrawdown: number
  signals: TradeSignal[]
}

interface StrategiesTabProps {
  symbol?: string;
}

export function StrategiesTab({ symbol: symbolProp }: StrategiesTabProps = {}) {
  const searchParams = useSearchParams()
  const symbolFromUrl = searchParams.get('symbol')

  // Priority: prop > URL param > default
  const initialSymbol = symbolProp || symbolFromUrl || 'AAPL'

  // -- Shared State --
  const [selectedStock, setSelectedStock] = useState<string>(initialSymbol)
  const [activeTab, setActiveTab] = useState("debate-analyst")

  // -- Strategies Tab State --
  const [strategies, setStrategies] = useState<Strategy[]>(demoStrategies)
  const [sortOption, setSortOption] = useState<'likes' | 'name' | 'pnl'>('likes')
  const [selectedStrategyForModal, setSelectedStrategyForModal] = useState<Strategy | null>(null)
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false)
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 9
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [backtestParams, setBacktestParams] = useState({
    startDate: '2022-01-01',
    endDate: '2024-12-01',
    initialCapital: 100000,
  })
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([])
  const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([])
  const [isBacktesting, setIsBacktesting] = useState(false)
  const [backtestError, setBacktestError] = useState<string | null>(null)
  const [selectedBacktestSignals, setSelectedBacktestSignals] = useState<TradeSignal[]>([])

  // -- Agent Data State --
  const [loadingAgent, setLoadingAgent] = useState(false)
  const [newsResearcherData, setNewsResearcherData] = useState<NewsResearcherAnalysisResponse | null>(null)
  const [debateAnalystData, setDebateAnalystData] = useState<DebateAnalystAnalysisResponse | null>(null)
  const [historyLogs, setHistoryLogs] = useState<any[]>([])
  const [errorAgent, setErrorAgent] = useState<string | null>(null)


  // Update local state when prop or URL parameter changes
  useEffect(() => {
    const newSymbol = symbolProp || symbolFromUrl
    if (newSymbol) {
      setSelectedStock(newSymbol)
    }
  }, [symbolProp, symbolFromUrl])

  // Sync selected stock to URL (only if not using prop-based routing)
  useEffect(() => {
    if (selectedStock && !symbolProp) {
      setStateInURL({ symbol: selectedStock })
    }
  }, [selectedStock, symbolProp])

  // Load strategies on mount
  useEffect(() => {
    const fetchAlgoScripts = async () => {
      try {
        const response = await fetch('/api/strategies')
        if (response.ok) {
          const scripts = await response.json()
          const newStrategies: Strategy[] = scripts.map((script: any) => ({
            id: script.url || Math.random().toString(36).substring(7),
            name: script.name || 'Unnamed Strategy',
            description: '', // Description is not loaded initially
            todayPnL: 0,
            last7DaysPnL: 0,
            last30DaysPnL: 0,
            winRate: 0,
            activeMarkets: 0,
            tradesToday: 0,
            status: 'paper',
            timeframe: 'Variable',
            riskLevel: 'medium',
            bestConditions: 'N/A',
            avoidWhen: 'N/A',
            likes: script.likes || 0,
            author: script.author || 'Unknown',
            created: script.created || '',
            updated: script.updated || '',
            script_type: script.script_type || 'strategy',
          }))

          setStrategies(prev => {
            const existingIds = new Set(prev.map(s => s.id))
            const uniqueNewStrategies = newStrategies.filter(s => !existingIds.has(s.id))
            return [...uniqueNewStrategies, ...prev]
          })
        }
      } catch (error) {
        console.error("Failed to fetch algo scripts", error)
      }
    }

    fetchAlgoScripts()
  }, [])

  // Load history on mount
  useEffect(() => {
    fetchHistory()
  }, [])

  // -- Helper Functions --

  const handleOpenStrategyModal = async (strategyId: string) => {
    const strategy = strategies.find(s => s.id === strategyId)
    if (!strategy) return

    setSelectedStrategyForModal(strategy)
    setIsModalOpen(true)

    // If description/source is missing, fetch it
    if ((!strategy.description || !strategy.source) && !strategy.id.startsWith('demo-')) {
      setLoadingDetails(true)
      try {
        const response = await fetch(`/api/strategies?id=${strategyId}`)
        if (response.ok) {
          const details = await response.json()
          const updatedStrategy = {
            ...strategy,
            description: details.description,
            source: details.source,
          }
          setSelectedStrategyForModal(updatedStrategy)
          setStrategies(prev => prev.map(s => s.id === strategyId ? updatedStrategy : s))
        }
      } catch (error) {
        console.error("Failed to fetch strategy details", error)
      } finally {
        setLoadingDetails(false)
      }
    }
  }

  const sortedStrategies = [...strategies].sort((a, b) => {
    if (sortOption === 'likes') {
      return (b.likes || 0) - (a.likes || 0)
    } else if (sortOption === 'name') {
      return a.name.localeCompare(b.name)
    } else {
      return b.last30DaysPnL - a.last30DaysPnL
    }
  })



  const handleStrategyToggle = (strategyId: string) => {
    setSelectedStrategies(prev =>
      prev.includes(strategyId)
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    )
  }

  const handleSelectAll = () => {
    if (selectedStrategies.length === strategies.length) {
      setSelectedStrategies([])
    } else {
      setSelectedStrategies(strategies.map(s => s.id))
    }
  }

  const runBacktest = async () => {
    if (selectedStrategies.length === 0) {
      setBacktestError('Please select at least one strategy')
      return
    }

    setIsBacktesting(true)
    setBacktestError(null)
    setSelectedBacktestSignals([])

    try {
      const response = await fetch('/api/backtest-technical', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: selectedStock,
          startDate: backtestParams.startDate,
          endDate: backtestParams.endDate,
          initialCapital: backtestParams.initialCapital,
          strategyIds: selectedStrategies,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setBacktestResults(data.results)
      } else {
        setBacktestError(data.error || 'Backtest failed')
      }
    } catch (error: any) {
      setBacktestError(error.message || 'Failed to run backtest')
    } finally {
      setIsBacktesting(false)
    }
  }

  const analyzeWithNewsResearcher = async () => {
    if (!selectedStock) return

    setLoadingAgent(true)
    try {
      const result = await stockAgentsAPI.analyzeWithNewsResearcher({
        symbols: [selectedStock]
      })
      setNewsResearcherData(result)
    } catch (error) {
      console.error('News Researcher analysis failed:', error)
      alert(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoadingAgent(false)
    }
  }

  const analyzeWithDebateAnalyst = async () => {
    if (!selectedStock) return

    setLoadingAgent(true)
    try {
      const result = await stockAgentsAPI.analyzeWithDebateAnalyst({
        symbol: selectedStock
      })
      setDebateAnalystData(result)
    } catch (error) {
      console.error('Debate Analyst analysis failed:', error)
      alert(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoadingAgent(false)
    }
  }

  const fetchHistory = async () => {
    try {
      const logs = await stockAgentsAPI.getAgentLogs()
      setHistoryLogs(logs)
    } catch (err) {
      console.error('Failed to fetch history:', err)
      setErrorAgent(`Failed to fetch history: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const getDecisionBadge = (decision: string) => {
    const colors = {
      BUY: 'bg-green-500 hover:bg-green-600',
      SELL: 'bg-red-500 hover:bg-red-600',
      HOLD: 'bg-yellow-500 hover:bg-yellow-600'
    }
    return (
      <Badge className={`${colors[decision as keyof typeof colors] || 'bg-gray-500'} text-white`}>
        {decision}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">

      {/* Top Section: Search & Chart */}
      <div className="grid gap-4 pt-4">
        <div>
          <StockSearch
            value={selectedStock}
            onChange={(val) => setSelectedStock(val.toUpperCase())}
            onSelect={(val) => setSelectedStock(val)}
            placeholder="Search Symbol (e.g. AAPL)"
          />
        </div>

        <div className="border rounded-lg overflow-hidden bg-background">
          <QuoteView
            symbol={selectedStock}
            showBackButton={false}
            tradeSignals={selectedBacktestSignals}
          />
        </div>
      </div>


      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="debate-analyst">Debate Analyst</TabsTrigger>
          <TabsTrigger value="buy-sell">Buy / Sell</TabsTrigger>
          <TabsTrigger value="news-researcher">News Researcher</TabsTrigger>
          <TabsTrigger value="algo-strategies">Algo Strategies</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* --- Tab 1: Debate Analyst --- */}
        <TabsContent value="debate-analyst" className="space-y-4 mt-4">
          <Card className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h3 className="text-xl font-bold">Debate Analyst</h3>
                <p className="text-sm text-muted-foreground">AI agents debate bull vs bear cases to reach a consensus.</p>
              </div>
              <Button
                onClick={analyzeWithDebateAnalyst}
                disabled={!selectedStock || loadingAgent}
              >
                {loadingAgent ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Brain className="mr-2 h-4 w-4" />
                    Run Analysis for {selectedStock}
                  </>
                )}
              </Button>
            </div>

            {debateAnalystData ? (
              <div className="space-y-6">
                {debateAnalystData.decision.debate_summary && (
                  <Card className="p-6">
                    <h3 className="text-xl font-bold mb-4">Debate Summary</h3>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <h4 className="text-sm font-medium text-green-600 mb-3 flex items-center">
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Bull Arguments
                        </h4>
                        <ul className="space-y-2">
                          {debateAnalystData.decision.debate_summary.bull_arguments.map((arg, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
                              <div className="flex-1">
                                <MarkdownRenderer content={arg} className="!space-y-1 text-sm [&>p]:!text-inherit [&>p]:!m-0" />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-red-600 mb-3 flex items-center">
                          <TrendingDown className="h-4 w-4 mr-2" />
                          Bear Arguments
                        </h4>
                        <ul className="space-y-2">
                          {debateAnalystData.decision.debate_summary.bear_arguments.map((arg, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <XCircle className="h-4 w-4 mt-0.5 text-red-500 flex-shrink-0" />
                              <div className="flex-1">
                                <MarkdownRenderer content={arg} className="!space-y-1 text-sm [&>p]:!text-inherit [&>p]:!m-0" />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                      <h4 className="text-sm font-medium mb-2">Risk Assessment</h4>
                      <div className="text-sm text-muted-foreground">
                        <MarkdownRenderer content={debateAnalystData.decision.debate_summary.risk_assessment} />
                      </div>
                    </div>
                  </Card>
                )}

                <Card className="p-4 bg-muted/30">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Analysis Date: {debateAnalystData.date}</span>
                    <span>Timestamp: {new Date(debateAnalystData.timestamp).toLocaleString()}</span>
                  </div>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
                <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  Run an analysis to see the Debate Analyst in action.
                </p>
                <Button onClick={analyzeWithDebateAnalyst} disabled={!selectedStock || loadingAgent}>
                  Start Analysis
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* --- Tab 1.5: Buy / Sell --- */}
        <TabsContent value="buy-sell" className="space-y-4 mt-4">
          <Card className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h3 className="text-xl font-bold">Buy / Sell Recommendation</h3>
                <p className="text-sm text-muted-foreground">Actionable signals based on agent consensus.</p>
              </div>
            </div>

            {debateAnalystData ? (
              <div className="space-y-6">
                <Card className="p-6 border-2 border-primary/10">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold">Recommended Action</h3>
                    {getDecisionBadge(debateAnalystData.decision.action)}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Confidence</div>
                      <div className="text-2xl font-bold">
                        {(debateAnalystData.decision.confidence * 100).toFixed(1)}%
                      </div>
                      <Progress value={debateAnalystData.decision.confidence * 100} className="mt-2" />
                    </div>

                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Position Size</div>
                      <div className="text-2xl font-bold">
                        {(debateAnalystData.decision.position_size * 100).toFixed(1)}%
                      </div>
                      <Progress value={debateAnalystData.decision.position_size * 100} className="mt-2" />
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-sm font-medium mb-2">Reasoning</div>
                    <MarkdownRenderer content={debateAnalystData.decision.reasoning} />
                  </div>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
                <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  Run an analysis in the Debate Analyst tab to generate Buy/Sell signals.
                </p>
                <Button onClick={() => setActiveTab("debate-analyst")}>
                  Go to Debate Analyst
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* --- Tab 2: News Researcher --- */}
        <TabsContent value="news-researcher" className="space-y-4 mt-4">
          <Card className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h3 className="text-xl font-bold">News Researcher</h3>
                <p className="text-sm text-muted-foreground">Aggregates news, technicals, and fundamentals for investment decisions.</p>
              </div>
              <Button
                onClick={analyzeWithNewsResearcher}
                disabled={!selectedStock || loadingAgent}
              >
                {loadingAgent ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Run Research for {selectedStock}
                  </>
                )}
              </Button>
            </div>

            {newsResearcherData ? (
              <div className="space-y-6">
                {newsResearcherData.result.portfolio_manager_results && (
                  <Card className="p-6 border-2 border-primary/10">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold">Portfolio Manager Decision</h3>
                      {getDecisionBadge(newsResearcherData.result.portfolio_manager_results.decision)}
                    </div>

                    <div className="mb-4">
                      <div className="text-sm text-muted-foreground mb-1">Confidence</div>
                      <div className="text-2xl font-bold">
                        {(newsResearcherData.result.portfolio_manager_results.confidence * 100).toFixed(1)}%
                      </div>
                      <Progress value={newsResearcherData.result.portfolio_manager_results.confidence * 100} className="mt-2" />
                    </div>

                    <div>
                      <div className="text-sm font-medium mb-2">Reasoning</div>
                      <MarkdownRenderer content={newsResearcherData.result.portfolio_manager_results.reasoning} />
                    </div>
                  </Card>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  {newsResearcherData.result.technical_analysis_results && (
                    <Card className="p-4">
                      <h4 className="text-sm font-medium mb-2 flex items-center">
                        <Activity className="h-4 w-4 mr-2" />
                        Technical Analysis
                      </h4>
                      <div className="text-xs text-muted-foreground">
                        <MarkdownRenderer content={newsResearcherData.result.technical_analysis_results.summary || 'Data collected and analyzed'} />
                      </div>
                    </Card>
                  )}

                  {newsResearcherData.result.news_intelligence_results && (
                    <Card className="p-4">
                      <h4 className="text-sm font-medium mb-2 flex items-center">
                        <FileText className="h-4 w-4 mr-2" />
                        News Intelligence
                      </h4>
                      <div className="text-xs text-muted-foreground">
                        <MarkdownRenderer content={newsResearcherData.result.news_intelligence_results.summary || 'Sentiment analysis complete'} />
                      </div>
                    </Card>
                  )}

                  {newsResearcherData.result.data_collection_results && (
                    <Card className="p-4">
                      <h4 className="text-sm font-medium mb-2 flex items-center">
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Data Collection
                      </h4>
                      <div className="text-xs text-muted-foreground">
                        <MarkdownRenderer content={newsResearcherData.result.data_collection_results.summary || 'Market data retrieved'} />
                      </div>
                    </Card>
                  )}
                </div>

                <Card className="p-4 bg-muted/30">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Symbols: {newsResearcherData.symbols.join(', ')}</span>
                    <span>Date: {newsResearcherData.date}</span>
                    <span>Timestamp: {new Date(newsResearcherData.timestamp).toLocaleString()}</span>
                  </div>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  Run a research task to see the News Researcher in action.
                </p>
                <Button onClick={analyzeWithNewsResearcher} disabled={!selectedStock || loadingAgent}>
                  Start Research
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* --- Tab 3: Algo Strategies (Existing Logic) --- */}
        <TabsContent value="algo-strategies" className="space-y-4 mt-4">
          <Card className="p-6">
            {/* Backtest Controls */}
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                {/* Note: Symbol is global now, but kept display consistent with previous design if needed, 
                            though simpler to just use the global selectedStock for backtest params too. */}
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={backtestParams.startDate}
                    onChange={(e) => setBacktestParams({ ...backtestParams, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={backtestParams.endDate}
                    onChange={(e) => setBacktestParams({ ...backtestParams, endDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="capital">Initial Capital</Label>
                  <Input
                    id="capital"
                    type="number"
                    value={backtestParams.initialCapital}
                    onChange={(e) => setBacktestParams({ ...backtestParams, initialCapital: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label>Select Strategies to Backtest for {selectedStock}</Label>
                </div>
                <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 max-h-60 overflow-y-auto border rounded-lg p-4">
                  {strategies
                    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
                    .map((strategy) => (
                      <div
                        key={strategy.id}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={`strategy-${strategy.id}`}
                          checked={selectedStrategies.includes(strategy.id)}
                          onCheckedChange={() => handleStrategyToggle(strategy.id)}
                        />
                        <label
                          htmlFor={`strategy-${strategy.id}`}
                          className="flex flex-col space-y-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          <span>{strategy.name}</span>
                        </label>
                      </div>
                    ))}
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {selectedStrategies.length} strateg{selectedStrategies.length === 1 ? 'y' : 'ies'} selected
                </div>
              </div>

              {backtestError && (
                <div className="p-4 border border-red-500 bg-red-50 dark:bg-red-950 rounded-lg text-red-600 dark:text-red-400">
                  {backtestError}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={runBacktest} disabled={isBacktesting} size="lg">
                  {isBacktesting ? (
                    <>
                      <Activity className="h-4 w-4 mr-2 animate-spin" />
                      Running Backtest...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Run Backtest
                    </>
                  )}
                </Button>
              </div>

              {backtestResults.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-4">Backtest Results - {selectedStock}</h3>
                  <div className="text-sm text-muted-foreground mb-4">
                    Period: {backtestParams.startDate} to {backtestParams.endDate} | Initial Capital: ${backtestParams.initialCapital.toLocaleString()}
                    <br />
                    <span className="italic">Click on a strategy below to display buy/sell indicators on the chart above</span>
                    {selectedBacktestSignals.length > 0 && (
                      <span className="ml-4 text-primary font-medium">
                        • {selectedBacktestSignals.length} trade signals displayed
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {backtestResults.map((result, index) => (
                      <div
                        key={`${result.strategyId}-${index}`}
                        onClick={() => setSelectedBacktestSignals(result.signals)}
                        className={`flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer border-2 ${selectedBacktestSignals === result.signals
                          ? 'bg-primary/10 border-primary'
                          : 'bg-muted border-transparent hover:bg-muted/80 hover:border-muted-foreground/20'
                          }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{index + 1}. {result.strategyName}</div>
                            <Badge variant={result.totalReturnPercent >= 0 ? 'default' : 'destructive'}>
                              {result.totalReturnPercent >= 0 ? '+' : ''}{result.totalReturnPercent.toFixed(2)}%
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Trades: {result.totalTrades} | Win Rate: {result.winRate.toFixed(1)}% |
                            {result.sharpeRatio && ` Sharpe: ${result.sharpeRatio.toFixed(2)} |`} Max DD: {result.maxDrawdown.toFixed(2)}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${result.totalReturnPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            ${result.finalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className={`text-xs ${result.totalReturnPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {result.totalReturnPercent >= 0 ? '+' : ''}${result.totalReturn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Strategy List Card */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select value={sortOption} onValueChange={(v: any) => setSortOption(v as any)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="likes">Most Liked</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedStrategies.length === strategies.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sortedStrategies
                .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
                .map((strategy) => (
                  <Card key={strategy.id} className="p-4 cursor-pointer hover:border-primary transition-colors" onClick={() => handleStrategyToggle(strategy.id)}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {strategy.likes !== undefined && (
                            <Badge variant="secondary" className="text-xs">
                              {strategy.likes}
                            </Badge>
                          )}

                          <span className="font-bold text-xs">{strategy.author || 'N/A'}</span>
                          <span className="font-semibold text-xs">{new Date(strategy.created || "")?.toLocaleDateString('en-US', {
                            month: 'short',
                            day: '2-digit',
                            year: 'numeric',
                          })
                          }</span>

                        </div>
                        <h3 className="text-lg font-bold mb-1">{strategy.name}</h3>
                      </div>
                      <div className="flex items-center gap-2">

                        <Checkbox
                          id={`card-checkbox-${strategy.id}`}
                          checked={selectedStrategies.includes(strategy.id)}
                          onCheckedChange={(checked) => {
                            handleStrategyToggle(strategy.id)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-2 h-5 w-5"
                        />
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs mb-3 w-full"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenStrategyModal(strategy.id)
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-2" />
                      View Details
                    </Button>
                  </Card>
                ))}
            </div>

            {/* Pagination Controls */}
            {sortedStrategies.length > ITEMS_PER_PAGE && (
              <div className="mt-6">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(p => Math.max(1, p - 1));
                        }}
                        isActive={currentPage === 1}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>

                    {(() => {
                      const totalPages = Math.ceil(sortedStrategies.length / ITEMS_PER_PAGE);
                      const items: React.ReactNode[] = [];

                      // Helper to add page link
                      const addPage = (page: number) => {
                        items.push(
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              isActive={currentPage === page}
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage(page);
                              }}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      };

                      // Helper to add ellipsis
                      const addEllipsis = (key: string) => {
                        items.push(
                          <PaginationItem key={key}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      };

                      if (totalPages <= 7) {
                        for (let i = 1; i <= totalPages; i++) addPage(i);
                      } else {
                        // Logic for many pages
                        if (currentPage <= 4) {
                          for (let i = 1; i <= 5; i++) addPage(i);
                          addEllipsis("end-ellipsis");
                          addPage(totalPages);
                        } else if (currentPage >= totalPages - 3) {
                          addPage(1);
                          addEllipsis("start-ellipsis");
                          for (let i = totalPages - 4; i <= totalPages; i++) addPage(i);
                        } else {
                          addPage(1);
                          addEllipsis("start-ellipsis");
                          addPage(currentPage - 1);
                          addPage(currentPage);
                          addPage(currentPage + 1);
                          addEllipsis("end-ellipsis");
                          addPage(totalPages);
                        }
                      }
                      return items;
                    })()}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(p => Math.min(Math.ceil(sortedStrategies.length / ITEMS_PER_PAGE), p + 1));
                        }}
                        className={currentPage === Math.ceil(sortedStrategies.length / ITEMS_PER_PAGE) ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        </TabsContent>

        {/* --- Tab 4: History --- */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Analysis History</h3>
              <Button onClick={fetchHistory} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
            {historyLogs.length > 0 ? (
              <div className="rounded-md border">
                <div className="grid grid-cols-5 gap-4 p-3 bg-muted font-medium text-sm">
                  <div>Date</div>
                  <div>Symbol</div>
                  <div>Agent</div>
                  <div>Decision</div>
                  <div>Action</div>
                </div>
                <div className="divide-y">
                  {historyLogs.map((log: any) => {
                    const signal = typeof log.responseSignal === 'string' ? JSON.parse(log.responseSignal) : log.responseSignal;
                    const analysis = typeof log.responseAnalysis === 'string' ? JSON.parse(log.responseAnalysis) : log.responseAnalysis;
                    // Determine agent type based on available data fields
                    const agentType = analysis?.investmentDebate ? 'debate-analyst' : 'news-researcher';

                    return (
                      <div key={log.id} className="grid grid-cols-5 gap-4 p-3 items-center hover:bg-muted/50 transition-colors text-sm">
                        <div>{new Date(log.timestamp).toLocaleString()}</div>
                        <div className="font-medium">{log.symbol}</div>
                        <div className="capitalize">{agentType.replace('-', ' ')}</div>
                        <div>
                          {signal?.action && getDecisionBadge(signal.action)}
                        </div>
                        <div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedStock(log.symbol);

                              if (agentType === 'debate-analyst') {
                                const bullArgs = analysis.investmentDebate?.bullArguments;
                                const bearArgs = analysis.investmentDebate?.bearArguments;

                                setDebateAnalystData({
                                  success: true,
                                  symbol: log.symbol,
                                  date: new Date(log.timestamp).toISOString().split('T')[0],
                                  timestamp: log.timestamp,
                                  decision: {
                                    action: signal.action,
                                    confidence: signal.confidence,
                                    reasoning: signal.reasoning,
                                    position_size: 0.1,
                                    debate_summary: analysis.investmentDebate ? {
                                      bull_arguments: Array.isArray(bullArgs) ? bullArgs : [bullArgs || ''],
                                      bear_arguments: Array.isArray(bearArgs) ? bearArgs : [bearArgs || ''],
                                      risk_assessment: analysis.investmentDebate.riskAssessment || "Historical Analysis"
                                    } : undefined
                                  }
                                });
                                setActiveTab("debate-analyst");
                              } else {
                                setNewsResearcherData({
                                  success: true,
                                  symbols: [log.symbol],
                                  date: new Date(log.timestamp).toISOString().split('T')[0],
                                  timestamp: log.timestamp,
                                  result: {
                                    portfolio_manager_results: {
                                      decision: signal.action,
                                      confidence: signal.confidence,
                                      reasoning: signal.reasoning
                                    },
                                    technical_analysis_results: { summary: analysis.marketReport },
                                    news_intelligence_results: { summary: analysis.newsReport },
                                    data_collection_results: { summary: analysis.fundamentalsReport }
                                  }
                                });
                                setActiveTab("news-researcher");
                              }
                            }}
                          >
                            View Analysis
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No history available
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>


      {/* Strategy Details Modal (Kept from original) */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">{selectedStrategyForModal?.name}</DialogTitle>
            <div className="flex items-center gap-2 mt-2">
              {selectedStrategyForModal?.likes !== undefined && (
                <Badge variant="secondary" className="text-xs">
                  ❤️ {selectedStrategyForModal.likes}
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                by {selectedStrategyForModal?.author || 'Unknown'}
              </span>
              {selectedStrategyForModal?.created && (
                <span className="text-sm text-muted-foreground">
                  • {new Date(selectedStrategyForModal.created).toLocaleDateString('en-US', {
                    month: 'short',
                    day: '2-digit',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            {loadingDetails ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground animate-pulse">
                Loading strategy details...
              </div>
            ) : (
              <>
                {selectedStrategyForModal?.description && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Description</h3>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {selectedStrategyForModal.description}
                    </p>
                  </div>
                )}

                {selectedStrategyForModal?.source && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Source Code</h3>
                    <div className="bg-muted p-4 rounded-md overflow-x-auto">
                      <pre className="text-xs font-mono">{selectedStrategyForModal.source}</pre>
                    </div>
                  </div>
                )}

                {selectedStrategyForModal?.id && !selectedStrategyForModal.id.startsWith('demo-') && (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`https://www.tradingview.com/script/${selectedStrategyForModal.id}`, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View on TradingView
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
