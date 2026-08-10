"use client"

import { useState, useRef, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { StockSearch } from "@/components/investing/shared/stock-search"
import { OptionsAdvisor } from "@/components/investing/trading/options-advisor"
import {
  Bot,
  Send,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  BarChart3,
  Loader2,
  Brain,
  Clock,
  Shield,
  MessageSquare,
  ShoppingCart,
  Zap,
  ArrowDownCircle
} from "lucide-react"

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  suggestions?: string[]
  tradingAdvice?: {
    action: 'BUY' | 'SELL' | 'HOLD'
    symbol: string
    amount?: number
    reasoning: string
    confidence: number
  }
}

export function UnifiedOrdersTab({ initialSymbol = 'AAPL' }: { initialSymbol?: string }) {
  const [activeTab, setActiveTab] = useState('buy-sell')
  const [symbol, setSymbol] = useState(initialSymbol)

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Trading & Orders</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Place orders, get AI suggestions, and manage your trading strategies
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            <Activity className="h-3 w-3 mr-1" />
            Live Market
          </Badge>
        </div>
      </Card>

      {/* Main Trading Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="buy-sell">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Buy/Sell
          </TabsTrigger>
          <TabsTrigger value="options">
            <Zap className="h-4 w-4 mr-2" />
            Options
          </TabsTrigger>
          <TabsTrigger value="short">
            <ArrowDownCircle className="h-4 w-4 mr-2" />
            Short
          </TabsTrigger>
          <TabsTrigger value="ai-assistant">
            <Bot className="h-4 w-4 mr-2" />
            AI Assistant
          </TabsTrigger>
        </TabsList>

        {/* Buy/Sell Tab */}
        <TabsContent value="buy-sell" className="space-y-4 mt-4">
          <BuySellInterface symbol={symbol} onSymbolChange={setSymbol} />
        </TabsContent>

        {/* Options Tab */}
        <TabsContent value="options" className="space-y-4 mt-4">
          <OptionsAdvisor initialSymbol={symbol} />
        </TabsContent>

        {/* Short Trading Tab */}
        <TabsContent value="short" className="space-y-4 mt-4">
          <ShortTradingInterface symbol={symbol} onSymbolChange={setSymbol} />
        </TabsContent>

        {/* AI Assistant Tab */}
        <TabsContent value="ai-assistant" className="space-y-4 mt-4">
          <AITradingAssistant symbol={symbol} onSymbolChange={setSymbol} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * Buy/Sell Interface Component
 */
function BuySellInterface({ symbol, onSymbolChange }: { symbol: string; onSymbolChange: (symbol: string) => void }) {
  const [orderType, setOrderType] = useState<"shares" | "dollars">("shares")
  const [amount, setAmount] = useState("")
  const [action, setAction] = useState<"buy" | "sell">("buy")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [currentPrice, setCurrentPrice] = useState(0)

  useEffect(() => {
    if (symbol) {
      fetchCurrentPrice()
    }
  }, [symbol])

  const fetchCurrentPrice = async () => {
    try {
      const res = await fetch(`/api/stocks/quote/${symbol}`)
      const data = await res.json()
      if (data.success && data.data) {
        setCurrentPrice(data.data.price || data.data.regularMarketPrice || 0)
      }
    } catch (err) {
      console.error('Error fetching price:', err)
    }
  }

  const handleTrade = async () => {
    setLoading(true)
    setError("")
    setSuccess(false)

    try {
      const amountNum = parseFloat(amount)
      if (isNaN(amountNum) || amountNum <= 0) {
        setError("Please enter a valid amount")
        return
      }

      // Placeholder for actual trade API
      await new Promise(resolve => setTimeout(resolve, 1000))
      setSuccess(true)
      setAmount("")
    } catch (err: any) {
      setError(err.message || "Failed to place order")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Order Form */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Place Order</h3>

        <div className="space-y-4">
          {/* Stock Selection */}
          <div>
            <Label htmlFor="stock-symbol">Stock Symbol</Label>
            <StockSearch
              value={symbol}
              onSelect={(newSymbol) => onSymbolChange(newSymbol)}
              placeholder="Search stocks..."
            />
          </div>

          {/* Current Price */}
          {currentPrice > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">Current Price</div>
              <div className="text-2xl font-bold">${currentPrice.toFixed(2)}</div>
            </div>
          )}

          {/* Buy/Sell Toggle */}
          <div>
            <Label>Action</Label>
            <RadioGroup value={action} onValueChange={(v) => setAction(v as any)} className="flex gap-4 mt-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="buy" id="buy" />
                <Label htmlFor="buy" className="cursor-pointer">Buy</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sell" id="sell" />
                <Label htmlFor="sell" className="cursor-pointer">Sell</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Order Type */}
          <div>
            <Label>Order Type</Label>
            <RadioGroup value={orderType} onValueChange={(v) => setOrderType(v as any)} className="flex gap-4 mt-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="shares" id="shares" />
                <Label htmlFor="shares" className="cursor-pointer">Shares</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dollars" id="dollars" />
                <Label htmlFor="dollars" className="cursor-pointer">Dollars</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Amount Input */}
          <div>
            <Label htmlFor="amount">
              {orderType === "shares" ? "Number of Shares" : "Dollar Amount"}
            </Label>
            <Input
              id="amount"
              type="number"
              placeholder={orderType === "shares" ? "10" : "1000"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {orderType === "shares" && currentPrice > 0 && amount && (
              <p className="text-sm text-muted-foreground mt-1">
                ≈ ${(parseFloat(amount) * currentPrice).toFixed(2)}
              </p>
            )}
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-500/10 text-green-500 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">Order placed successfully!</span>
            </div>
          )}

          {/* Submit Button */}
          <Button
            className="w-full"
            onClick={handleTrade}
            disabled={loading || !symbol || !amount}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Placing Order...
              </>
            ) : (
              <>
                {action === 'buy' ? <TrendingUp className="h-4 w-4 mr-2" /> : <TrendingDown className="h-4 w-4 mr-2" />}
                {action === 'buy' ? 'Buy' : 'Sell'} {symbol}
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Order Summary & History */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Orders</h3>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No recent orders</p>
        </div>
      </Card>
    </div>
  )
}

