import Image from "next/image"

/**
 * Navigation icons, backed by the artwork in `public/icons`.
 *
 * Each export is a `ComponentType<{ className?: string }>` so it can be stored
 * in the nav item tables in `components/layout/*` and rendered with Tailwind
 * sizing classes (`w-6 h-6 shrink-0`), the same shape lucide-react icons have.
 */
interface IconProps {
  className?: string
}

function assetIcon(src: string, alt: string) {
  const Icon = ({ className }: IconProps) => (
    <Image src={src} alt={alt} width={24} height={24} className={className} />
  )
  Icon.displayName = alt.replace(/\s+/g, "") + "Icon"
  return Icon
}

export const GraphChartIcon = assetIcon("/icons/icon-graph-chart.svg", "Graph Chart")
export const PredictCheckboxesIcon = assetIcon(
  "/icons/icon-predict-checkboxes.svg",
  "Predict Checkboxes",
)
export const MarketScreenerIcon = assetIcon(
  "/icons/icon-market-screener.svg",
  "Market Screener",
)
export const CopyTradeIcon = assetIcon("/icons/icon-copy-trade.png", "Copy Trade")
export const IndicatorsIcon = assetIcon("/icons/icon-indicators.png", "Indicators")
export const SettingsIcon = assetIcon("/icons/icon-settings.svg", "Settings")
export const UserGuideIcon = assetIcon("/icons/icon-user-guide.svg", "User Guide")
