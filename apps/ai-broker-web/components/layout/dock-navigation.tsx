import {
  GraphChartIcon,
  PredictCheckboxesIcon,
  MarketScreenerIcon,
  CopyTradeIcon,
  IndicatorsIcon,
  SettingsIcon
} from "@/components/icons"

export interface DockNavigationItem {
  name: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  isModal?: boolean
}

export interface DockNavigationGroup {
  title: string
  items: DockNavigationItem[]
}

export const dockNavigationGroups: DockNavigationGroup[] = [
  {
    title: "Trade",
    items: [
      { name: "Stocks", href: "/stock", icon: GraphChartIcon },
      { name: "Predict", href: "/predict", icon: PredictCheckboxesIcon },
    ],
  },
  {
    title: "Signal",
    items: [
      { name: "Watch", href: "/markets", icon: MarketScreenerIcon },
      { name: "Copy", href: "/leaders", icon: CopyTradeIcon },
    ],
  },
  {
    title: "Portfolio",
    items: [
      { name: "Portfolio", href: "/portfolio", icon: IndicatorsIcon },
      { name: "Settings", icon: SettingsIcon, isModal: true },
    ],
  },
]