/**
 * Short Trading Interface Component
 */
function ShortTradingInterface({ symbol, onSymbolChange }: { symbol: string; onSymbolChange: (symbol: string) => void }) {
  const [loading, setLoading] = useState(false)
  const [recommendation, setRecommendation] = useState<any>(null)

  const getShortRecommendation = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/short-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      })
      const data = await res.json()
      if (data.success) {
        setRecommendation(data)
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Short Trading Advisor</h3>
          <p className="text-sm text-muted-foreground">
            Get AI-powered recommendations for short selling opportunities
          </p>
        </div>

        <div>
          <Label>Stock Symbol</Label>
          <StockSearch
            value={symbol}
            onSelect={(newSymbol) => onSymbolChange(newSymbol)}
            placeholder="Search stocks to short..."
          />
        </div>

        <Button onClick={getShortRecommendation} disabled={loading || !symbol} className="w-full">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Brain className="h-4 w-4 mr-2" />
              Get Short Recommendation
            </>
          )}
        </Button>

        {recommendation && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm">{recommendation.reasoning || 'Analysis complete'}</p>
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * AI Trading Assistant with Groq Llama 3.3
 */
function AITradingAssistant({ symbol, onSymbolChange }: { symbol: string; onSymbolChange: (symbol: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content: `Hello! I'm your AI trading assistant powered by Groq Llama 3.3. I can help you with:

• Stock analysis and recommendations
• Position sizing and risk management
• Options strategy suggestions
• Entry and exit timing
• Portfolio optimization

What would you like help with today?`,
      timestamp: new Date(),
      suggestions: [
        `Should I buy ${symbol}?`,
        `What's a good position size for ${symbol}?`,
        'Analyze this stock for me',
        'Suggest an options strategy'
      ]
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      // Call Groq API with Llama 3.3
      const response = await fetch('/api/strategy-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role === 'system' ? 'system' : m.role === 'user' ? 'user' : 'assistant',
            content: m.content
          })),
          symbol,
          model: 'llama-3.3-70b-versatile'
        })
      })

      const data = await response.json()

      if (data.success) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
          suggestions: data.followUpQuestions || [
            `Tell me more about ${symbol}`,
            'What are the risks?',
            'How much should I invest?',
            'When should I sell?'
          ],
          tradingAdvice: data.tradingAdvice
        }

        setMessages(prev => [...prev, assistantMessage])
      } else {
        throw new Error(data.error || 'Failed to get response')
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
  }

  return (
    <Card className="p-4 h-[700px] flex flex-col">
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-4 ${message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : message.role === 'system'
                    ? 'bg-muted'
                    : 'bg-secondary'
                }`}
            >
              {message.role !== 'user' && (
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="h-4 w-4" />
                  <span className="text-xs font-medium">AI Trading Assistant (Groq Llama 3.3)</span>
                </div>
              )}

              <div className="text-sm whitespace-pre-wrap">{message.content}</div>

              {/* Trading Advice Card */}
              {message.tradingAdvice && (
                <div className="mt-3 p-3 bg-background/50 rounded-md border">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4" />
                    <span className="text-xs font-semibold">Trading Recommendation</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div><strong>Action:</strong> {message.tradingAdvice.action}</div>
                    <div><strong>Symbol:</strong> {message.tradingAdvice.symbol}</div>
                    {message.tradingAdvice.amount && (
                      <div><strong>Suggested Amount:</strong> ${message.tradingAdvice.amount}</div>
                    )}
                    <div><strong>Confidence:</strong> {message.tradingAdvice.confidence}%</div>
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {message.suggestions && message.suggestions.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-muted-foreground">Follow-up questions:</div>
                  {message.suggestions.map((suggestion, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      <Sparkles className="h-3 w-3 mr-2" />
                      {suggestion}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-secondary rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">AI is thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex gap-2 pt-4 border-t">
        <Input
          placeholder="Ask about trading strategies, position sizing, or stock analysis..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          disabled={loading}
        />
        <Button onClick={sendMessage} disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}
