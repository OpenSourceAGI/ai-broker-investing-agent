import React, { useCallback, useState } from 'react'
import { apiClient, AiProvider, aiProviderDisplayName } from '../api'
import { AiProviderLogo } from './AiProviderLogo'
import { useDashboardDataCache } from '../context/DashboardDataCache'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Landmark as VaultIcon,
  Briefcase,
  ScrollText,
  CircleDollarSign,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react'

interface StatSublineRow {
  text: string
  alert?: 'warning' | 'error'
  title?: string
}

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
  topContent?: React.ReactNode
  /** Stacked muted rows under the main value (e.g. total balance health + xAI prepaid). */
  sublineRows?: StatSublineRow[]
  subtext?: string
  /** Full-width row at the bottom of the tile (e.g. current AI provider). */
  footer?: React.ReactNode
}

/** Dense layout so portfolio tiles fit one row on large screens. */
const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  color,
  topContent,
  sublineRows,
  subtext,
  footer,
}) => (
  <div className="ui-surface-sm min-w-0 p-3 transition hover:border-white/35 sm:p-3.5 lg:p-3 xl:p-3.5">
    <div className="flex items-start justify-between gap-2 min-w-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <p className="text-white text-[11px] sm:text-xs font-medium leading-tight truncate min-w-0">
            {title}
          </p>
          {topContent ? <div className="-mt-0.5 shrink-0">{topContent}</div> : null}
        </div>
        <p className={`text-lg sm:text-xl lg:text-xl xl:text-2xl font-bold leading-tight tabular-nums truncate ${color}`}>
          {value}
        </p>
        {sublineRows?.map((row, i) => (
          <p
            key={`${row.text}-${i}`}
            className={`text-[10px] sm:text-[11px] text-white tabular-nums flex items-center gap-1.5 min-w-0 ${
              i === 0 ? 'mt-2' : 'mt-1'
            }`}
            title={row.title}
          >
            {row.alert === 'warning' && (
              <AlertTriangle
                className="w-3.5 h-3.5 shrink-0 text-amber-400"
                aria-hidden
              />
            )}
            {row.alert === 'error' && (
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" aria-hidden />
            )}
            <span className="truncate">{row.text}</span>
          </p>
        ))}
        {subtext && (
          <p className="text-[10px] sm:text-[11px] text-white mt-1 leading-snug line-clamp-2">
            {subtext}
          </p>
        )}
      </div>
      <div className="text-white shrink-0 [&_svg]:w-5 [&_svg]:h-5 lg:[&_svg]:w-5 lg:[&_svg]:h-5 xl:[&_svg]:w-6 xl:[&_svg]:h-6">
        {icon}
      </div>
    </div>
    {footer ? <div className="mt-2 pt-2 border-t border-white/10 min-w-0">{footer}</div> : null}
  </div>
)

interface PortfolioOverviewProps {
  tradingMode?: 'paper' | 'live'
}

