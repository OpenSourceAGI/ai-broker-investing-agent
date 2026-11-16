"use client"

/**
 * Per-stock backtesting: one picker over every strategy in the
 * packages/investing catalog (built-in indicators and ported third-party
 * bots), shared cost settings, and a result row per strategy. Strategies that
 * cannot run on stocks stay listed with the reason. All trading logic runs
 * server-side in packages/investing via /api/backtest-technical.
 */
import React, { useEffect, useMemo, useRef, useState } from "react"
import { Activity, AlertTriangle, PlayCircle, TrendingUp, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { createLatestRequest } from "@/lib/latest-request"
import { readApiResponse } from "@/lib/read-api-response"

export interface ChartTradeSignal {
  date: string
  time: number
  action: "BUY" | "SELL"
  price: number
}

interface CostModel {
  feeBps: number
  slippageBps: number
  positionSizePct: number
}

interface StrategyParam {
  id: string
  label: string
  default: number
  min: number
  max: number
  step?: number
}

interface CatalogEntry {
  id: string
  name: string
  description: string
  provider: "builtin" | "third-party"
  source?: { repo: string; file: string; license: string }
  minBars: number
  params: StrategyParam[]
  availability: { available: true } | { available: false; reason: string; message: string }
}

interface Trade {
  side: "BUY" | "SELL"
  date: string
  price: number
  shares: number
  fee: number
}

type StrategyRunResult =
  | {
      strategyId: string
      name: string
      status: "ok"
      metrics: {
        finalValue: number
        totalReturn: number
        totalReturnPercent: number
        totalTrades: number
        winRate: number
        maxDrawdownPercent: number
        sharpeRatio: number | null
        trades: Trade[]
      }
      latestSignal: { action: "BUY" | "SELL" | "HOLD"; date: string | null }
    }
  | { strategyId: string; name: string; status: "unavailable"; reason: string; message: string }
  | { strategyId: string; name: string; status: "failed"; error: string }

interface RunSummary {
  symbol: string
  startDate: string
  endDate: string
  initialCapital: number
  costs: CostModel
  dataSource: "demo" | "yahoo"
  barCount: number
  results: StrategyRunResult[]
}

type Limits = Record<keyof CostModel, { min: number; max: number }>

const COST_FIELDS: { key: keyof CostModel; label: string; step: number }[] = [
  { key: "feeBps", label: "Fee (bps per fill)", step: 1 },
  { key: "slippageBps", label: "Slippage (bps per fill)", step: 1 },
  { key: "positionSizePct", label: "Position size (% of cash)", step: 5 },
]

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function toChartSignals(trades: Trade[]): ChartTradeSignal[] {
  return trades.map((t) => ({
    date: t.date,
    time: Math.floor(Date.parse(`${t.date}T00:00:00Z`) / 1000),
    action: t.side,
    price: t.price,
  }))
}

interface BacktestPanelProps {
  symbol: string
  /** Called with a strategy's fills when the user picks a result row. */
  onShowSignals?: (signals: ChartTradeSignal[]) => void
}

export function BacktestPanel({ symbol, onShowSignals }: BacktestPanelProps) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [limits, setLimits] = useState<Limits | null>(null)
  const [demoSymbols, setDemoSymbols] = useState<string[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const [startDate, setStartDate] = useState("2022-01-03")
  const [endDate, setEndDate] = useState("2024-12-31")
  const [initialCapital, setInitialCapital] = useState(100_000)
  const [costs, setCosts] = useState<CostModel>({ feeBps: 5, slippageBps: 5, positionSizePct: 100 })
  const [demo, setDemo] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [params, setParams] = useState<Record<string, Record<string, number>>>({})

  const [running, setRunning] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [shownId, setShownId] = useState<string | null>(null)
  const requests = useRef(createLatestRequest())

  useEffect(() => {
    let cancelled = false
    fetch("/api/backtest-technical")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (cancelled) return
        setCatalog(data.strategies)
        setLimits(data.costs.limits)
        setCosts(data.costs.defaults)
        setDemoSymbols(data.demoSymbols)
      })
      .catch((e: Error) => !cancelled && setCatalogError(`Could not load strategies: ${e.message}`))
    return () => {
      cancelled = true
    }
  }, [])

  // A new symbol invalidates the previous results, any run still in flight,
  // and the chart markers.
  useEffect(() => {
    requests.current.invalidate()
    setRunning(null)
    setError(null)
    setSummary(null)
    setShownId(null)
    onShowSignals?.([])
  }, [symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  const availableIds = useMemo(() => catalog.filter((s) => s.availability.available).map((s) => s.id), [catalog])
  const sortedCatalog = useMemo(
    () =>
      [...catalog].sort(
        (a, b) =>
          Number(b.availability.available) - Number(a.availability.available) ||
          (a.provider === b.provider ? a.name.localeCompare(b.name) : a.provider === "third-party" ? -1 : 1),
      ),
    [catalog],
  )

  const validationError = useMemo(() => {
    if (!startDate || !endDate) return "Pick a start and end date."
    if (startDate > endDate) return "The start date must be on or before the end date."
    if (!(initialCapital > 0)) return "Initial capital must be greater than 0."
    if (limits) {
      for (const { key, label } of COST_FIELDS) {
        const v = costs[key]
        if (!Number.isFinite(v) || v < limits[key].min || v > limits[key].max) {
          return `${label} must be between ${limits[key].min} and ${limits[key].max}.`
        }
      }
    }
    if (demo && !demoSymbols.includes(symbol.toUpperCase())) {
      return `Demo data covers ${demoSymbols.join(", ")} only. Turn demo mode off for ${symbol}.`
    }
    return null
  }, [startDate, endDate, initialCapital, costs, limits, demo, demoSymbols, symbol])

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const run = async (strategyIds: string[] | "all") => {
    if (validationError) return setError(validationError)
    setError(null)
    setRunning(strategyIds === "all" ? catalog.length : strategyIds.length)
    setShownId(null)
    onShowSignals?.([])
    const id = requests.current.start()
    try {
      const res = await fetch("/api/backtest-technical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, startDate, endDate, initialCapital, costs, strategyIds, params, demo }),
      })
      const result = await readApiResponse<RunSummary>(res)
      if (!requests.current.isCurrent(id)) return
      if (!result.ok) throw new Error(result.error)
      setSummary(result.data)
    } catch (e) {
      if (!requests.current.isCurrent(id)) return
      setSummary(null)
      setError(e instanceof Error ? e.message : "Backtest failed")
    } finally {
      if (requests.current.isCurrent(id)) setRunning(null)
    }
  }

  const showTrades = (result: StrategyRunResult) => {
    if (result.status !== "ok") return
    setShownId(result.strategyId)
    onShowSignals?.(toChartSignals(result.metrics.trades))
  }

  const okCount = summary?.results.filter((r) => r.status === "ok").length ?? 0

  return (
    <div className="space-y-6">
      {/* Range and capital */}
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="bt-start">Start date</Label>
          <Input id="bt-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="bt-end">End date</Label>
          <Input id="bt-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="bt-capital">Initial capital ($)</Label>
          <Input
            id="bt-capital"
            type="number"
            min={1}
            value={initialCapital}
            onChange={(e) => setInitialCapital(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Shared assumptions */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="text-sm font-medium">Assumptions applied to every strategy</div>
        <div className="grid gap-4 md:grid-cols-4">
          {COST_FIELDS.map(({ key, label, step }) => (
            <div key={key}>
              <Label htmlFor={`bt-${key}`}>{label}</Label>
              <Input
                id={`bt-${key}`}
                type="number"
                step={step}
                min={limits?.[key].min}
                max={limits?.[key].max}
                value={costs[key]}
                onChange={(e) => setCosts({ ...costs, [key]: Number(e.target.value) })}
              />
            </div>
          ))}
          <div className="flex flex-col justify-end gap-2">
            <div className="flex items-center gap-2">
              <Switch id="bt-demo" checked={demo} onCheckedChange={setDemo} />
              <Label htmlFor="bt-demo">Demo data (offline)</Label>
            </div>
            <span className="text-xs text-muted-foreground">
              Recorded daily bars for {demoSymbols.join(", ") || "…"}, 2022–2024
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Long-only. Orders fill at the daily close, moved against you by slippage, and pay the fee on each buy and
          sell. Backtests never place real orders.
        </p>
      </div>

      {/* Strategy picker */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <Label>
            Strategies for {symbol} · {availableIds.length} of {catalog.length} can run on stocks
          </Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(availableIds)} disabled={!availableIds.length}>
              Select all available
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelected([])} disabled={!selected.length}>
              Clear
            </Button>
          </div>
        </div>
        {catalogError ? (
          <div className="rounded-lg border border-red-500/50 p-3 text-sm text-red-600 dark:text-red-400">{catalogError}</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 max-h-96 overflow-y-auto border rounded-lg p-3">
            {catalog.length === 0 && <div className="text-sm text-muted-foreground p-2">Loading strategies…</div>}
            {sortedCatalog.map((s) => {
              const available = s.availability.available
              const isSelected = selected.includes(s.id)
              return (
                <div
                  key={s.id}
                  className={`rounded-md p-2 ${available ? "" : "opacity-70"} ${isSelected ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id={`bt-strategy-${s.id}`}
                      checked={isSelected}
                      disabled={!available}
                      onCheckedChange={() => toggle(s.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`bt-strategy-${s.id}`} className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        {s.name}
                        {s.provider === "third-party" && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {s.source ? `Bot · ${s.source.repo}` : "Bot"}
                          </Badge>
                        )}
                      </label>
                      <p className="text-xs text-muted-foreground line-clamp-2" title={s.description}>
                        {s.description}
                      </p>
                      {!s.availability.available && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>Unavailable for stocks: {s.availability.message}</span>
                        </p>
                      )}
                      {isSelected &&
                        s.params.map((p) => (
                          <div key={p.id} className="mt-2 flex items-center gap-2">
                            <Label htmlFor={`bt-${s.id}-${p.id}`} className="text-xs font-normal">
                              {p.label}
                            </Label>
                            <Input
                              id={`bt-${s.id}-${p.id}`}
                              type="number"
                              className="h-7 w-24 text-xs"
                              min={p.min}
                              max={p.max}
                              step={p.step}
                              value={params[s.id]?.[p.id] ?? p.default}
                              onChange={(e) =>
                                setParams({ ...params, [s.id]: { ...params[s.id], [p.id]: Number(e.target.value) } })
                              }
                            />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {(error || validationError) && (
        <div className="p-3 border border-red-500/50 bg-red-50 dark:bg-red-950 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error || validationError}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="lg"
          onClick={() => run(selected)}
          disabled={running !== null || selected.length === 0 || !!validationError}
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          Run selected ({selected.length})
        </Button>
        <Button size="lg" onClick={() => run("all")} disabled={running !== null || !catalog.length || !!validationError}>
          <PlayCircle className="h-4 w-4 mr-2" />
          Backtest all strategies
        </Button>
      </div>

      {running !== null && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Activity className="h-4 w-4 animate-spin" />
          Running {running} strateg{running === 1 ? "y" : "ies"} on {symbol}…
        </div>
      )}

      {!summary && running === null && !error && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Pick strategies or backtest all of them. Strategies that can't run on stocks stay listed with the reason.
        </div>
      )}

      {summary && (
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold">Backtest results · {summary.symbol}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {summary.startDate} to {summary.endDate} · {summary.barCount} daily bars from{" "}
            {summary.dataSource === "demo" ? "recorded demo data" : "Yahoo Finance"} · ${money(summary.initialCapital)}{" "}
            · fee {summary.costs.feeBps} bps, slippage {summary.costs.slippageBps} bps, size{" "}
            {summary.costs.positionSizePct}% · {okCount} of {summary.results.length} ran
            {okCount > 0 && <span className="italic"> · click a result to plot its trades on the chart</span>}
          </p>
          <div className="space-y-2 max-h-[28rem] overflow-y-auto">
            {summary.results.map((r, index) => {
              if (r.status === "unavailable") {
                return (
                  <div key={r.strategyId} className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-medium">{r.name}</span>{" "}
                      <span className="text-muted-foreground">· not run: {r.message}</span>
                    </div>
                  </div>
                )
              }
              if (r.status === "failed") {
                return (
                  <div key={r.strategyId} className="flex items-start gap-2 p-3 rounded-lg border border-red-500/40 text-sm">
                    <XCircle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                    <div>
                      <span className="font-medium">{r.name}</span>{" "}
                      <span className="text-red-600 dark:text-red-400">· failed: {r.error}</span>
                    </div>
                  </div>
                )
              }
              const m = r.metrics
              const up = m.totalReturnPercent >= 0
              return (
                <button
                  type="button"
                  key={r.strategyId}
                  onClick={() => showTrades(r)}
                  className={`w-full text-left flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg transition-colors border-2 ${
                    shownId === r.strategyId
                      ? "bg-primary/10 border-primary"
                      : "bg-muted border-transparent hover:border-muted-foreground/20"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {index + 1}. {r.name}
                      </span>
                      <Badge variant={up ? "default" : "destructive"}>
                        {up ? "+" : ""}
                        {m.totalReturnPercent.toFixed(2)}%
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Trades {m.totalTrades} · win rate {m.winRate.toFixed(1)}% ·{" "}
                      {m.sharpeRatio === null ? "Sharpe n/a" : `Sharpe ${m.sharpeRatio.toFixed(2)}`} · max drawdown{" "}
                      {m.maxDrawdownPercent.toFixed(2)}% · latest signal {r.latestSignal.action}
                      {r.latestSignal.date ? ` (${r.latestSignal.date})` : ""}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <div className={`text-lg font-bold ${up ? "text-green-500" : "text-red-500"}`}>${money(m.finalValue)}</div>
                    <div className={`text-xs ${up ? "text-green-500" : "text-red-500"}`}>
                      {up ? "+" : "-"}${money(Math.abs(m.totalReturn))}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
