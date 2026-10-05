import type { StrategySource } from '../types'
import { isUtcTime } from '../validate'

export interface RedFlagsInput {
  symbol: string
  sector?: 'general' | 'technology' | 'banking' | 'utilities' | 'shipping'
  /** Percentage units, e.g. 500 means 500%, with dollar income and cash flow. */
  debtToEquityPercent?: number
  netIncome?: number
  freeCashFlow?: number
  interestCoverage?: number
}
/** Independent advisory scorer. No copied parser/code; no veto or SourceGuard. */
export const redFlagsSource: StrategySource<RedFlagsInput> = {
  id: 'red-flags',
  upstream: 'debate-agents/red_flag_detector.py (independent advisory implementation)',
  run(input, context) {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.symbol !== 'string' ||
      !input.symbol.trim() ||
      input.symbol !== input.symbol.trim() ||
      !isUtcTime(context.evaluationTime)
    )
      throw new Error('invalid red-flags input')
    const sector = input.sector ?? 'general'
    if (!['general', 'technology', 'banking', 'utilities', 'shipping'].includes(sector))
      throw new Error('invalid sector')
    for (const key of [
      'debtToEquityPercent',
      'netIncome',
      'freeCashFlow',
      'interestCoverage'
    ] as const) {
      if (input[key] !== undefined && !Number.isFinite(input[key]))
        throw new Error(`invalid red-flags ${key}`)
    }
    const flags: string[] = []
    const capitalIntensive = sector === 'utilities' || sector === 'shipping'
    if (sector !== 'banking') {
      if (
        input.debtToEquityPercent !== undefined &&
        input.debtToEquityPercent > (capitalIntensive ? 800 : 500)
      )
        flags.push('EXTREME_LEVERAGE')
      if (
        input.interestCoverage !== undefined &&
        input.debtToEquityPercent !== undefined &&
        input.interestCoverage < (capitalIntensive ? 1.5 : 2) &&
        input.debtToEquityPercent > (capitalIntensive ? 200 : 100)
      )
        flags.push('REFINANCING_RISK')
    }
    if (
      input.netIncome !== undefined &&
      input.freeCashFlow !== undefined &&
      input.netIncome > 0 &&
      input.freeCashFlow < -2 * input.netIncome
    )
      flags.push('EARNINGS_QUALITY')
    return [
      {
        sourceId: this.id,
        upstream: this.upstream,
        kind: 'recommendation',
        instrument: { type: 'equity', symbol: input.symbol },
        action: 'HOLD',
        confidence: 1,
        asOf: context.evaluationTime,
        reasoning: flags.length
          ? `Advisory financial red flags: ${flags.join(', ')}. Agents must assess them; they do not veto a trade.`
          : 'No advisory red flags found in the supplied metrics. Missing metrics do not establish financial health.',
        evidence: {
          flags: flags.join(','),
          flagCount: flags.length,
          sector,
          ...Object.fromEntries(
            Object.entries(input).filter(([, value]) => typeof value === 'number')
          )
        }
      }
    ]
  }
}
