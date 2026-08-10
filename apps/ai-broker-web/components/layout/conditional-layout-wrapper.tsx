"use client"

import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { MobileDock } from "@/components/layout/mobile-dock"
import { StockTicker } from "@/components/investing/stock-ticker"
import { Toaster } from "sonner"

export function ConditionalLayoutWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isDocsPage = pathname.startsWith("/docs")
  const isHomepage = pathname === "/"

  if (isDocsPage) {
    // Docs pages use app sidebar + their own fumadocs layout
    return (
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <SidebarInset className="md:pb-0 overflow-x-hidden">
          {children}
        </SidebarInset>
        <Toaster position="top-right" />
      </SidebarProvider>
    )
  }

  // Other pages use the app sidebar; on desktop the homepage loads with it expanded
  return (
    <SidebarProvider defaultOpen={isHomepage}>
      <AppSidebar />
      <SidebarInset className="md:pb-0 overflow-x-hidden">
        <StockTicker fixed="top" />
        {children}
      </SidebarInset>
      <MobileDock />
      <Toaster position="top-right" />
    </SidebarProvider>
  )
}
