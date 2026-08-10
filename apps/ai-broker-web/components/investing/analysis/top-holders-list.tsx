
"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Users, RefreshCw, ExternalLink, TrendingUp, TrendingDown, Target } from "lucide-react"

interface Holder {
    id: string
    address: string
    userName?: string | null
    profileImage?: string | null
    rank: number
    outcome?: string | null
    balance: number
    value: number
    overallGain?: number | null
    winRate?: number | null
    totalProfit?: number | null
    totalLoss?: number | null
    totalPositions?: number | null
}

interface TopHoldersListProps {
    marketId: string
    eventId?: string
}

export function TopHoldersList({ marketId, eventId }: TopHoldersListProps) {
    const [holders, setHolders] = useState<Holder[]>([])
    const [loading, setLoading] = useState(true)
    const [scraping, setScraping] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchHolders = async (sync = false) => {
        try {
            if (sync) {
                setScraping(true)
            } else {
                setLoading(true)
            }
            setError(null)
            const eventParam = eventId ? `&eventId=${eventId}` : ''
            const syncParam = sync ? '&sync=true' : ''
            const response = await fetch(`/api/polymarket/holders?marketId=${marketId}${eventParam}${syncParam}`)
            const data = await response.json()

            if (data.success) {
                // If no holders and we haven't synced yet, auto-sync
                if (data.holders.length === 0 && !sync) {
                    fetchHolders(true)
                    return
                }
                setHolders(data.holders)
            } else {
                setError(data.error)
            }
        } catch (err) {
            console.error("Error fetching holders", err)
            setError("Failed to load holders")
        } finally {
            setLoading(false)
            setScraping(false)
        }
    }

    useEffect(() => {
        if (marketId) {
            fetchHolders()
        }
    }, [marketId, eventId])

    if (loading) {
        return (
            <div className="flex justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error || holders.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 p-3">
                <div className="text-xs text-muted-foreground text-center">
                    No holder info available
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchHolders(true)}
                    disabled={scraping}
                    className="text-xs h-7"
                >
                    {scraping ? (
                        <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Fetching...
                        </>
                    ) : (
                        <>
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Fetch Top Holders
                        </>
                    )}
                </Button>
            </div>
        )
    }

    // Separate holders by outcome
    const yesHolders = holders.filter(h => h.outcome?.toLowerCase() === 'yes')
    const noHolders = holders.filter(h => h.outcome?.toLowerCase() === 'no')

    const formatGain = (gain: number) => {
        const isPositive = gain >= 0
        const formattedValue = Math.abs(gain) >= 1000000
            ? `${(Math.abs(gain) / 1000000).toFixed(1)}M`
            : Math.abs(gain) >= 1000
                ? `${(Math.abs(gain) / 1000).toFixed(0)}K`
                : Math.abs(gain).toFixed(0)
        return {
            text: `${isPositive ? '+' : '-'}$${formattedValue}`,
            isPositive
        }
    }

    const formatMoney = (amount: number) => {
        const absAmount = Math.abs(amount)
        if (absAmount >= 1000000) return `$${(absAmount / 1000000).toFixed(1)}M`
        if (absAmount >= 1000) return `$${(absAmount / 1000).toFixed(0)}K`
        return `$${absAmount.toFixed(0)}`
    }

    const getProfileUrl = (address: string) =>
        `https://polymarketanalytics.com/trader/${address}`

    const renderHoldersList = (holdersList: Holder[]) => (
        <div className="space-y-2">
            {holdersList.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center p-2">
                    No holders found
                </div>
            ) : (
                holdersList.slice(0, 10).map((holder, index) => (
                    <div key={holder.id} className="text-xs bg-muted/30 p-2 rounded space-y-1.5">
                        {/* Top row: Rank, Name, Position Value */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Badge variant="outline" className="h-4 px-1 text-[10px] min-w-[20px] justify-center flex-shrink-0">
                                    #{index + 1}
                                </Badge>
                                <a
                                    href={getProfileUrl(holder.address)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 min-w-0 hover:text-primary transition-colors"
                                >
                                    <div className="flex flex-col min-w-0">
                                        {holder.userName ? (
                                            <>
                                                <span className="font-medium truncate">{holder.userName}</span>
                                                <span className="font-mono text-[10px] text-muted-foreground truncate" title={holder.address}>
                                                    {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                                                </span>
                                            </>
                                        ) : (
                                            <span className="font-mono text-muted-foreground truncate" title={holder.address}>
                                                {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                                            </span>
                                        )}
                                    </div>
                                    <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                </a>
                            </div>
                            <div className="font-semibold flex-shrink-0 ml-2">
                                ${holder.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                        </div>

                        {/* Stats row: Win Rate, Total P/L, Profit, Loss */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {holder.winRate !== null && holder.winRate !== undefined && (
                                <div className="flex items-center gap-0.5 text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                                    <Target className="h-2.5 w-2.5" />
                                    <span className="font-medium">{holder.winRate.toFixed(0)}%</span>
                                </div>
                            )}
                            {holder.overallGain !== null && holder.overallGain !== undefined && (
                                <div className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${formatGain(holder.overallGain).isPositive
                                    ? 'text-green-600 dark:text-green-400 bg-green-500/10'
                                    : 'text-red-600 dark:text-red-400 bg-red-500/10'
                                    }`}>
                                    <span>PnL:</span>
                                    <span>{formatGain(holder.overallGain).text}</span>
                                </div>
                            )}
                            {holder.totalProfit !== null && holder.totalProfit !== undefined && holder.totalProfit > 0 && (
                                <div className="flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                                    <TrendingUp className="h-2.5 w-2.5" />
                                    <span>{formatMoney(holder.totalProfit)}</span>
                                </div>
                            )}
                            {holder.totalLoss !== null && holder.totalLoss !== undefined && holder.totalLoss < 0 && (
                                <div className="flex items-center gap-0.5 text-[10px] text-red-600 dark:text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                                    <TrendingDown className="h-2.5 w-2.5" />
                                    <span>{formatMoney(Math.abs(holder.totalLoss))}</span>
                                </div>
                            )}
                            {holder.totalPositions !== null && holder.totalPositions !== undefined && (
                                <div className="text-[10px] text-muted-foreground">
                                    {holder.totalPositions} positions
                                </div>
                            )}
                        </div>
                    </div>
                ))
            )}
        </div>
    )

    return (
        <div className="space-y-2 mt-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Users className="h-3 w-3" />
                Top Holders
            </div>
            <Tabs defaultValue="yes" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="yes" className="text-xs">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            Yes ({yesHolders.length})
                        </span>
                    </TabsTrigger>
                    <TabsTrigger value="no" className="text-xs">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            No ({noHolders.length})
                        </span>
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="yes" className="mt-2">
                    {renderHoldersList(yesHolders)}
                </TabsContent>
                <TabsContent value="no" className="mt-2">
                    {renderHoldersList(noHolders)}
                </TabsContent>
            </Tabs>
        </div>
    )
}
