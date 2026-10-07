import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

globalThis.fetch = async () => { throw new Error("Network is forbidden in the paper build check"); };
const require = createRequire(import.meta.url);
const variants = [
  [await import("investing/prediction-markets"), await import("investing/trading-agents")],
  [require("investing/prediction-markets"), require("investing/trading-agents")],
];
const ticks = [50, 51, 52, 53, 58].map((yesPriceCents, index) => ({
  ticker: "DEMO", yesPriceCents, timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
}));
for (const [markets, agents] of variants) {
  const config = { llmProvider: "fixture", deepThinkLLM: "recorded", quickThinkLLM: "recorded", apiKeys: {} };
  const model = new agents.UnifiedLLMClient(config, "recorded");
  model.invoke = async (input) => {
    if (typeof input === "string" && input.includes("You are the **Fund Manager**")) {
      const id=input.match(/"proposalId":"([^"]+)"/)?.[1];
      assert.ok(id);
      return { content: `PROPOSAL ID: ${id}\nDECISION: APPROVE\nAPPROVED QUANTITY: 10` };
    }
    if (typeof input === "string" && input.includes("an Investment Judge")) {
      return { content: "Recorded fixture. FINAL DECISION: INVEST" };
    }
    if (typeof input === "string" && input.includes("a Risk Judge")) return { content: "RISK DECISION: PROCEED" };
    const text = typeof input === "string" ? input : input.map((message) => message.content).join("\n");
    const action = text.match(/"action"\s*:\s*"(BUY|SELL|HOLD)"/)?.[1];
    assert.ok(action, "Model fixture must receive the normalized intent");
    return { content: text.includes("a trading agent") ? `FINAL TRANSACTION PROPOSAL: ${action}` : `Recorded argument for ${action}` };
  };
  const graph = new agents.TradingAgentsGraph([], false, config, { llm: { deep: model, quick: model }, riskReview: true });
  const result = await markets.runKalshiMomentumPaperAgentWithResearch(
    { ticks },
    (intent, portfolio) => markets.reviewPredictionMarketIntent(graph, intent, portfolio, { fundManagerReview: true }),
  );
  assert.equal(graph.getCurrentState().finalApproval, "APPROVE");
  assert.equal(graph.getCurrentState().finalTradeDecision, "SELL");
  assert.ok(result.steps[3].researchSignal.reasoning.includes("DECISION: APPROVE"));
  assert.equal(result.portfolio.cashCents, 10_050);
  assert.equal(result.portfolio.realizedPnlCents, 50);
  assert.deepEqual(result.portfolio.positions, {});
  assert.deepEqual(result.steps.filter((step) => step.execution.status === "FILLED").map((step) => [
    step.execution.intent.action, step.execution.intent.outcome,
  ]), [["BUY", "YES"], ["SELL", "YES"]]);
}
assert.equal(
  readFileSync(new URL("../dist/prediction-markets/kalshi-momentum.LICENSE", import.meta.url), "utf8"),
  readFileSync(new URL("../../../third-party-trading-bots/kalshi-bot-api/LICENSE", import.meta.url), "utf8"),
);
console.log("Built ESM/CommonJS research → FundManager → paper replay and bundled MIT notice: PASS");
