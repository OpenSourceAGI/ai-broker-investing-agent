"use client"

import { Suspense } from "react"

import { CopyTradingTab } from "@/components/investing/tabs/copy-trading-tab"

function LeadersContent() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="space-y-6 mt-6">
        <CopyTradingTab />
      </div>
    </div>
  )
}

export default function LeadersPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LeadersContent />
    </Suspense>
  )
}
