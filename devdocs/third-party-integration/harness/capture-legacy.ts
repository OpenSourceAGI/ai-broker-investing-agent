import { TradingAgentsGraph } from '../../../packages/investing/src/trading-agents/graph/trading-graph'

// Run only before prompt edits; the saved files are fixed regression references.
const prompts: string[] = []
const client = {
  async invoke(input: unknown) {
    prompts.push(typeof input === 'string' ? input : JSON.stringify(input, null, 2))
    const text = prompts.at(-1)!
    return { content: text.includes('Bull Analyst advocating') ? 'Recorded bull case.'
      : text.includes('Bear Analyst advocating') ? 'Recorded bear case.'
      : text.includes('Investment Judge tasked') ? 'FINAL DECISION: INVEST'
      : 'FINAL TRANSACTION PROPOSAL: BUY' }
  }
}
const graph = new TradingAgentsGraph([], false)
// Capture the unmodified graph through its existing clients, without providers.
for (const name of ['bullResearcher', 'bearResearcher', 'investmentJudge', 'trader']) (graph as any)[name].llm = client
await graph.propagate('FIXTURE', '2026-01-01')
for (let i=0; i<prompts.length; i++) await Bun.write(`/results/legacy-prompts/${String(i).padStart(2, '0')}.txt`, prompts[i])
console.log(`Recorded ${prompts.length} legacy prompts`)
