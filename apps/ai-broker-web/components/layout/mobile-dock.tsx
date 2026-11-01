"use client"

import { useRouter } from 'next/navigation'
import Dock from "@/components/ui/dock"
import { DockContainer } from "./dock-container"
import { dockNavigationGroups } from "./dock-navigation"

export function MobileDock() {
  const router = useRouter()

  const dockItems = dockNavigationGroups.flatMap(group =>
    group.items.map(item => ({
      icon: item.icon,
      label: item.name,
      onClick: () => {
        if (item.isModal && item.name === "Settings") {
          router.push("/settings")
        } else if (item.href) {
          router.push(item.href)
        }
      },
    }))
  )

  return (
    <DockContainer>
      <Dock items={dockItems} className="py-2" />
    </DockContainer>
  )
}