export const PortfolioOverview: React.FC<PortfolioOverviewProps> = ({ tradingMode = 'paper' }) => {
  const { portfolio, setPortfolio, setPositions, setPositionAnalysesByMarketId } = useDashboardDataCache()
  const loading = portfolio === null
  const [cancelling, setCancelling] = useState(false)
  const [transferring, setTransferring] = useState(false)

  const handleCancelResting = useCallback(async () => {
    if (
      !window.confirm(
        'Cancel every resting order on Kalshi? This frees collateral tied up in unfilled limits (including any you placed outside the bot).',
      )
    ) {
      return
    }
    setCancelling(true)
    try {
      const res = await apiClient.cancelKalshiRestingOrders()
      const failed = res.failed_order_ids?.length ?? 0
      alert(`Cancelled ${res.cancelled_count} order(s).${failed ? ` Failed: ${failed}.` : ''}`)
      const b = await apiClient.getDashboardBundle()
      setPortfolio(b.portfolio)
      setPositions(b.positions)
      setPositionAnalysesByMarketId(b.position_analyses ?? {})
    } catch (e) {
      console.error(e)
      alert('Failed to cancel resting orders.')
    } finally {
      setCancelling(false)
    }
  }, [setPortfolio, setPositions, setPositionAnalysesByMarketId])

  const doTransfer = useCallback(
    async (direction: 'to_vault' | 'to_cash', amount: number) => {
      if (transferring) return
      setTransferring(true)
      try {
        await apiClient.vaultTransfer(direction, amount)
        const b = await apiClient.getDashboardBundle()
        setPortfolio(b.portfolio)
        setPositions(b.positions)
        setPositionAnalysesByMarketId(b.position_analyses ?? {})
      } catch (e) {
        console.error(e)
        alert('Transfer failed.')
      } finally {
        setTransferring(false)
      }
    },
    [setPortfolio, setPositions, setPositionAnalysesByMarketId, transferring],
  )

  if (loading) {
    return <div className="text-white">Loading portfolio...</div>
  }

  if (!portfolio) {
    return <div className="text-red-500">Failed to load portfolio</div>
  }

  const safeNum = (v: unknown, fallback = 0) => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  const unrealized = safeNum(portfolio.unrealized_pnl)
  const realizedClosed = safeNum(portfolio.realized_pnl)
  const total = safeNum(portfolio.total_pnl)
  const unrealizedPositive = unrealized >= 0
  const realizedPositive = realizedClosed >= 0
  const totalPositive = total >= 0

  const vaultBalance = safeNum(portfolio.vault_balance, 0)

  const liveTok = portfolio.kalshi_resting_order_count !== undefined
  const restingN = portfolio.kalshi_resting_order_count ?? 0
  const reserveEst = portfolio.resting_buy_collateral_estimate_usd ?? 0

  const totalBal = safeNum(portfolio.total_value)

  const xaiUsd =
    portfolio.xai_prepaid_balance_usd != null && Number.isFinite(portfolio.xai_prepaid_balance_usd)
      ? Number(portfolio.xai_prepaid_balance_usd)
      : null
  let xaiSublineAlert: 'warning' | 'error' | undefined
  if (xaiUsd !== null) {
    if (xaiUsd < 1) xaiSublineAlert = 'error'
    else if (xaiUsd < 5) xaiSublineAlert = 'warning'
  }

  const totalBalanceSublines: StatSublineRow[] = []
  if (totalBal <= 0) {
    totalBalanceSublines.push({
      text: 'Zero total balance — search halted',
      alert: 'error',
      title:
        'Play mode: market scan is off until total balance is above $0 (matches banner label).',
    })
  } else if (totalBal < 5) {
    totalBalanceSublines.push({
      text: 'Total balance under $5 — search halted',
      alert: 'warning',
      title:
        'Play mode: market scan is off until total balance reaches at least $5 (matches banner label).',
    })
  }
  const activeProvider = String(portfolio.ai_provider || 'gemini').toLowerCase()
  const activeAiProvider: AiProvider = activeProvider === 'xai' ? 'xai' : 'gemini'
  if (xaiUsd !== null && activeProvider === 'xai') {
    totalBalanceSublines.push({
      text: `xAI prepaid $${xaiUsd.toFixed(2)}`,
      alert: xaiSublineAlert,
      title:
        'xAI prepaid remaining (this billing cycle). Server: XAI_TEAM_ID + XAI_MANAGEMENT_API_KEY.',
    })
  }

  const aiProviderLabel = aiProviderDisplayName(portfolio.ai_provider)
  const scanActive = portfolio.order_search_active === true
  const scanLabel =
    typeof portfolio.order_search_label === 'string' && portfolio.order_search_label.trim() !== ''
      ? portfolio.order_search_label
      : scanActive
        ? 'Active — searching for new positions'
        : 'Holding — scan off'

  const transferButtons = (
    label: string,
    opts: { direction: 'to_vault' | 'to_cash'; sourceUsd: number },
  ) => (
    <div className="flex justify-end">
      <div className="flex flex-col items-center gap-1">
        <p className="text-[10px] sm:text-[11px] text-white/85 leading-none text-center whitespace-nowrap">
          {label}
        </p>
        <div className="flex items-center justify-center gap-1.5">
          {[1, 10, 100].map((amt) => {
            const disabled = transferring || opts.sourceUsd + 1e-9 < amt
            return (
              <button
                key={amt}
                type="button"
                disabled={disabled}
                onClick={() => void doTransfer(opts.direction, amt)}
                className="h-7 px-2.5 rounded-full text-[11px] font-semibold text-white bg-white/10 border border-white/15 hover:bg-white/15 hover:border-white/25 transition disabled:opacity-40 disabled:hover:bg-white/10 disabled:hover:border-white/15 disabled:cursor-not-allowed"
              >
                +${amt}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div
        className="ui-surface-sm flex items-center gap-3 px-3 py-2.5 sm:px-4"
        title={`Whether the bot will pull open markets and run ${aiProviderLabel} analysis for new entries on the next scan tick.`}
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-md ${
            scanActive ? 'bg-emerald-400 shadow-emerald-500/40' : 'bg-red-500 shadow-red-600/35'
          }`}
          aria-hidden
        />
        <span
          className={`text-xs sm:text-sm font-medium leading-snug ${
            scanActive ? 'text-emerald-100/95' : 'text-red-200/95'
          }`}
        >
          {scanLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {/* Row 1 */}
        <StatCard
          title="Total Balance"
          value={`$${portfolio.total_value.toFixed(2)}`}
          icon={<DollarSign className="text-blue-500" />}
          color="text-white"
          sublineRows={totalBalanceSublines.length > 0 ? totalBalanceSublines : undefined}
        />
        <StatCard
          title="Unrealized P&L"
          value={`${unrealizedPositive ? '' : '-'}$${Math.abs(unrealized).toFixed(2)}`}
          icon={
            unrealizedPositive ? (
              <TrendingUp className="text-green-500" />
            ) : (
              <TrendingDown className="text-red-500" />
            )
          }
          color={unrealizedPositive ? 'text-green-500' : 'text-red-500'}
          subtext="Open legs vs cost basis — uses Kalshi last trade when present, else best bid (not sale proceeds)"
        />
        <StatCard
          title="Realized P&L"
          value={`${realizedPositive ? '' : '-'}$${Math.abs(realizedClosed).toFixed(2)}`}
          icon={<CircleDollarSign className="text-emerald-500" />}
          color={realizedPositive ? 'text-green-500' : 'text-red-500'}
          subtext="Net on closed rows (live: Kalshi-aligned)"
        />
        <StatCard
          title="Total P&L"
          value={`${totalPositive ? '' : '-'}$${Math.abs(total).toFixed(2)}`}
          icon={
            totalPositive ? (
              <TrendingUp className="text-green-500" />
            ) : (
              <TrendingDown className="text-red-500" />
            )
          }
          color={totalPositive ? 'text-green-500' : 'text-red-500'}
          subtext="Closed realized + open unrealized (positions)"
        />

        {/* Row 2 */}
        <StatCard
          title="Available Cash"
          value={`$${portfolio.balance.toFixed(2)}`}
          icon={<Wallet className="text-white" />}
          color="text-white"
          topContent={transferButtons('Transfer to Vault', {
            direction: 'to_vault',
            sourceUsd: safeNum(portfolio.balance, 0),
          })}
          subtext={
            liveTok && restingN > 0
              ? `${restingN} resting Kalshi order(s); ~$${reserveEst.toFixed(2)} est. in buy limits`
              : liveTok
                ? 'No resting Kalshi orders'
                : undefined
          }
        />
        <StatCard
          title="Vault"
          value={`$${vaultBalance.toFixed(2)}`}
          icon={<VaultIcon className="text-sky-400" />}
          color="text-white"
          topContent={transferButtons('Transfer to Cash', {
            direction: 'to_cash',
            sourceUsd: vaultBalance,
          })}
          subtext="Cash locked from trading"
        />
        <StatCard
          title="Total Invested"
          value={`$${portfolio.invested_amount.toFixed(2)}`}
          icon={<Briefcase className="text-amber-500" />}
          color="text-white"
        />
        <StatCard
          title="Open Positions"
          value={portfolio.positions}
          icon={<CircleDollarSign className="text-purple-500" />}
          color="text-white"
          footer={
            <div
              className="flex items-center gap-1.5 min-w-0"
              title={`Active analyzer: ${aiProviderDisplayName(activeAiProvider)}`}
            >
              <span className="text-[10px] sm:text-[11px] text-white/85 shrink-0">Current AI Analyzer:</span>
              <AiProviderLogo provider={activeAiProvider} className="h-6 w-6" />
            </div>
          }
        />
      </div>

      {tradingMode === 'live' && liveTok && restingN > 0 && (
        <div className="ui-surface-sm flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
          <ScrollText className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-sm text-white flex-1">
            Kalshi has <span className="text-white font-medium">{restingN}</span> resting order(s).
            The bot deducts ~$
            {reserveEst.toFixed(2)} estimated resting-buy collateral from reported cash when sizing new risk.
          </p>
          <button
            type="button"
            disabled={cancelling}
            onClick={() => void handleCancelResting()}
            className="shrink-0 px-3 py-1.5 text-sm rounded-md bg-amber-900/40 text-amber-200 border border-amber-800 hover:bg-amber-900/60 disabled:opacity-50"
          >
            {cancelling ? 'Cancelling…' : 'Cancel resting on Kalshi'}
          </button>
        </div>
      )}
    </div>
  )
}
