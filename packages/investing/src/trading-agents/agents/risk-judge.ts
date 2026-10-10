import type { AgentState } from '../types'
import type { LLMClient } from '../utils/llm-client'
import type { JudgeDecision } from '../../strategy-signals/types'
import { parseFinalLine, wholeNumberToken } from '../utils/parse-final-line'
import { strategyPrompt } from '../utils/strategy-prompt'

export function parseJudgeDecision(text: string): { decision: JudgeDecision; reason?: string } {
  const result = parseFinalLine(
    text,
    'RISK DECISION:',
    v =>
      v === 'PROCEED' || v === 'BLOCK' || (v.startsWith('REDUCE ') && wholeNumberToken(v.slice(7)))
  )
  if (!result.value) return { decision: { kind: 'BLOCK' }, reason: result.reason }
  if (result.value.startsWith('REDUCE '))
    return { decision: { kind: 'REDUCE', maxQuantity: Number(result.value.slice(7)) } }
  return { decision: { kind: result.value as 'PROCEED' | 'BLOCK' } }
}
export class RiskJudge {
  constructor(private llm: LLMClient) {}
  async makeDecision(state: AgentState): Promise<Partial<AgentState>> {
    try {
      const prompt =
        strategyPrompt(
          `You are a Risk Judge reviewing this concrete proposal: ${JSON.stringify(state.proposal)}\nRisk debate: ${state.riskDebateState.history}`,
          state,
          'a Risk Judge'
        ) +
        '\nEnd with exactly RISK DECISION: PROCEED, RISK DECISION: BLOCK or RISK DECISION: REDUCE <whole number>.'
      const response = await this.llm.invoke(prompt),
        parsed = parseJudgeDecision(response.content)
      return {
        judgeDecision: parsed.decision,
        finalRiskAdjustedPlan: response.content,
        riskDebateState: { ...state.riskDebateState, judgeDecision: response.content },
        riskReviewReason: parsed.reason
      }
    } catch {
      return { judgeDecision: { kind: 'BLOCK' }, riskReviewReason: 'risk judge model error' }
    }
  }
}
