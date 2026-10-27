import { afterEach, describe, expect, it, vi } from "vitest";
import { TradingAgentsGraph } from "../src/trading-agents/graph/trading-graph";
import { ScriptedLLMClient } from "../src/trading-agents/utils/scripted-llm";
import type { ScriptedRule } from "../src/trading-agents/utils/scripted-llm";
import { yahooFinance } from "../src/stocks/yahoo-finance-wrapper";

// News fetches must never hit the network; searchWeb throws unless a test
// arranges otherwise. Tests that do not select the news analyst are unaffected.
vi.mock("qwksearch-api-client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  searchWeb: vi.fn(() => {
    throw new Error("news backend offline");
  }),
}));

// A scripted LLM that routes by role phrase and, critically, lets the Trader
// attempt an actionable BUY. If the guard works, a required-data failure must
// still force HOLD despite this.
const buyingRules: ScriptedRule[] = [
  {
    name: "market",
    match: "trading assistant tasked with analyzing financial markets",
    response: "Technical read: constructive. Trend and momentum look supportive.",
  },
  { name: "news", match: "financial news analyst", response: "Headlines skew positive." },
  { name: "bull", match: "You are a Bull Analyst", response: "Bull: strong upside, buy." },
  { name: "bear", match: "You are a Bear Analyst", response: "Bear: minor risks only." },
  {
    name: "judge",
    match: "You are an Investment Judge",
    response: "Bull case wins. FINAL DECISION: INVEST",
  },
  {
    name: "trader",
    match: "You are a trading agent analyzing market data",
    response: "Conviction buy. FINAL TRANSACTION PROPOSAL: BUY",
  },
];

const scriptedBuyingLLM = () => {
  const llm = new ScriptedLLMClient(buyingRules);
  return { deep: llm, quick: llm };
};

const bars = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const close = 100 + Math.sin(i / 3) * 5 + i * 0.1;
    return {
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      adjClose: close,
      volume: 1_000_000 + i * 1000,
    };
  });

afterEach(() => vi.restoreAllMocks());

describe("equity recommendation fails closed when required market data cannot be fetched", () => {
  it("forces HOLD and records a typed failure when the market data fetch fails", async () => {
    const fetchSpy = vi
      .spyOn(yahooFinance, "getHistorical")
      .mockResolvedValue({ success: false, error: "yahoo upstream 503" } as never);

    const graph = new TradingAgentsGraph(["market"], false, undefined, {
      llm: scriptedBuyingLLM(),
    });
    const { state, signal } = await graph.propagate("AAPL", "2026-02-02");

    expect(fetchSpy).toHaveBeenCalled();
    // The Trader proposed BUY, but the required-data failure must override it.
    expect(signal.action).toBe("HOLD");
    expect(state.finalTradeDecision).toBe("HOLD");
    // The failure is represented as typed state, not only a report string.
    expect(state.dataFailures).toEqual([
      expect.objectContaining({ analyst: "market", required: true }),
    ]);
    // The response communicates the data failure in the existing structure.
    expect(state.marketReport).toContain("MARKET DATA UNAVAILABLE");
    expect(state.riskReviewReason).toContain("forced HOLD");
  });

  it("preserves an actionable BUY on the normal successful-data path", async () => {
    const fetchSpy = vi
      .spyOn(yahooFinance, "getHistorical")
      .mockResolvedValue({ success: true, data: bars(60) } as never);

    const graph = new TradingAgentsGraph(["market"], false, undefined, {
      llm: scriptedBuyingLLM(),
    });
    const { state, signal } = await graph.propagate("AAPL", "2026-02-02");

    expect(fetchSpy).toHaveBeenCalled();
    expect(signal.action).toBe("BUY");
    expect(state.finalTradeDecision).toBe("BUY");
    expect(state.dataFailures).toBeUndefined();
    expect(state.marketReport).not.toContain("UNAVAILABLE");
  });

  it("treats a news fetch failure as degraded but non-fatal when market data is healthy", async () => {
    vi.spyOn(yahooFinance, "getHistorical").mockResolvedValue({
      success: true,
      data: bars(60),
    } as never);

    const graph = new TradingAgentsGraph(["market", "news"], false, undefined, {
      llm: scriptedBuyingLLM(),
    });
    const { state, signal } = await graph.propagate("AAPL", "2026-02-02");

    // News is supplementary: its failure is recorded but does not block the trade.
    expect(signal.action).toBe("BUY");
    expect(state.newsReport).toContain("NEWS DATA UNAVAILABLE");
    expect(state.dataFailures).toEqual([
      expect.objectContaining({ analyst: "news", required: false }),
    ]);
    expect((state.dataFailures ?? []).some((f) => f.required)).toBe(false);
  });
});
