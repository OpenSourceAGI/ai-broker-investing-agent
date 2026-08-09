"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { motion } from "framer-motion"

interface DockProps {
  className?: string
  items: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    onClick?: () => void
  }[]
}

export default function Dock({ items, className }: DockProps) {
  const [active, setActive] = React.useState<string | null>(null)
  const [hovered, setHovered] = React.useState<number | null>(null)

  return (
    <div className={cn("flex items-center justify-center w-full py-12", className)}>
      <motion.div
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className={cn(
          "flex items-end gap-4 px-4 py-3 rounded-3xl",
          "border bg-background/70 backdrop-blur-2xl shadow-lg",
          "md:[transform:perspective(600px)_rotateX(10deg)]" // arc layout illusion only on desktop
        )}
      >
        <TooltipProvider delayDuration={100}>
          {items.map((item, i) => {
            const isActive = active === item.label
            const isHovered = hovered === i

            return (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <motion.div
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    animate={{
                      scale: isHovered ? 1.2 : 1,
                      rotate: isHovered ? -5 : 0,
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="relative flex flex-col items-center gap-1"
                  >
                    {/* Label above icon - visible on mobile */}
                    <span className={cn(
                      "text-xs font-medium transition-colors md:hidden",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}>
                      {item.label}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "rounded-2xl relative",
                        "transition-colors",
                        isHovered && "shadow-lg shadow-primary/20"
                      )}
                      onClick={() => {
                        setActive(item.label)
                        item.onClick?.()
                      }}
                    >
                      <item.icon
                        className={cn(
                          "h-6 w-6 transition-colors",
                          isActive ? "text-primary" : "text-foreground"
                        )}
                      />
                      {/* Glowing ring effect */}
                      {isHovered && (
                        <motion.span
                          layoutId="glow"
                          className="absolute inset-0 rounded-2xl border border-primary/40"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        />
                      )}
                    </Button>

                    {/* Active indicator */}
                    {isActive && (
                      <motion.div
                        layoutId="dot"
                        className="w-1.5 h-1.5 rounded-full bg-primary mt-1 md:block hidden"
                      />
                    )}
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs hidden md:block">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </TooltipProvider>
      </motion.div>
    </div>
  )
}
