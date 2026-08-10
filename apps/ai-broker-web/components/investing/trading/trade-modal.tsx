"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, DollarSign, Hash, Loader2, Brain } from "lucide-react"
import { OptionsAdvisor } from "@/components/investing/trading/options-advisor"

interface TradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  symbol: string
  currentPrice: number
  stockName?: string
}

export function TradeModal({
  open,
  onOpenChange,
  symbol,
  currentPrice,
  stockName,
}: TradeModalProps) {
  const [action, setAction] = useState<"buy" | "options">("buy")
  const [orderType, setOrderType] = useState<"shares" | "dollars">("shares")
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [portfolio, setPortfolio] = useState<any>(null)

  // Fetch portfolio data
  useEffect(() => {
    if (open) {
      fetchPortfolio()
    }
  }, [open])

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

  const calculateShares = () => {
    if (orderType === "shares") {
      return parseFloat(amount) || 0
    } else {
      // Calculate shares from dollar amount
      const dollars = parseFloat(amount) || 0
      return dollars / currentPrice
    }
  }

  const calculateTotal = () => {
    if (orderType === "dollars") {
      return parseFloat(amount) || 0
    } else {
      // Calculate dollars from shares
      const shares = parseFloat(amount) || 0
      return shares * currentPrice
    }
  }

  const handleSubmit = async () => {
    setError("")
    setSuccess(false)

    const shares = calculateShares()
    const total = calculateTotal()

    if (action === "options") {
      // Options advisor doesn't submit trades directly here yet
      return
    }

    if (shares <= 0) {
      setError("Please enter a valid amount")
      return
    }

    if (action === "buy" && portfolio && total > portfolio.cash) {
      setError(`Insufficient funds. Available: $${portfolio.cash.toLocaleString()}`)
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
          action,
          shares,
          price: currentPrice,
        }),
      })

      const json = await res.json()

      if (json.success) {
        setSuccess(true)
        setAmount("")
        // Refresh portfolio
        await fetchPortfolio()
        setTimeout(() => {
          onOpenChange(false)
          setSuccess(false)
        }, 1500)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Trade {symbol}
          </DialogTitle>
          <DialogDescription>
            {stockName && <span className="block mb-2">{stockName}</span>}
            <span className="text-lg font-bold">{formatCurrency(currentPrice)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Tabs */}
          <Tabs value={action} onValueChange={(v) => setAction(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="buy" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Buy
              </TabsTrigger>
              <TabsTrigger value="options" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Options AI
              </TabsTrigger>
            </TabsList>

            <TabsContent value="buy" className="space-y-4 mt-4">
              <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-800 dark:text-green-200">
                  Buy shares and profit when the price goes up
                </p>
              </div>

              {/* Buy Form Content (Reused) */}
              <div className="space-y-4">
                <div className="space-y-3">
                  <Label>Order Type</Label>
                  <RadioGroup value={orderType} onValueChange={(v) => setOrderType(v as "shares" | "dollars")}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="shares" id="shares-buy" />
                      <Label htmlFor="shares-buy" className="flex items-center gap-2 cursor-pointer">
                        <Hash className="h-4 w-4" />
                        Number of Shares
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="dollars" id="dollars-buy" />
                      <Label htmlFor="dollars-buy" className="flex items-center gap-2 cursor-pointer">
                        <DollarSign className="h-4 w-4" />
                        Dollar Amount
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount-buy">
                    {orderType === "shares" ? "Number of Shares" : "Dollar Amount"}
                  </Label>
                  <Input
                    id="amount-buy"
                    type="number"
                    step={orderType === "shares" ? "0.001" : "0.01"}
                    min="0"
                    placeholder={orderType === "shares" ? "e.g., 10 or 0.5" : "e.g., 1000"}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {orderType === "shares" ? "Fractional shares supported" : "Minimum $1"}
                  </p>
                </div>

                {amount && parseFloat(amount) > 0 && (
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
                  </div>
                )}

                {portfolio && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-800 dark:text-blue-200">Available Cash:</span>
                      <span className="font-bold text-blue-800 dark:text-blue-200">
                        {formatCurrency(portfolio.cash)}
                      </span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-950 rounded-md border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-800 dark:text-green-200">
                      Trade executed successfully!
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => onOpenChange(false)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={handleSubmit}
                    disabled={loading || !amount || parseFloat(amount) <= 0}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Buy " + symbol
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="options" className="space-y-4 mt-4">
              <div className="pt-2">
                <OptionsAdvisor initialSymbol={symbol} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
