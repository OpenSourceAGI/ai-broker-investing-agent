"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "@/lib/auth/client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, LogIn } from "lucide-react"

import { OverviewTab } from "@/components/investing/tabs/overview-tab"
import { AgentsTab } from "@/components/investing/tabs/agents-tab"
import { AlpacaTradingTab } from "@/components/investing/tabs/alpaca-trading-tab"
import { UnifiedOrdersTab } from "@/components/investing/tabs/unified-orders-tab"
import { LeadersTab } from "@/components/investing/tabs/leaders-tab"
import { RiskPortfolioTab } from "@/components/investing/tabs/risk-portfolio-tab"

/**
 * Tabs of the dashboard. The active one is mirrored into `?tab=` so a view is
 * shareable and the sidebar can deep-link into it.
 */
const TABS = [
  { value: "overview", label: "Overview" },
  { value: "agents", label: "Research Agents" },
  { value: "trading", label: "Trading" },
  { value: "orders", label: "Orders" },
  { value: "leaders", label: "Copy Leaders" },
  { value: "risk", label: "Risk" },
] as const

function DashboardContent() {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview")

  // Sync tab with URL
  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab) {
      setActiveTab(tab)
    }
  }, [searchParams])

  // Update URL when tab changes, preserving existing query params (like symbol)
  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab)
    const currentParams = new URLSearchParams(searchParams.toString())
    currentParams.set("tab", newTab)
    router.push(`/dashboard?${currentParams.toString()}`, { scroll: false })
  }

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="p-8 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Loading...</h2>
          <p className="text-sm text-muted-foreground">Please wait</p>
        </Card>
      </div>
    )
  }

  // Show login screen if not authenticated
  if (!session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="p-8 max-w-md text-center">
          <div className="mb-6">
            <LogIn className="h-16 w-16 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Welcome to Your Dashboard</h2>
            <p className="text-muted-foreground">
              Sign in to see your portfolio, agents, and open orders in one place
            </p>
          </div>

          <Button className="w-full" size="lg" onClick={() => router.push("/login")}>
            <LogIn className="mr-2 h-5 w-5" />
            Sign In to Continue
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex w-full flex-wrap justify-start">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="agents" className="space-y-6 mt-6">
          <AgentsTab />
        </TabsContent>
        <TabsContent value="trading" className="space-y-6 mt-6">
          <AlpacaTradingTab />
        </TabsContent>
        <TabsContent value="orders" className="space-y-6 mt-6">
          <UnifiedOrdersTab />
        </TabsContent>
        <TabsContent value="leaders" className="space-y-6 mt-6">
          <LeadersTab />
        </TabsContent>
        <TabsContent value="risk" className="space-y-6 mt-6">
          <RiskPortfolioTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Card className="p-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Loading...</h2>
            <p className="text-sm text-muted-foreground">Please wait</p>
          </Card>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}
