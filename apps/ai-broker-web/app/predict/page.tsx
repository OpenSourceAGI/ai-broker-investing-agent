"use client"

import { Suspense } from "react"
import { PredictionMarketsTab } from "@/components/investing/tabs/prediction-markets-tab"

function PredictContent() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="space-y-6 mt-6">
        <PredictionMarketsTab />
      </div>
    </div>
  )
}

export default function PredictPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PredictContent />
    </Suspense>
  )
}
