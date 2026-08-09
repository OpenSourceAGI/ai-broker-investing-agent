"use client"

import { useState } from "react"
import { useRouter } from 'next/navigation'
import Dock from "@/components/ui/dock"
import { DockContainer } from "./dock-container"
import { dockNavigationGroups } from "./dock-navigation"
import { SettingsDialog } from "@/components/settings/settings-dialog"

export function MobileDock() {
  const router = useRouter()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const dockItems = dockNavigationGroups.flatMap(group =>
    group.items.map(item => ({
      icon: item.icon,
      label: item.name,
      onClick: () => {
        if (item.isModal && item.name === "Settings") {
          setSettingsOpen(true)
        } else if (item.href) {
          router.push(item.href)
        }
      },
    }))
  )

  return (
    <>
      <DockContainer>
        <Dock items={dockItems} className="py-2" />
      </DockContainer>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </>
  )
}
