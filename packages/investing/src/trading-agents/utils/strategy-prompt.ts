import type { AgentState } from '../types'

export type PromptRole =
  | 'a Bull Analyst'
  | 'a Bear Analyst'
  | 'an Investment Judge'
  | 'a trading agent'
  | 'a Risk-Seeking Analyst'
  | 'a Risk-Conservative Analyst'
  | 'a Neutral Risk Analyst'
  | 'a Risk Judge'
  | 'the **Fund Manager**'

/**
 * Each role keeps its own mandate in event prompts. A stance must not name
 * another role: scripted test clients route replies by role phrase.
 */
const EVENT_STANCES: Record<PromptRole, string> = {
  'a Bull Analyst':
    'Argue the strongest evidence-based case FOR taking the selected outcome, and rebut the latest opposing argument in the debate.',
  'a Bear Analyst':
    'Argue the strongest evidence-based case AGAINST taking the selected outcome: stress missing evidence, resolution risk and price risk, and rebut the latest supporting argument in the debate.',
  'an Investment Judge':
    'Weigh both sides of the debate and decide whether the evidence justifies taking the selected outcome.',
  'a trading agent':
    'Propose one concrete action for the selected outcome from the research plan and the evidence.',
  'a Risk-Seeking Analyst':
    'Argue for capturing the upside of this proposal within every hard limit, and challenge sizing that is more cautious than the evidence requires.',
  'a Risk-Conservative Analyst':
    'Argue for capital preservation: challenge any size, price or exposure that the evidence does not justify.',
  'a Neutral Risk Analyst':
    'Balance the aggressive and the conservative views into a proportionate position for this proposal.',
  'a Risk Judge':
    'Decide whether this exact proposal may proceed, must be reduced to a smaller whole number, or must be blocked.',
  'the **Fund Manager**':
    'Give the final decision on this exact proposal. Never exceed any cap, and never approve a different proposal.'
}

/** No additions for legacy callers; event variants avoid stock-specific instructions. */
export function strategyPrompt(legacy: string, state: AgentState, role: PromptRole): string {
  if (state.instrument?.type !== 'event') {
    const report = state.strategySignalsReport
      ? `\nThird-party strategy signals: ${state.strategySignalsReport}`
      : ''
    const proposal = state.proposal ? `\nSelected proposal: ${JSON.stringify(state.proposal)}` : ''
    return legacy + report + proposal
  }

  const market = state.eventMarket
  const outcome = state.proposal?.outcome ?? state.instrument.outcome
  const quote = market?.outcomes.find(o => o.side === outcome)
  return [
    `You are ${role} reviewing a binary event contract. Use the recorded evidence and debate; state missing information as absent.`,
    `Your stance: ${EVENT_STANCES[role]}`,
    `Market title: ${market?.title ?? 'absent'}`,
    `Question: ${market?.question ?? 'absent'}`,
    `Venue: ${state.instrument.venue}`,
    `Market: ${state.instrument.marketId}`,
    `Selected outcome: ${outcome ?? 'absent'} (${quote?.label ?? 'absent'}). YES means the question resolves affirmatively; NO means it does not. Forecast probability always means P(YES); P(NO) = 1 - P(YES).`,
    `Quote: ${quote ? JSON.stringify(quote) : 'absent'}`,
    `Closing time: ${market?.closesAt ?? 'absent'}`,
    `Fixture evidence: ${state.strategySignalsReport ?? 'absent'}`,
    `Investment debate: ${state.investmentDebateState.history}`,
    `Research Manager decision: ${state.investmentDebateState.judgeDecision}`,
    `Trader recommendation: ${state.traderInvestmentPlan}`,
    `Selected proposal: ${state.proposal ? JSON.stringify(state.proposal) : 'absent'}`,
    `Risk debate: ${state.riskDebateState.history}`
  ].join('\n')
}

export const EVENT_STANCE_TEXT: Readonly<Record<PromptRole, string>> = EVENT_STANCES
