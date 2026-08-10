"use client"

import { useState, useRef, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Bot,
  Send,
  Plus,
  Trash2,
  Edit,
  Play,
  Pause,
  Save,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  MessageSquare,
  Settings,
  Sparkles,
  AlertTriangle,
  CheckCircle2
} from "lucide-react"
import {
  alpacaMCPClient,
  TradingStrategy,
  StrategyRule,
  RiskManagement,
  ChatMessage
} from "@/lib/api/alpaca-mcp-client"

export function AlpacaTradingTab() {
  const [activeSection, setActiveSection] = useState<'chat' | 'strategies'>('chat')

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Alpaca Trading Platform</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Chat with AI for strategy suggestions and build custom trading rules
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            <Activity className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        </div>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeSection} onValueChange={(v) => setActiveSection(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chat">
            <MessageSquare className="h-4 w-4 mr-2" />
            Strategy Chat
          </TabsTrigger>
          <TabsTrigger value="strategies">
            <Settings className="h-4 w-4 mr-2" />
            My Strategies
          </TabsTrigger>
        </TabsList>

        {/* Chat Tab */}
        <TabsContent value="chat" className="space-y-4 mt-4">
          <StrategyChatInterface />
        </TabsContent>

        {/* Strategies Tab */}
        <TabsContent value="strategies" className="space-y-4 mt-4">
          <StrategyManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * Strategy Chat Interface Component
 */
function StrategyChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content: 'Hello! I can help you create and optimize trading strategies. Ask me about momentum trading, mean reversion, breakout strategies, or describe your trading idea.',
      timestamp: new Date(),
      suggestions: [
        'What is a good momentum strategy?',
        'Help me create a mean reversion strategy',
        'Explain breakout trading strategies',
      ],
    },
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
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await alpacaMCPClient.chatWithAI([...messages, userMessage])
      setMessages((prev) => [...prev, response])
    } catch (error) {
      console.error('Chat error:', error)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
  }

  return (
    <div className="space-y-4">
      {/* Chat Messages */}
      <Card className="p-4 h-[600px] flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : message.role === 'system'
                      ? 'bg-muted'
                      : 'bg-secondary'
                  }`}
              >
                {message.role !== 'user' && (
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="h-4 w-4" />
                    <span className="text-xs font-medium">AI Strategy Assistant</span>
                  </div>
                )}

                <div className="text-sm whitespace-pre-wrap">{message.content}</div>

                {message.suggestions && message.suggestions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-muted-foreground">Suggested questions:</div>
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

                <div className="text-xs text-muted-foreground mt-2">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-secondary rounded-lg p-4 max-w-[80%]">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 animate-pulse" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask about trading strategies, risk management, or describe your strategy idea..."
            disabled={loading}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || loading}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Quick Actions */}
      {/* <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <h4 className="font-medium mb-2 flex items-center">
            <TrendingUp className="h-4 w-4 mr-2 text-green-500" />
            Momentum Strategies
          </h4>
          <p className="text-xs text-muted-foreground mb-3">
            Trend-following strategies that capitalize on market momentum
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => handleSuggestionClick('Create a momentum trading strategy')}
          >
            Explore
          </Button>
        </Card>

        <Card className="p-4">
          <h4 className="font-medium mb-2 flex items-center">
            <TrendingDown className="h-4 w-4 mr-2 text-blue-500" />
            Mean Reversion
          </h4>
          <p className="text-xs text-muted-foreground mb-3">
            Strategies based on price returning to average levels
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => handleSuggestionClick('Help me build a mean reversion strategy')}
          >
            Explore
          </Button>
        </Card>

        <Card className="p-4">
          <h4 className="font-medium mb-2 flex items-center">
            <Activity className="h-4 w-4 mr-2 text-purple-500" />
            Breakout Trading
          </h4>
          <p className="text-xs text-muted-foreground mb-3">
            Capture moves when price breaks key levels
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => handleSuggestionClick('Show me breakout trading strategies')}
          >
            Explore
          </Button>
        </Card>
      </div> */}
    </div>
  )
}

/**
 * Strategy Manager Component
 */
function StrategyManager() {
  const [strategies, setStrategies] = useState<TradingStrategy[]>([])
  const [editingStrategy, setEditingStrategy] = useState<TradingStrategy | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Load strategies from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('trading_strategies')
    if (saved) {
      setStrategies(JSON.parse(saved))
    }
  }, [])

  // Save strategies to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('trading_strategies', JSON.stringify(strategies))
  }, [strategies])

  const createNewStrategy = () => {
    const newStrategy: TradingStrategy = {
      id: Date.now().toString(),
      name: 'New Strategy',
      description: '',
      symbols: [],
      active: false,
      rules: [],
      riskManagement: {
        maxPositionSize: 10,
        stopLoss: 5,
        takeProfit: 15,
        maxDailyLoss: 2,
      },
      createdAt: new Date().toISOString(),
    }
    setEditingStrategy(newStrategy)
    setIsCreating(true)
  }

  const saveStrategy = (strategy: TradingStrategy) => {
    if (isCreating) {
      setStrategies((prev) => [...prev, strategy])
    } else {
      setStrategies((prev) => prev.map((s) => (s.id === strategy.id ? strategy : s)))
    }
    setEditingStrategy(null)
    setIsCreating(false)
  }

  const deleteStrategy = (id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id))
  }

  const toggleStrategy = (id: string) => {
    setStrategies((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    )
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">My Trading Strategies</h3>
          <p className="text-sm text-muted-foreground">
            Create and manage your automated trading strategies
          </p>
        </div>
        <Button onClick={createNewStrategy}>
          <Plus className="h-4 w-4 mr-2" />
          New Strategy
        </Button>
      </div>

      {/* Strategies List */}
      {strategies.length === 0 ? (
        <Card className="p-12 text-center">
          <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h4 className="font-medium mb-2">No strategies yet</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first trading strategy or chat with AI for suggestions
          </p>
          <Button onClick={createNewStrategy}>
            <Plus className="h-4 w-4 mr-2" />
            Create Strategy
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {strategies.map((strategy) => (
            <Card key={strategy.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium text-lg">{strategy.name}</h4>
                    <Badge
                      className={
                        strategy.active
                          ? 'bg-green-500 hover:bg-green-600'
                          : 'bg-gray-500 hover:bg-gray-600'
                      }
                    >
                      {strategy.active ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Active
                        </>
                      ) : (
                        <>
                          <Pause className="h-3 w-3 mr-1" />
                          Inactive
                        </>
                      )}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground mb-4">
                    {strategy.description || 'No description'}
                  </p>

                  <div className="grid gap-3 md:grid-cols-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {strategy.rules.length} rules
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {strategy.symbols.length} symbols
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {strategy.riskManagement.stopLoss}% stop loss
                      </span>
                    </div>
                  </div>

                  {strategy.symbols.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {strategy.symbols.map((symbol) => (
                        <Badge key={symbol} variant="outline">
                          {symbol}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => toggleStrategy(strategy.id!)}
                  >
                    {strategy.active ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setEditingStrategy(strategy)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteStrategy(strategy.id!)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Strategy Editor Dialog */}
      {editingStrategy && (
        <StrategyEditorDialog
          strategy={editingStrategy}
          open={!!editingStrategy}
          onClose={() => {
            setEditingStrategy(null)
            setIsCreating(false)
          }}
          onSave={saveStrategy}
        />
      )}
    </div>
  )
}

/**
 * Strategy Editor Dialog Component
 */
function StrategyEditorDialog({
  strategy,
  open,
  onClose,
  onSave,
}: {
  strategy: TradingStrategy
  open: boolean
  onClose: () => void
  onSave: (strategy: TradingStrategy) => void
}) {
  const [editedStrategy, setEditedStrategy] = useState<TradingStrategy>(strategy)

  const addRule = (type: StrategyRule['type']) => {
    const newRule: StrategyRule = {
      id: Date.now().toString(),
      type,
      condition: {
        indicator: 'price',
        operator: 'greater_than',
        value: 0,
      },
      action: {
        type: type === 'entry' ? 'buy' : 'sell',
        orderType: 'market',
      },
    }
    setEditedStrategy({
      ...editedStrategy,
      rules: [...editedStrategy.rules, newRule],
    })
  }

  const removeRule = (ruleId: string) => {
    setEditedStrategy({
      ...editedStrategy,
      rules: editedStrategy.rules.filter((r) => r.id !== ruleId),
    })
  }

  const updateRule = (ruleId: string, updates: Partial<StrategyRule>) => {
    setEditedStrategy({
      ...editedStrategy,
      rules: editedStrategy.rules.map((r) =>
        r.id === ruleId ? { ...r, ...updates } : r
      ),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Trading Strategy</DialogTitle>
          <DialogDescription>
            Configure your strategy rules and risk management settings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label>Strategy Name</Label>
              <Input
                value={editedStrategy.name}
                onChange={(e) =>
                  setEditedStrategy({ ...editedStrategy, name: e.target.value })
                }
                placeholder="My Trading Strategy"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={editedStrategy.description}
                onChange={(e) =>
                  setEditedStrategy({ ...editedStrategy, description: e.target.value })
                }
                placeholder="Describe your strategy..."
                rows={3}
              />
            </div>

            <div>
              <Label>Symbols (comma-separated)</Label>
              <Input
                value={editedStrategy.symbols.join(', ')}
                onChange={(e) =>
                  setEditedStrategy({
                    ...editedStrategy,
                    symbols: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
                placeholder="AAPL, MSFT, GOOGL"
              />
            </div>
          </div>

          {/* Rules */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base">Trading Rules</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => addRule('entry')}>
                  <Plus className="h-3 w-3 mr-1" />
                  Entry Rule
                </Button>
                <Button size="sm" variant="outline" onClick={() => addRule('exit')}>
                  <Plus className="h-3 w-3 mr-1" />
                  Exit Rule
                </Button>
              </div>
            </div>

            {editedStrategy.rules.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No rules yet. Add entry and exit rules for your strategy.
              </Card>
            ) : (
              <div className="space-y-3">
                {editedStrategy.rules.map((rule) => (
                  <Card key={rule.id} className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge>{rule.type.replace('_', ' ')}</Badge>
                          <span className="text-sm font-medium">
                            {rule.action.type.toUpperCase()}
                          </span>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                          <div>
                            <Label className="text-xs">Indicator</Label>
                            <Select
                              value={rule.condition.indicator}
                              onValueChange={(value) =>
                                updateRule(rule.id, {
                                  condition: { ...rule.condition, indicator: value },
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="price">Price</SelectItem>
                                <SelectItem value="sma_20">SMA 20</SelectItem>
                                <SelectItem value="sma_50">SMA 50</SelectItem>
                                <SelectItem value="rsi">RSI</SelectItem>
                                <SelectItem value="macd">MACD</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="text-xs">Operator</Label>
                            <Select
                              value={rule.condition.operator}
                              onValueChange={(value: any) =>
                                updateRule(rule.id, {
                                  condition: { ...rule.condition, operator: value },
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="greater_than">Greater than</SelectItem>
                                <SelectItem value="less_than">Less than</SelectItem>
                                <SelectItem value="crosses_above">Crosses above</SelectItem>
                                <SelectItem value="crosses_below">Crosses below</SelectItem>
                                <SelectItem value="equals">Equals</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="text-xs">Value</Label>
                            <Input
                              type="text"
                              className="h-8"
                              value={rule.condition.value}
                              onChange={(e) =>
                                updateRule(rule.id, {
                                  condition: { ...rule.condition, value: e.target.value },
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRule(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Risk Management */}
          <div className="space-y-4">
            <Label className="text-base">Risk Management</Label>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-xs">Max Position Size (%)</Label>
                <Input
                  type="number"
                  value={editedStrategy.riskManagement.maxPositionSize}
                  onChange={(e) =>
                    setEditedStrategy({
                      ...editedStrategy,
                      riskManagement: {
                        ...editedStrategy.riskManagement,
                        maxPositionSize: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>

              <div>
                <Label className="text-xs">Stop Loss (%)</Label>
                <Input
                  type="number"
                  value={editedStrategy.riskManagement.stopLoss}
                  onChange={(e) =>
                    setEditedStrategy({
                      ...editedStrategy,
                      riskManagement: {
                        ...editedStrategy.riskManagement,
                        stopLoss: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>

              <div>
                <Label className="text-xs">Take Profit (%)</Label>
                <Input
                  type="number"
                  value={editedStrategy.riskManagement.takeProfit}
                  onChange={(e) =>
                    setEditedStrategy({
                      ...editedStrategy,
                      riskManagement: {
                        ...editedStrategy.riskManagement,
                        takeProfit: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>

              <div>
                <Label className="text-xs">Max Daily Loss (%)</Label>
                <Input
                  type="number"
                  value={editedStrategy.riskManagement.maxDailyLoss}
                  onChange={(e) =>
                    setEditedStrategy({
                      ...editedStrategy,
                      riskManagement: {
                        ...editedStrategy.riskManagement,
                        maxDailyLoss: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave({
                ...editedStrategy,
                updatedAt: new Date().toISOString(),
              })
            }}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Strategy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
