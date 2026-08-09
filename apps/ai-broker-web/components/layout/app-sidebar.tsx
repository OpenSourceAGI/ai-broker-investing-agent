"use client"

import * as React from "react"
import { Suspense } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { SettingsDialog } from "@/components/settings/settings-dialog"
import { SidebarSearch } from "./sidebar-search"
import { SidebarUserMenu } from "./sidebar-user-menu"
import {
  GraphChartIcon,
  PredictCheckboxesIcon,
  MarketScreenerIcon,
  CopyTradeIcon,
  IndicatorsIcon,
  SettingsIcon,
  UserGuideIcon,
} from "@/components/icons"

const navigationGroups = [
  {
    title: "Trade",
    items: [
      { name: "Analyze Strategy", href: "/stock", icon: GraphChartIcon },
      { name: "Prediction Markets", href: "/predict", icon: PredictCheckboxesIcon },
    ],
  },
  {
    title: "Signal",
    items: [
      { name: "Market Scanner", href: "/markets", icon: MarketScreenerIcon },
      { name: "Copy Trade Leaders", href: "/leaders", icon: CopyTradeIcon },
    ],
  },
  {
    title: "Risk & Portfolio",
    items: [
      { name: "Portfolio Management", href: "/portfolio", icon: IndicatorsIcon },
    ],
  },
]

function AppSidebarContent({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab') || 'overview'

  const isActive = (tab?: string, href?: string) => {
    if (href) return pathname === href
    if (tab) return pathname === '/dashboard' && currentTab === tab
    return false
  }

  const logoHref = pathname.startsWith('/docs') ? '/dashboard' : '/'

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pt-10">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={logoHref}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg text-sidebar-primary-foreground">
                  <Image
                    src="/apple-touch-icon.png"
                    alt="Logo"
                    width={48}
                    height={48}
                    className="size-4 object-contain"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">AI Broker</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSearch />
      </SidebarHeader>

      <SidebarContent>
        {navigationGroups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const IconComponent = item.icon
                  return (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(undefined, item.href)}
                        tooltip={item.name}
                      >
                        <Link href={item.href}>
                          <IconComponent className="w-6 h-6 shrink-0" />
                          <span className="group-data-[collapsible=icon]:hidden">{item.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SettingsDialog
                  trigger={
                    <SidebarMenuButton tooltip="Settings">
                      <SettingsIcon className="w-6 h-6 shrink-0" />
                      <span className="group-data-[collapsible=icon]:hidden">Settings</span>
                    </SidebarMenuButton>
                  }
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === '/docs'}
                  tooltip="Documentation"
                >
                  <Link href="/docs">
                    <UserGuideIcon className="w-6 h-6 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">Documentation</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Suspense fallback={<Sidebar collapsible="icon" {...props} />}>
      <AppSidebarContent {...props} />
    </Suspense>
  )
}
