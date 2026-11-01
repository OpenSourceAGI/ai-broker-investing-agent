"use client"

import { Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SettingsPanel, settingsNavItems } from "@/components/settings/settings-dialog"

/**
 * Settings, full page. `?section=` names the open section (a
 * `settingsNavItems` value, e.g. `/settings?section=qwksearch`), so a section
 * can be linked to and survives a reload.
 */
function SettingsPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requested = searchParams.get("section")
  const section = settingsNavItems.some((item) => item.value === requested) ? requested! : "general"

  return (
    <SettingsPanel
      fullPage
      initialSection={section}
      onSectionChange={(next) => router.replace(`${pathname}?section=${next}`, { scroll: false })}
    />
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-8">Loading...</div>}>
      <SettingsPageContent />
    </Suspense>
  )
}
