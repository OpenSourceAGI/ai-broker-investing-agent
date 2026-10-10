"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "@/lib/auth/client"
import { consumeSurveyPrompt } from "@/lib/survey/prompt"

import { OverviewTab } from "@/components/investing/tabs/overview-tab"
import { RiskPortfolioTab } from "@/components/investing/tabs/risk-portfolio-tab"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, LogIn } from "lucide-react"

function PortfolioContent() {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const [isInitializing, setIsInitializing] = useState(false)

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

  // Initialize portfolio on first login (only for authenticated users)
  useEffect(() => {
    if (session?.user && !isPending) {
      initializePortfolio()
    }
  }, [session, isPending])

  // Show loading state
  if (isPending || isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="p-8 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {isInitializing ? 'Setting up your portfolio...' : 'Loading...'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isInitializing ? 'Initializing your $100,000 play money account' : 'Please wait'}
          </p>
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
            <h2 className="text-2xl font-bold mb-2">Welcome to Your Portfolio</h2>
            <p className="text-muted-foreground">
              Sign in to view your portfolio and track your investments
            </p>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={() => router.push('/login')}
            >
              <LogIn className="mr-2 h-5 w-5" />
              Sign In to Continue
            </Button>

            <p className="text-xs text-muted-foreground">
              New users automatically receive $100,000 in virtual trading capital
            </p>
          </div>
        </Card>
      </div>
    )
  }

  // Show portfolio for authenticated users
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="space-y-6 mt-6">
        <OverviewTab />
        <RiskPortfolioTab />
      </div>
    </div>
  )
}

export default function PortfolioPage() {
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
      <PortfolioContent />
    </Suspense>
  )
}
