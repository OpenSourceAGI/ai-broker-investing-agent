"use client"

import { TrendingUp, TrendingDown, DollarSign, BarChart3, Activity } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const stats = [
  {
    label: "Portfolio Value",
    value: "$124,532.89",
    change: "+2.5%",
    trend: "up",
    icon: DollarSign,
  },
  {
    label: "Today's P&L",
    value: "+$3,241.50",
    change: "+2.7%",
    trend: "up",
    icon: TrendingUp,
  },
  {
    label: "Active Positions",
    value: "12",
    change: "+3",
    trend: "up",
    icon: BarChart3,
  },
  {
    label: "Agents Active",
    value: "4/4",
    change: "100%",
    trend: "up",
    icon: Activity,
  },
]

export function StockOverview() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div
                className={`flex items-center gap-1 text-sm font-medium ${
                  stat.trend === "up" ? "text-chart-1" : "text-chart-4"
                }`}
              >
                {stat.trend === "up" ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {stat.change}
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-card-foreground">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
