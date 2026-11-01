"use client"

import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
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
  const isAdminPage = pathname.startsWith("/admin")
  const isHomepage = pathname === "/"
  const isResearchPage = pathname === "/research" || pathname.startsWith("/research/")

  if (isAdminPage) {
    // The admin area brings its own nav and needs the full width for wide
    // tables; the app sidebar, stock ticker and mobile dock are not part of it.
    return (
      <>
        {children}
        <Toaster position="top-right" />
      </>
    )
  }

  if (isResearchPage) {
    // The research agent (research-agent-ui) brings its own files sidebar
    // inside the page, so keep AI Broker's app sidebar as the outer nav,
    // collapsed to its icon rail so the workspace keeps the width. On phones
    // the agent's own bottom bar holds the message box, which the mobile dock
    // would cover, so the app sidebar opens from a menu button instead.
    return (
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <SidebarInset className="md:pb-0 min-w-0 overflow-x-hidden">
          {children}
        </SidebarInset>
        <SidebarTrigger
          aria-label="Open AI Broker menu"
          className="fixed left-11 top-2 z-50 bg-background/80 backdrop-blur md:hidden"
        />
        <Toaster position="top-right" />
      </SidebarProvider>
    )
  }

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
