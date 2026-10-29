import { runSpreadAwareMomentumDemo } from './fixtures/spread-aware-momentum'

// The demo uses fixture quotes and scripted model responses throughout.
globalThis.fetch = async () => { throw new Error('network access is disabled in this demo') }
const results = await runSpreadAwareMomentumDemo()
console.log('Paper trading only. Synthetic quotes; scripted research and approvals. No credentials.')
console.table(results.map(result => ({
  scenario: result.name,
  originalBot: result.baseline,
  filtered: result.signals[0].action,
  score: result.signals[0].evidence?.score ?? '-',
  execution: result.fill?.status ?? 'NO ORDER',
  cashCents: result.after.kind === 'event' ? result.after.portfolio.cashCents : '-'
})))
for (const result of results) {
  console.log(`\n${result.name}: ${result.signals[0].reasoning}`)
  console.log(JSON.stringify({
    evidence: result.signals[0].evidence,
    stages: result.prompts.map(call => call.rule),
    proposal: result.proposal,
    risk: result.verdict,
    portfolioManager: result.fundManager,
    fill: result.fill,
    accountBefore: result.before,
    accountAfter: result.after
  }, null, 2))
}
