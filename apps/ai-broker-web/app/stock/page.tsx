"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "@/lib/auth-client"

import { StrategiesTab } from "@/components/investing/tabs/strategies-tab"
import { Card } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

function StockContent() {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const [isInitializing, setIsInitializing] = useState(false)

  // Initialize portfolio on first login and check survey completion (only for authenticated users)
  useEffect(() => {
    const checkSurveyAndInitialize = async () => {
      if (session?.user && !isPending) {
        // Check if user has completed the survey
        try {
          const response = await fetch('/api/user/check-survey')
          const data = await response.json()

          if (!data.hasCompletedSurvey) {
            router.push("/survey")
            return
          }

          await initializePortfolio()
        } catch (error) {
          console.error("Error checking survey status:", error)
          // Continue with initialization if check fails
          await initializePortfolio()
        }
      }
    }

    checkSurveyAndInitialize()
  }, [session, isPending, router])

  const initializePortfolio = async () => {
    try {
      setIsInitializing(true)
      const response = await fetch('/api/user/portfolio/initialize', {
        method: 'POST',
      })

      if (!response.ok) {
        console.error('Failed to initialize portfolio')
      }
    } catch (error) {
      console.error('Error initializing portfolio:', error)
    } finally {
      setIsInitializing(false)
    }
  }

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
        <StrategiesTab />
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
