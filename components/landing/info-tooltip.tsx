"use client"

import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function InfoTooltip({
  children,
  className,
  iconClassName,
  label,
}: {
  children: React.ReactNode
  className?: string
  iconClassName?: string
  label?: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          className={cn(
            "inline-flex shrink-0 align-middle text-muted-foreground/70 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full",
            className,
          )}
        >
          {label ?? <Info className={cn("h-4 w-4", iconClassName)} />}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
