import { TradingAgentsGraph } from "../../src/trading-agents/graph/trading-graph";
import { demoLLM, syntheticMarket } from "../../src/strategy-signals/demo";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import type {
  NormalizedSignal,
  ExecutionApproval,
  RiskPosture,
} from "../../src/strategy-signals/types";

export const time = "2026-01-01T00:00:10Z";
export const market = syntheticMarket("FIXTURE", 50);
export function signal(overrides: Partial<NormalizedSignal> = {}): NormalizedSignal {
  return {
    sourceId: "fixture",
    upstream: "reviewed fixture",
    kind: "signal",
    instrument: { type: "event", venue: "kalshi", marketId: "FIXTURE", outcome: "YES" },
    action: "BUY",
    confidence: 0.8,
    reasoning: "reviewed fixture",
    asOf: time,
    sizing: { quantity: 10, limitPriceCents: 50 },
    ...overrides,
  };
}
export function approval(overrides: Partial<ExecutionApproval> = {}): ExecutionApproval {
  const proposal = {
    proposalId: "fixture-id",
    sourceId: "fixture",
    instrument: signal().instrument,
    action: "BUY" as const,
    outcome: "YES" as const,
    limitPriceCents: 50,
    quantity: 10,
    asOf: time,
  };
  return {
    proposal,
    finalQuantity: 10,
    verdict: { allowed: true, maxQuantity: 10, reasons: [], limits: { maxPositionPerMarket: 50 } },
    judge: { kind: "PROCEED" },
    fundManager: { decision: "APPROVE", proposalId: proposal.proposalId, quantity: 10 },
    reasons: [],
    ...overrides,
  };
}
export async function graphRun(
  options: {
    signals?: NormalizedSignal[];
    judge?: string;
    fm?: string;
    cash?: number;
    posture?: RiskPosture;
    action?: string;
    modelError?: boolean;
    fundError?: boolean;
    unregistered?: boolean;
  } = {},
) {
  const venue = new MockVenue("kalshi", [market], options.cash ?? 10000);
  const llm = demoLLM(options.action ?? "BUY", options.judge ?? "PROCEED");
  const invoke = llm.invoke.bind(llm);
  llm.invoke = async (input) => {
    const text = typeof input === "string" ? input : JSON.stringify(input);
    if (options.fundError && text.includes("the **Fund Manager**"))
      throw new Error("fixture manager failure");
    if (text.includes("the **Fund Manager**") && options.fm)
      return { content: options.fm.replaceAll("<id>", text.match(/"proposalId":"([^"]+)"/)![1]) };
    if (options.modelError && text.includes("a Risk Judge"))
      throw new Error("fixture model failure");
    return invoke(input);
  };
  const graph = new TradingAgentsGraph(["market", "news"], false, undefined, {
    riskReview: true,
    llm: { deep: llm, quick: llm },
    riskLimits: { maxPositionPerMarket: 50 },
    riskPosture: options.posture,
  });
  const signals = options.signals ?? [signal()];
  const sources = Object.fromEntries(
    signals.map((s) => [s.sourceId, { id: s.sourceId, upstream: s.upstream, run: () => [] }]),
  );
  const result = await graph.propagate("FIXTURE", "2026-01-01", {
    instrument: signal().instrument,
    strategySignals: signals,
    account: venue.snapshot(),
    event: market,
    evaluationTime: time,
    sources: options.unregistered ? undefined : sources,
  });
  return { ...result, venue, llm };
}
