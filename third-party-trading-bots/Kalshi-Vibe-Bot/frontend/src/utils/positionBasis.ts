/**
 * Cash “invested” for a leg (open or closed): contract notional at open plus ``fees_paid``.
 * Matches backend ``open_cash_basis_dollars`` — for a **closed** row, ``fees_paid`` should include Kalshi
 * buy + sell fees so invested = notional + round-trip fees (same basis as net realized P&amp;L on the API).
 * Legacy rows where ``entry_cost`` already includes buy fees are detected via ``entry_cost`` ≫ ``entry_price``×qty.
 */
export function positionCashInvestedUsd(params: {
  entry_cost?: number | null
  entry_price: number
  quantity: number
  fees_paid?: number | null
}): number {
  const ec = Math.max(0, Number(params.entry_cost) || 0)
  const ep = Math.max(0, Number(params.entry_price) || 0)
  const q = Math.max(0, Math.round(Number(params.quantity) || 0))
  const fp = Math.max(0, Number(params.fees_paid) || 0)
  const epLine = ep * q
  const notional = ec > 1e-12 ? ec : epLine
  if (fp <= 1e-12) return notional
  if (q <= 0) return notional + fp
  const tol = Math.max(1e-6, 1e-4 * Math.max(Math.abs(epLine), 1))
  if (notional <= epLine + tol) return notional + fp
  const embedded = notional - epLine
  const extraFees = Math.max(0, fp - embedded)
  return notional + extraFees
}

/** $/contract (0–1 from API) → Kalshi-style ¢ label (fractional when needed; whole cents omit “.00”). */
export function formatContractPriceCents(price: number | null | undefined): string {
  const x = Number(price)
  if (!Number.isFinite(x) || x <= 0) return '0¢'
  const cents = Math.round(x * 100 * 100) / 100
  const nearestWhole = Math.round(cents)
  if (Math.abs(cents - nearestWhole) < 1e-7) {
    return `${nearestWhole}¢`
  }
  let s = cents.toFixed(2)
  s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  return `${s}¢`
}
