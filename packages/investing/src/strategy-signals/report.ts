import type { StructuredReport } from '../trading-agents/types'
import type { NormalizedSignal, RejectedSignal } from './types'

export function toStructuredReport(
  valid: NormalizedSignal[],
  rejected: RejectedSignal[] = []
): StructuredReport {
  const sorted = [...valid].sort(
    (a, b) => a.sourceId.localeCompare(b.sourceId) || a.asOf.localeCompare(b.asOf)
  )
  const counts = { BUY: 0, SELL: 0, HOLD: 0 }
  for (const signal of sorted) counts[signal.action]++
  const mean = sorted.reduce((n, s) => n + s.confidence, 0) / (sorted.length || 1)
  return {
    summary: `BUY ${counts.BUY}, SELL ${counts.SELL}, HOLD ${counts.HOLD}; rejected ${rejected.length}`,
    findings: sorted.map(
      s => `${s.sourceId} ${s.asOf}: ${s.action} (${s.confidence}) — ${s.reasoning}`
    ),
    recommendations: Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([action]) => action),
    confidence: mean >= 0.75 ? 'High' : mean >= 0.5 ? 'Medium' : 'Low',
    data: {
      signals: sorted.map(s => ({
        sourceId: s.sourceId,
        probability: s.probability,
        evidence: s.evidence,
        order: s.order,
        targets: s.targets
      })),
      rejected
    }
  }
}
export function formatStructuredReport(report: StructuredReport): string {
  return `${report.summary}\n${report.findings.join('\n')}\nRecommendations: ${report.recommendations.join(', ')}\nConfidence: ${report.confidence}\nEvidence: ${JSON.stringify(report.data)}`
}
export function renderStrategySignalsReport(
  valid: NormalizedSignal[],
  rejected: RejectedSignal[] = []
): string {
  return valid.length || rejected.length
    ? formatStructuredReport(toStructuredReport(valid, rejected))
    : 'No third-party strategy signals.'
}
