import { TradingAgentsGraph } from "../../src/trading-agents/graph/trading-graph.js";
import { UnifiedLLMClient, type LLMResponse } from "../../src/trading-agents/utils/llm-client.js";
import type { Message, TradingConfig } from "../../src/trading-agents/types/index.js";
import {
  reviewPredictionMarketIntent,
  runKalshiMomentumPaperAgentWithResearch,
  type KalshiMomentumAgentRequest,
} from "../../src/prediction-markets/index.js";

export const fixtureConfig: TradingConfig = {
  llmProvider: "fixture",
  deepThinkLLM: "recorded-momentum",
  quickThinkLLM: "recorded-momentum",
  apiKeys: {},
};

/** Recorded responses prove orchestration, not independent market research. */
export class RecordedMomentumLLM extends UnifiedLLMClient {
  constructor() { super(fixtureConfig, "recorded-momentum"); }

  override async invoke(input: string | Message[]): Promise<LLMResponse> {
    const prompt = typeof input === "string" ? input : input.map(message => message.content).join("\n");
    if (prompt.includes("the **Fund Manager**")) {
      const id = prompt.match(/"proposalId":"([^"]+)"/)?.[1];
      const quantity = prompt.match(/"quantity"\s*:\s*(\d+)/)?.[1];
      if (!id || !quantity) throw new Error("Recorded FundManager needs the original proposal");
      return { content: `Recorded final portfolio review.\nPROPOSAL ID: ${id}\nDECISION: APPROVE\nAPPROVED QUANTITY: ${quantity}` };
    }
    if (prompt.includes("a Risk Judge")) return { content: "RISK DECISION: PROCEED" };
    if (prompt.includes("an Investment Judge")) return { content: "FINAL DECISION: INVEST" };
    const action = prompt.match(/"action"\s*:\s*"(BUY|SELL|HOLD)"/)?.[1];
    if (!action) throw new Error("Recorded model needs normalized momentum research");
    if (prompt.includes("a trading agent")) return { content: `FINAL TRANSACTION PROPOSAL: ${action}` };
    return { content: `Recorded argument for ${action}; retain portfolio limits.` };
  }
}

export const momentumDemoTicks = [50, 51, 52, 53, 58].map((yesPriceCents, index) => ({
  ticker: "DEMO-KALSHI-MARKET",
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  yesPriceCents,
}));

export async function runKalshiMomentumResearchDemo(
  request: KalshiMomentumAgentRequest = { ticks: momentumDemoTicks, initialCashCents: 10_000 },
) {
  const model = new RecordedMomentumLLM();
  const graph = new TradingAgentsGraph([], false, fixtureConfig, {
    llm: { deep: model, quick: model },
    riskReview: true,
    riskLimits: { maxPositionPerMarket: request.config?.maxPosition ?? 50 },
  });
  return runKalshiMomentumPaperAgentWithResearch(request, (intent, portfolio) =>
    reviewPredictionMarketIntent(graph, intent, portfolio, { fundManagerReview: true }),
  );
}
