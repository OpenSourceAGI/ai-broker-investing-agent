"use client"

import { Suspense, useEffect } from "react"
import { useSession } from "@/lib/auth/client"
import { consumeSurveyPrompt } from "@/lib/survey/prompt"

import { MarketScanner } from "@/components/investing/marketwatch/market-scanner"
import { Card } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

function MarketsContent() {
  const { data: session, isPending } = useSession()

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

  // Show dashboard for all users (authenticated or not)
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0 max-w-full overflow-x-hidden">
      <div className="space-y-6 mt-6">
        <MarketScanner />
      </div>
    </div>
  )
}

export default function MarketsPage() {
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
      <MarketsContent />
    </Suspense>
  )
}
