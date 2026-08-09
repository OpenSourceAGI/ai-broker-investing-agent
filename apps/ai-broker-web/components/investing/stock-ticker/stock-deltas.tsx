"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { cleanCompanyName } from "@/packages/investing/src/stocks/stock-names"
import { ChangeIcon } from "./change-icon"
import { getStockLogoUrl } from "./utils"
import { showPercentSign } from "./constants"
import type { ChangeType, TickerData, TickerItemProps } from "./types"


export function StockIntervalDelta({
  data,
  showIcon = true,
  showSymbol = false,
  showName = true,
  showPriceStock = false,
  showPriceIndex = false,
  enabledIntervals = ['d', 'w', 'm', 'y'],
  orderHistorical = true,
  showMinusSign = false,
  showDeltaSymbols = true,
  setNeutralMagnitude = 3,
}: TickerItemProps) {
  const router = useRouter()

  if (!data) return null;

  const isDailyPositive = data.change >= 0
  const isWeeklyPositive = (data.weeklyChange ?? 0) >= 0
  const isMonthlyPositive = data.monthlyChange >= 0
  const isYearlyPositive = data.yearlyChange >= 0

  const hasWeeklyData = data.weeklyChange !== undefined && data.weeklyChangePercent !== undefined

  // Determine if price should be shown based on type
  const showPrice = data.type === 'stock' ? showPriceStock : showPriceIndex

  // Get background color class based on change magnitude
  const getChangeBackgroundClass = (changePercent: number, isPositive: boolean) => {
    const absChange = Math.abs(changePercent)

    if (absChange <= setNeutralMagnitude) {
      return "" // No background for small changes
    } else if (absChange >= 100) {
      return isPositive ? "bg-emerald-500/50" : "bg-red-500/50"
    } else if (absChange >= 75) {
      return isPositive ? "bg-emerald-500/40" : "bg-red-500/40"
    } else if (absChange >= 50) {
      return isPositive ? "bg-emerald-500/30" : "bg-red-500/30"
    } else if (absChange >= 25) {
      return isPositive ? "bg-emerald-500/20" : "bg-red-500/20"
    } else if (absChange >= 10) {
      return isPositive ? "bg-emerald-500/10" : "bg-red-500/10"
    } else {
      // return isPositive ? "bg-emerald-500/10" : "bg-red-500/10"
    }
  }

  // Get text color class based on change magnitude (no color for changes <= 2%)
  const getChangeTextColor = (changePercent: number, isPositive: boolean) => {
    const absChange = Math.abs(changePercent)
    if (absChange <= setNeutralMagnitude) {
      return "text-muted-foreground" // Muted color for small changes
    }
    return isPositive ? "text-emerald-500" : "text-red-500"
  }

  // Get border class for extreme changes (>= 100%)
  const getChangeBorderClass = (changePercent: number, isPositive: boolean) => {
    const absChange = Math.abs(changePercent)
    if (absChange >= 100) {
      return isPositive ? "border border-emerald-500" : "border border-red-500"
    }
    return ""
  }

  // Get direction for ChangeIcon based on change magnitude
  const getChangeDirection = (changePercent: number): 'positive' | 'negative' | 'neutral' => {
    const absChange = Math.abs(changePercent)
    if (absChange <= 2) {
      return 'neutral'
    }
    return changePercent >= 0 ? 'positive' : 'negative'
  }

  const handleClick = () => {
    router.push(`/stock/${data.symbol}`)
  }

  // Determine the order of time periods
  const timePeriodsOrder = orderHistorical ? ['y', 'm', 'w', 'd'] : ['d', 'w', 'm', 'y']

  // Get change data for a given time period
  const getChangeData = (period: string) => {
    switch (period) {
      case 'd': return { changePercent: data.changePercent, isPositive: isDailyPositive }
      case 'w': return { changePercent: data.weeklyChangePercent, isPositive: isWeeklyPositive }
      case 'm': return { changePercent: data.monthlyChangePercent, isPositive: isMonthlyPositive }
      case 'y': return { changePercent: data.yearlyChangePercent, isPositive: isYearlyPositive }
      default: return null
    }
  }

  // Render change indicator for a given time period
  const renderChangeIndicator = (period: ChangeType) => {
    if (!enabledIntervals.includes(period)) return null
    if (period === 'w' && !hasWeeklyData) return null

    const changeData = getChangeData(period)
    if (!changeData) return null

    const { changePercent, isPositive } = changeData

    return (
      <div
        key={period}
        className={cn(
          "flex items-center font-semibold text-sm rounded-sm px-[1px]",
          getChangeTextColor(changePercent, isPositive),
          getChangeBackgroundClass(changePercent, isPositive),
          getChangeBorderClass(changePercent, isPositive)
        )}
      >
        {Math.abs(changePercent) > setNeutralMagnitude && (
          <span className="font-bold text-base tracking-wide tabular-nums">
            {!showMinusSign ? Math.abs(Math.round(changePercent)) : Math.round(changePercent)}{showPercentSign ? "%" : ""}
          </span>
        )}
        {showDeltaSymbols ? (
          <span className={cn("flex flex-col items-center leading-none", getChangeTextColor(changePercent, isPositive))}>
            {changePercent >= 0 ? (
              <>
                <span className="text-[10px]">▲</span>
                <span className="text-xs">{period}</span>
              </>
            ) : (
              <>
                <span className="text-xs">{period}</span>
                <span className="text-[10px]">▼</span>
              </>
            )}
          </span>
        ) : (
          <ChangeIcon letter={period} direction={getChangeDirection(changePercent)} isPositive={isPositive} />
        )}
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={handleClick}
            className="flex items-center font-medium gap-0 px-3 cursor-pointer hover:bg-muted/50 transition-colors text-sm"
          >
            {showIcon && (
              <Image
                src={getStockLogoUrl(data.symbol) || "/placeholder.svg"}
                alt={data.symbol}
                width={24}
                height={24}
                className="rounded-sm  pr-[1px]"
                unoptimized
              />
            )}
            {showSymbol && (
              <span className="font-semibold text-foreground/80">{data.symbol}</span>
            )}
            {showName && (
              <span className="font-medium text-foreground ml-[2px] mr-1">{cleanCompanyName(data.name)}</span>
            )}
            {showPrice && (
              <span className="font-mono text-foreground/90">
                ${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
            {timePeriodsOrder.map(period => renderChangeIndicator(period as ChangeType))}
            <span className="text-muted-foreground/50">|</span>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="p-3 bg-popover text-popover-foreground"
        >
          <div className="space-y-2">
            <div className="font-semibold text-sm">{data.name}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Price:</span>
              <span className="font-mono">${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-muted-foreground">Daily Change:</span>
              <span className={cn("font-mono", isDailyPositive ? "text-emerald-500" : "text-red-500")}>
                {isDailyPositive ? "+" : ""}{data.change.toFixed(2)} ({data.changePercent.toFixed(2)}%)
              </span>
              {hasWeeklyData && (
                <>
                  <span className="text-muted-foreground">Weekly Change:</span>
                  <span className={cn("font-mono", isWeeklyPositive ? "text-emerald-500" : "text-red-500")}>
                    {isWeeklyPositive ? "+" : ""}{data.weeklyChange?.toFixed(2)} ({data.weeklyChangePercent?.toFixed(0)}%)
                  </span>
                </>
              )}
              <span className="text-muted-foreground">Monthly Change:</span>
              <span className={cn("font-mono", isMonthlyPositive ? "text-emerald-500" : "text-red-500")}>
                {isMonthlyPositive ? "+" : ""}{data.monthlyChange.toFixed(2)} ({data.monthlyChangePercent.toFixed(0)}%)
              </span>
              <span className="text-muted-foreground">Yearly Change:</span>
              <span className={cn("font-mono", isYearlyPositive ? "text-emerald-500" : "text-red-500")}>
                {isYearlyPositive ? "+" : ""}{data.yearlyChange.toFixed(2)} ({data.yearlyChangePercent.toFixed(0)}%)
              </span>
              <span className="text-muted-foreground">High:</span>
              <span className="font-mono">${data.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-muted-foreground">Low:</span>
              <span className="font-mono">${data.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-muted-foreground">Type:</span>
              <Badge variant="outline" className="w-fit text-xs capitalize">
                {data.type}
              </Badge>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
