"use client"

import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { MobileDock } from "@/components/layout/mobile-dock"
import { StockTicker } from "@/components/investing/stock-ticker"

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Homepage should be full width without sidebar
  const isHomepage = pathname === "/"

  if (isHomepage) {
    return (
      <>
        <StockTicker fixed="top" />
        {children}
      </>
    )
  }

  // All other pages get the sidebar layout
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="pb-24 md:pb-0 w-full overflow-x-hidden">
        <StockTicker fixed="top" />
        {children}
      </SidebarInset>
      <MobileDock />
    </SidebarProvider>
  )
}
