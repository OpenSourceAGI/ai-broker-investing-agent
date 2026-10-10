import type { AgentState, StructuredReport, TradeSignal } from "../../trading-agents/types/index.js";
import type { AccountSnapshot, NormalizedSignal } from "../../strategy-signals/types.js";
import { kalshiMomentumSource } from "../../strategy-signals/sources/kalshi-momentum.js";
import { toPredictionMarketIntent } from "../../strategy-signals/execution.js";
import type { PaperPortfolioState, PredictionMarketTradeIntent } from "../types.js";

export function predictionMarketResearch(
  intent: PredictionMarketTradeIntent,
  portfolio: PaperPortfolioState,
): StructuredReport {
  return {
    summary: "Recorded binary-contract strategy research; prices and cash are cents.",
    findings: [
      intent.reason,
      `Strategy intent: ${intent.action} ${intent.outcome ?? ""} ${intent.quantity} contracts at ${intent.priceCents} cents.`,
      "SELL closes the named outcome; it does not buy the opposite outcome.",
    ],
    recommendations: [
      "Review the unchanged intent. A different action or quantity means HOLD for this replay.",
      "Paper cash, inventory and position limits remain authoritative.",
    ],
    data: { intent: { ...intent }, cashCents: portfolio.cashCents, positions: portfolio.positions, equityCents: portfolio.equityCents },
  };
}

/** Use the existing strategy-signal graph and typed approval; never create a replacement order. */
export async function reviewPredictionMarketIntent(
  graph: {
    propagate(
      market: string,
      date: string,
      run: {
        instrument: NormalizedSignal["instrument"];
        strategySignals: NormalizedSignal[];
        account: AccountSnapshot;
        evaluationTime: string;
        sources: Record<string, typeof kalshiMomentumSource>;
      },
    ): Promise<{ state: AgentState; signal: TradeSignal }>;
  },
  intent: PredictionMarketTradeIntent,
  portfolio: PaperPortfolioState,
  options?: { fundManagerReview?: boolean },
): Promise<TradeSignal> {
  const time = new Date(intent.timestamp).toISOString();
  const normalized: NormalizedSignal = {
    sourceId: kalshiMomentumSource.id,
    upstream: kalshiMomentumSource.upstream,
    kind: intent.action === "HOLD" ? "signal" : "order",
    instrument: { type: "event", venue: "kalshi", marketId: intent.ticker, ...(intent.outcome ? { outcome: intent.outcome } : {}) },
    action: intent.action,
    confidence: 0.75,
    reasoning: intent.reason,
    asOf: time,
    ...(intent.action !== "HOLD" ? { order: { ...intent, timestamp: time } } : {}),
    evidence: { research: JSON.stringify(predictionMarketResearch(intent, portfolio)) },
  };
  const { state, signal } = await graph.propagate(intent.ticker, time.slice(0, 10), {
    instrument: normalized.instrument,
    strategySignals: [normalized],
    account: { kind: "event", venue: "kalshi", portfolio },
    evaluationTime: time,
    sources: { [kalshiMomentumSource.id]: kalshiMomentumSource },
  });
  const result = {
    ...signal,
    reasoning: [
      state.investmentDebateState.judgeDecision,
      state.traderInvestmentPlan,
      state.finalRiskAdjustedPlan,
      state.fundManagerDecision,
      state.riskReviewReason,
    ].filter(Boolean).join("\n\n") || signal.reasoning,
  };
  const hold = (reason: string): TradeSignal => ({ ...result, action: "HOLD", reasoning: `${reason}\n\n${result.reasoning}` });
  if (intent.action === "BUY" && !/FINAL DECISION:\s*INVEST\s*$/i.test(state.investmentDebateState.judgeDecision)) {
    return hold("Investment judge did not approve entry");
  }
  if (options?.fundManagerReview || state.approval) {
    const approval = state.approval;
    if (!approval || approval.fundManager.decision !== "APPROVE") return hold("Missing explicit unchanged FundManager approval");
    try {
      const approved = toPredictionMarketIntent(approval);
      if (
        approved.action !== intent.action || approved.outcome !== intent.outcome ||
        approved.quantity !== intent.quantity || approved.priceCents !== intent.priceCents ||
        approved.ticker !== intent.ticker || Date.parse(approved.timestamp) !== Date.parse(intent.timestamp)
      ) {
        return hold("Approved proposal differs from the original intent");
      }
    } catch {
      return hold("Invalid execution approval");
    }
  }
  return result;
}
