"use client"

import { cn } from "@/lib/utils"

interface DockContainerProps {
  children: React.ReactNode
  className?: string
}

export function DockContainer({ children, className }: DockContainerProps) {
  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/80 backdrop-blur-sm border-t",
        className
      )}
    >
      {children}
    </div>
  )
}
