import { redirect } from "next/navigation"

/** Old settings URL from the vinext template; settings live at `/settings`. */
export default function DashboardSettingsPage() {
  redirect("/settings")
}
