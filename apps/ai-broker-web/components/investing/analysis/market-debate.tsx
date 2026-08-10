"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Loader2, MessageSquare, ThumbsUp, ThumbsDown, AlertCircle, TrendingUp, Sparkles } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface DebateData {
  marketId: string
  question: string
  yesArguments: string[]
  noArguments: string[]
  yesSummary: string
  noSummary: string
  keyFactors: string[]
  uncertainties: string[]
  currentYesPrice: number
  currentNoPrice: number
  llmProvider?: string
  model?: string
}

interface MarketDebateProps {
  marketId: string
  question: string
  currentYesPrice: number
  currentNoPrice: number
}

export function MarketDebate({ marketId, question, currentYesPrice, currentNoPrice }: MarketDebateProps) {
  const [debate, setDebate] = useState<DebateData | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [isOpen, setIsOpen] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDebate = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/polymarket/debate?marketId=${marketId}`)
      const data = await response.json()

      if (data.success) {
        setDebate(data.debate)
        setIsOpen(true)
      } else {
        setError(data.error)
      }
    } catch (err) {
      console.error('Error fetching debate:', err)
      setError('Failed to load debate')
    } finally {
      setLoading(false)
    }
  }

  const generateDebate = async () => {
    try {
      setGenerating(true)
      setError(null)
      const response = await fetch('/api/polymarket/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketId }),
      })

      const data = await response.json()

      if (data.success) {
        setDebate(data.debate)
        setIsOpen(true)
      } else {
        setError(data.error)
      }
    } catch (err) {
      console.error('Error generating debate:', err)
      setError('Failed to generate debate')
    } finally {
      setGenerating(false)
    }
  }

  const handleToggle = async () => {
    if (!isOpen && !debate) {
      await fetchDebate()
    } else {
      setIsOpen(!isOpen)
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="space-y-2">
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between"
            onClick={handleToggle}
            disabled={loading}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Debate Analysis
              {debate && <Badge variant="secondary" className="ml-2">Loaded</Badge>}
            </span>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-4 mt-4">
          {error && !debate && (
            <Card className="p-4 border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">{error}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={generateDebate}
                    disabled={generating}
                  >
                    {generating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating Analysis...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate AI Analysis
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {!debate && !error && (
            <Card className="p-6 text-center">

              <Button onClick={generateDebate} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Analysis
                  </>
                )}
              </Button>
            </Card>
          )}

          {debate && (
            <div className="space-y-4">
              {/* Current Odds */}
              {/* <Card className="p-4 bg-muted/50">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-1">YES Odds</div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {(debate.currentYesPrice * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-1">NO Odds</div>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {(debate.currentNoPrice * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </Card> */}

              {/* YES Case */}
              <Card className="p-5 border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20">
                <div className="flex items-center gap-2 mb-3">
                  <ThumbsUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <h3 className="text-lg font-bold text-green-800 dark:text-green-200">
                    Case for YES
                  </h3>
                </div>

                <p className="text-sm text-green-700 dark:text-green-300 mb-4 leading-relaxed">
                  {debate.yesSummary}
                </p>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-green-800 dark:text-green-200 uppercase tracking-wide">
                    Key Arguments
                  </div>
                  <ul className="space-y-2">
                    {debate.yesArguments.map((arg, idx) => (
                      <li key={idx} className="flex gap-2 text-sm text-green-700 dark:text-green-300">
                        <span className="text-green-600 dark:text-green-400 font-bold flex-shrink-0">{idx + 1}.</span>
                        <span>{arg}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>

              {/* NO Case */}
              <Card className="p-5 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
                <div className="flex items-center gap-2 mb-3">
                  <ThumbsDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <h3 className="text-lg font-bold text-red-800 dark:text-red-200">
                    Case for NO
                  </h3>
                </div>

                <p className="text-sm text-red-700 dark:text-red-300 mb-4 leading-relaxed">
                  {debate.noSummary}
                </p>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-red-800 dark:text-red-200 uppercase tracking-wide">
                    Key Arguments
                  </div>
                  <ul className="space-y-2">
                    {debate.noArguments.map((arg, idx) => (
                      <li key={idx} className="flex gap-2 text-sm text-red-700 dark:text-red-300">
                        <span className="text-red-600 dark:text-red-400 font-bold flex-shrink-0">{idx + 1}.</span>
                        <span>{arg}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>

              <Separator />

              {/* Key Factors */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-bold">Key Determining Factors</h3>
                </div>
                <ul className="space-y-2">
                  {debate.keyFactors.map((factor, idx) => (
                    <li key={idx} className="flex gap-2 text-sm">
                      <span className="text-primary font-bold flex-shrink-0">•</span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Uncertainties */}
              <Card className="p-5 bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-bold">Major Uncertainties</h3>
                </div>
                <ul className="space-y-2">
                  {debate.uncertainties.map((uncertainty, idx) => (
                    <li key={idx} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="font-bold flex-shrink-0">•</span>
                      <span>{uncertainty}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Metadata */}
              {debate.llmProvider && (
                <div className="text-xs text-muted-foreground text-center">
                  Generated by {debate.model || debate.llmProvider}
                </div>
              )}

              {/* Regenerate Button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={generateDebate}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Regenerate Analysis
                  </>
                )}
              </Button>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
