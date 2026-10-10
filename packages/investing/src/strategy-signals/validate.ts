import type {
  AccountSnapshot,
  Instrument,
  NormalizedSignal,
  RejectedSignal,
  RiskLimits,
  RiskPosture,
  StrategySource
} from './types'

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x)
export const isQuantity = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.trim() === x
export const isUtcTime = (x: unknown): x is string =>
  typeof x === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x) &&
  Number.isFinite(Date.parse(x))
export function validateInstrument(x: unknown): string[] {
  if (!isRecord(x)) return ['instrument must be an object']
  if (x.type === 'equity') return text(x.symbol) ? [] : ['symbol required']
  if (x.type !== 'event' || !text(x.venue) || !text(x.marketId)) return ['invalid instrument']
  return x.outcome !== undefined && x.outcome !== 'YES' && x.outcome !== 'NO'
    ? ['invalid outcome']
    : []
}
export function matchesInstrument(a: Instrument, b: Instrument): boolean {
  if (a.type === 'equity') return b.type === 'equity' && a.symbol === b.symbol
  return (
    b.type === 'event' &&
    a.venue === b.venue &&
    a.marketId === b.marketId &&
    (!a.outcome || !b.outcome || a.outcome === b.outcome)
  )
}
export function validateSignal(x: unknown, expected?: Instrument): string[] {
  if (!isRecord(x)) return ['signal must be an object']
  const errors = validateInstrument(x.instrument)
  for (const key of ['sourceId', 'upstream', 'reasoning'])
    if (!text(x[key])) errors.push(`${key} must be trimmed nonempty text`)
  if (!['signal', 'recommendation', 'order', 'portfolio'].includes(String(x.kind)))
    errors.push('invalid kind')
  if (!['BUY', 'SELL', 'HOLD'].includes(String(x.action))) errors.push('invalid action')
  for (const key of ['confidence', 'probability'])
    if (
      (key === 'confidence' || x[key] !== undefined) &&
      (!finite(x[key]) || (x[key] as number) < 0 || (x[key] as number) > 1)
    )
      errors.push(`invalid ${key}`)
  if (!isUtcTime(x.asOf)) errors.push('asOf must be ISO UTC')
  const validInstrument = validateInstrument(x.instrument).length === 0
  const instrument = x.instrument as Instrument
  if (expected && validInstrument && !matchesInstrument(instrument, expected))
    errors.push('instrument mismatch')
  const price = (p: unknown) =>
    finite(p) && p >= 0 && (validInstrument && instrument.type === 'event' ? p <= 100 : true)
  if (x.sizing !== undefined) {
    if (!isRecord(x.sizing)) errors.push('invalid sizing')
    else {
      if (x.sizing.quantity !== undefined && !isQuantity(x.sizing.quantity))
        errors.push('invalid sizing quantity')
      if (x.sizing.limitPriceCents !== undefined && !price(x.sizing.limitPriceCents))
        errors.push('invalid sizing price')
      if (x.action === 'HOLD' && Number(x.sizing.quantity) > 0) errors.push('HOLD carries quantity')
    }
  }
  if (x.kind === 'order' || x.order !== undefined) {
    if (!isRecord(x.order)) errors.push('order required')
    else {
      const o = x.order
      if (
        !validInstrument ||
        instrument.type !== 'event' ||
        o.ticker !== instrument.marketId ||
        o.action !== x.action ||
        (instrument.outcome && o.outcome !== instrument.outcome)
      )
        errors.push('nested order mismatch')
      if (o.outcome !== 'YES' && o.outcome !== 'NO' && !(x.action === 'HOLD' && o.outcome === null))
        errors.push('invalid order outcome')
      if (
        !isQuantity(o.quantity) ||
        !price(o.priceCents) ||
        !text(o.reason) ||
        !isUtcTime(o.timestamp) ||
        o.timestamp !== x.asOf
      )
        errors.push('invalid order fields')
      if (x.action === 'HOLD' && Number(o.quantity) > 0) errors.push('HOLD carries order')
    }
  }
  if (x.kind === 'portfolio' || x.targets !== undefined) {
    if (!Array.isArray(x.targets) || !x.targets.length) errors.push('targets required')
    else {
      const keys = new Set<string>()
      for (const t of x.targets) {
        if (!isRecord(t)) {
          errors.push('invalid target')
          continue
        }
        if (
          !validInstrument ||
          instrument.type !== 'event' ||
          t.ticker !== instrument.marketId ||
          !['YES', 'NO'].includes(String(t.outcome)) ||
          !isQuantity(t.quantity) ||
          !price(t.priceCents)
        )
          errors.push('invalid target fields')
        const key = `${t.ticker}:${t.outcome}`
        if (keys.has(key)) errors.push('duplicate target')
        keys.add(key)
        if (x.action === 'HOLD' && Number(t.quantity) > 0) errors.push('HOLD carries target')
      }
    }
  }
  if (
    x.evidence !== undefined &&
    (!isRecord(x.evidence) ||
      Object.values(x.evidence).some(v => typeof v !== 'string' && !finite(v)))
  )
    errors.push('invalid evidence')
  return errors
}
export function validateLimits(x: unknown): string[] {
  return !isRecord(x) ||
    !isQuantity(x.maxPositionPerMarket) ||
    x.maxPositionPerMarket === 0 ||
    (x.maxOpenPositions !== undefined && !isQuantity(x.maxOpenPositions))
    ? ['invalid risk limits']
    : []
}
export function validatePosture(x: unknown): string[] {
  return !isRecord(x) ||
    !text(x.label) ||
    !finite(x.sizeMultiplier) ||
    x.sizeMultiplier < 0 ||
    x.sizeMultiplier > 1 ||
    typeof x.allowNewEntries !== 'boolean'
    ? ['invalid risk posture']
    : []
}
export function validateAccount(x: unknown): string[] {
  if (!isRecord(x)) return ['account required']
  if (x.kind === 'equity') {
    if (!isQuantity(x.cashCents) || !isRecord(x.shares)) return ['invalid equity account']
    return Object.entries(x.shares).some(
      ([key, v]) =>
        !text(key) ||
        !isRecord(v) ||
        !isQuantity(v.quantity) ||
        !finite(v.averagePriceCents) ||
        v.averagePriceCents < 0
    )
      ? ['invalid share holding']
      : []
  }
  if (
    x.kind !== 'event' ||
    !text(x.venue) ||
    !isRecord(x.portfolio) ||
    !isQuantity(x.portfolio.cashCents) ||
    !isRecord(x.portfolio.positions)
  )
    return ['invalid event account']
  // Average entry costs can be fractional after several integer-cent fills.
  return Object.entries(x.portfolio.positions).some(
    ([key, v]) =>
      !isRecord(v) ||
      !text(v.ticker) ||
      !['YES', 'NO'].includes(String(v.outcome)) ||
      key !== `${v.ticker}:${v.outcome}` ||
      !isQuantity(v.quantity) ||
      !finite(v.averageEntryPriceCents) ||
      v.averageEntryPriceCents < 0 ||
      v.averageEntryPriceCents > 100 ||
      !finite(v.markPriceCents) ||
      v.markPriceCents < 0 ||
      v.markPriceCents > 100
  )
    ? ['invalid contract holding']
    : []
}
export function partitionValidSignals(
  xs: unknown,
  expected: Instrument,
  evaluationTime: string,
  source?: Pick<StrategySource, 'id' | 'maxSignalAgeMs'>
): { valid: NormalizedSignal[]; rejected: RejectedSignal[] } {
  const valid: NormalizedSignal[] = [],
    rejected: RejectedSignal[] = []
  if (!Array.isArray(xs))
    return { valid, rejected: [{ input: xs, reasons: ['signals must be an array'] }] }
  for (const x of xs) {
    const reasons = validateSignal(x, expected)
    if (!isUtcTime(evaluationTime)) reasons.push('invalid evaluation time')
    if (!reasons.length) {
      const s = x as NormalizedSignal
      const age = Date.parse(evaluationTime) - Date.parse(s.asOf)
      if (source && s.sourceId !== source.id) reasons.push('source identity mismatch')
      if (age < 0) reasons.push('future signal')
      if (
        source?.maxSignalAgeMs !== undefined &&
        (!finite(source.maxSignalAgeMs) || source.maxSignalAgeMs < 0 || age > source.maxSignalAgeMs)
      )
        reasons.push('stale signal or invalid freshness limit')
    }
    if (reasons.length) rejected.push({ input: x, reasons })
    else valid.push(x as NormalizedSignal)
  }
  return { valid, rejected }
}
