'use client'

import { DebateAgentsAnalysis } from '@/components/investing/analysis/debate-agents-analysis'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function DebateAgentsPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Multi-Agent Debate Analysis</h1>
        <p className="text-muted-foreground mt-2">
          Advanced AI-powered stock analysis using specialized debate agents
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Market Analyst</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Analyzes technical indicators, price trends, and market liquidity
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Sentiment Analyst</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Evaluates social media sentiment and undiscovered opportunities
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">News Analyst</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Reviews recent events, catalysts, and jurisdiction risks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Fundamentals Analyst</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Examines financial metrics, valuation, and scoring
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Bull Researcher</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Advocates for BUY opportunities and growth potential
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Bear Researcher</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Identifies risks and potential thesis violations
            </p>
          </CardContent>
        </Card>
      </div>

      <DebateAgentsAnalysis />

      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
          <CardDescription>
            Multi-agent debate system for comprehensive stock analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">1. Analysis Team</h3>
            <p className="text-sm text-muted-foreground">
              Four specialized analysts examine different aspects: market technicals, sentiment,
              news events, and fundamental financials. Each provides independent analysis.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">2. Research Team</h3>
            <p className="text-sm text-muted-foreground">
              Bull and Bear researchers engage in structured debate, presenting opposing viewpoints.
              A Research Manager synthesizes arguments and ensures thesis compliance.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">3. Risk Assessment</h3>
            <p className="text-sm text-muted-foreground">
              Risky, Safe, and Neutral risk managers debate position sizing based on the analysis
              and company fundamentals.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">4. Final Decision</h3>
            <p className="text-sm text-muted-foreground">
              Portfolio Manager reviews all analyses and debates to make the final BUY, SELL, or
              HOLD recommendation with rationale.
            </p>
          </div>

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-2">Quick Mode vs Deep Mode</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>
                <strong>Quick Mode:</strong> Uses faster Gemini 2.0 Flash model for rapid analysis
                (recommended for most users)
              </li>
              <li>
                <strong>Deep Mode:</strong> Uses advanced Gemini 3.0 Pro with extended thinking for
                more thorough analysis
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
