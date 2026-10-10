"use client"

import { Suspense, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useSession } from "@/lib/auth/client"

import { StrategiesTab } from "@/components/investing/tabs/strategies-tab"
import { Card } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

function StockContent() {
  const { data: session, isPending } = useSession()
  const params = useParams()
  const symbol = params?.symbol as string | undefined
  const [isInitializing, setIsInitializing] = useState(false)

  // Initialize portfolio on first login (only for authenticated users)
  useEffect(() => {
    const initializePortfolio = async () => {
      if (session?.user && !isPending) {
        try {
          await fetch('/api/user/portfolio/initialize', {
            method: 'POST',
          })
        } catch (error) {
          console.error('Error initializing portfolio:', error)
        }
      }
    }

    initializePortfolio()
  }, [session, isPending])

  // Show loading state only when initializing for authenticated users
  if (session?.user && isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="p-8 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Setting up your portfolio...</h2>
          <p className="text-sm text-muted-foreground">
            Initializing your $100,000 play money account
          </p>
        </Card>
      </div>
    )
  }

  // Show dashboard for all users (authenticated or not)
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="space-y-6 mt-6">
        <StrategiesTab symbol={symbol} />
      </div>
    </div>
  )
}

export default function StockPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="p-8 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Loading...</h2>
          <p className="text-sm text-muted-foreground">Please wait</p>
        </Card>
      </div>
    }>
      <StockContent />
    </Suspense>
  )
}
