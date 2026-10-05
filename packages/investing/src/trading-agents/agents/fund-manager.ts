/**
 * Fund Manager Agent
 * Final approval authority for all trading decisions
 */

import { AgentState } from '../types'
import type { LLMClient } from '../utils/llm-client'
import { parseFinalLine, wholeNumberToken } from '../utils/parse-final-line'
import { strategyPrompt } from '../utils/strategy-prompt'
import type { FundManagerApproval } from '../../strategy-signals/types'

export function parseFundManagerApproval(text: string, proposalId: string): FundManagerApproval {
  const id = parseFinalLine(text, 'PROPOSAL ID:', v => v === proposalId)
  const decision = parseFinalLine(text, 'DECISION:', ['APPROVE', 'REJECT', 'MODIFY'])
  const quantity = parseFinalLine(text, 'APPROVED QUANTITY:', wholeNumberToken)
  // A wrong proposal ID, a missing decision, or a missing quantity for APPROVE/MODIFY means REJECT.
  if (!id.value || !decision.value || (decision.value !== 'REJECT' && !quantity.value)) {
    return { decision: 'REJECT', proposalId }
  }
  return {
    decision: decision.value as FundManagerApproval['decision'],
    proposalId,
    ...(quantity.value ? { quantity: Number(quantity.value) } : {})
  }
}

export class FundManager {
  private llm: LLMClient

  constructor(llm: LLMClient) {
    this.llm = llm
  }

  /**
   * Review all analysis and make final approval decision
   */
  async makeDecision(state: AgentState): Promise<Partial<AgentState>> {
    if (state.proposal) {
      const proposal = state.proposal
      try {
        const intro = `You are the **Fund Manager** reviewing this exact proposal: ${JSON.stringify(proposal)}`
        const prompt =
          strategyPrompt(intro, state, 'the **Fund Manager**') +
          `\nProposal: ${JSON.stringify(proposal)}` +
          `\nDeterministic verdict: ${JSON.stringify(state.riskVerdict)}` +
          `\nJudge decision: ${JSON.stringify(state.judgeDecision)}` +
          `\nApprove only this proposal's action, within every cap. End with these lines:` +
          `\nPROPOSAL ID: ${proposal.proposalId}` +
          `\nDECISION: APPROVE|REJECT|MODIFY (one token)` +
          `\nAPPROVED QUANTITY: <whole number>`
        const response = await this.llm.invoke(prompt)
        const approval = parseFundManagerApproval(response.content, proposal.proposalId)
        return {
          fundManagerDecision: response.content,
          fundManagerApproval: approval,
          finalApproval: approval.decision,
          approvedPositionSize: approval.quantity?.toString() ?? null
        }
      } catch {
        return {
          fundManagerApproval: { decision: 'REJECT', proposalId: proposal.proposalId },
          finalApproval: 'REJECT',
          riskReviewReason: 'fund manager model error'
        }
      }
    }
    const {
      companyOfInterest,
      investmentDebateState,
      riskDebateState,
      traderInvestmentPlan,
      finalRiskAdjustedPlan
    } = state

    const prompt = `You are the **Fund Manager** with final approval authority for all trading decisions for **${companyOfInterest}**.

## INVESTMENT DEBATE OUTCOME
${investmentDebateState.judgeDecision}

## RISK MANAGEMENT ASSESSMENT
${riskDebateState.judgeDecision}

## TRADER'S RECOMMENDATION
${traderInvestmentPlan}

## RISK-ADJUSTED PLAN
${finalRiskAdjustedPlan}

## YOUR RESPONSIBILITY
As Fund Manager, you must:
1. Review all team recommendations and risk assessments
2. Ensure alignment with fund objectives and risk tolerance
3. Make the final GO/NO-GO decision
4. Specify exact execution parameters if approved

## DECISION FRAMEWORK
Consider:
- **Conviction Level**: How strong is the evidence across all teams?
- **Risk-Reward**: Does the setup justify the capital allocation?
- **Timing**: Is now the right time to enter this position?
- **Portfolio Fit**: How does this fit with current holdings?
- **Downside Protection**: Are risk controls adequate?

Provide your decision in this structured format:

### EXECUTIVE SUMMARY
[2-3 sentence high-level assessment]

### DECISION
**[APPROVE/REJECT/MODIFY]**

### RATIONALE
[Key factors influencing your decision]

### EXECUTION PARAMETERS (if APPROVE or MODIFY)
- Position Size: [% of portfolio or $ amount]
- Entry Strategy: [market order, limit order at $X, etc.]
- Stop Loss: [price level or % from entry]
- Target Exit: [price targets or conditions]
- Maximum Hold Period: [time limit if applicable]

### ADDITIONAL INSTRUCTIONS
[Any special instructions for execution or monitoring]

**Note**: Your decision is final. All trades must have your explicit approval.`

    const response = await this.llm.invoke(prompt)
    const content = response.content

    // Extract decision
    const decisionMatch = content.match(/DECISION[\s\S]*?\*\*\[(APPROVE|REJECT|MODIFY)\]\*\*/i)
    const decision = decisionMatch ? decisionMatch[1].toUpperCase() : 'REJECT'

    // Extract position size if approved
    let positionSize = null
    if (decision === 'APPROVE' || decision === 'MODIFY') {
      const positionMatch = content.match(/Position Size:[\s]*([^\n]+)/i)
      if (positionMatch) {
        positionSize = positionMatch[1].trim()
      }
    }

    return {
      fundManagerDecision: content,
      finalApproval: decision,
      approvedPositionSize: positionSize,
      finalTradeDecision: decision === 'APPROVE' || decision === 'MODIFY' ? 'BUY' : 'HOLD'
    }
  }
}
