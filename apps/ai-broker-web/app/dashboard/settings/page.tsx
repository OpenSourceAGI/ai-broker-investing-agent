"use client"

import { useRouter } from "next/navigation"
import { SettingsDialog } from "@/components/settings/settings-dialog"

/**
 * `/dashboard/settings` route from the vinext template.
 *
 * The template shipped its own settings screen, but this app's
 * <SettingsDialog /> already covers every section it had (general, LLM
 * providers, brokers, data providers, teams, third-party sync) plus theme and
 * KYC. It accepts controlled open state, so the route renders it open and
 * returns to the dashboard when it is dismissed — one settings implementation
 * for both the sidebar entry point and this URL.
 */
export default function DashboardSettingsPage() {
  const router = useRouter()

  return (
    <SettingsDialog
      open
      onOpenChange={(open) => {
        if (!open) router.push("/dashboard")
      }}
    />
  )
}
