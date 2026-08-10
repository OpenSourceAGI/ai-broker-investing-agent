"use client"

import { TrendingUp, Zap, BarChart3, List } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface MarketStatsCardsProps {
  indexCount: number
  trendingCount: number
  breakoutCount: number
  watchlistCount: number
}

export function MarketStatsCards({
  indexCount,
  trendingCount,
  breakoutCount,
  watchlistCount,
}: MarketStatsCardsProps) {
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Market Indexes</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{indexCount}</div>
          <p className="text-xs text-muted-foreground">Trackers</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Trending</CardTitle>
          <TrendingUp className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{trendingCount}</div>
          <p className="text-xs text-muted-foreground">High Momentum</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Breakout</CardTitle>
          <Zap className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{breakoutCount}</div>
          <p className="text-xs text-muted-foreground">Above 20-day high</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Your Lists</CardTitle>
          <List className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{watchlistCount}</div>
          <p className="text-xs text-muted-foreground">Includes Favorites</p>
        </CardContent>
      </Card>
    </div>
  )
}
