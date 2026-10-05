import { expect, it, vi } from "vitest";
import { fromOpenBBBars } from "../../src/strategy-signals/data/openbb-mapping";
import { FixtureDataProvider } from "../../src/strategy-signals/data/fixture-data-provider";
import { openBBTrendRows } from "../../src/strategy-signals/fixtures/openbb-data/bars";
import { hedgeFundTechnicalsSource } from "../../src/strategy-signals/sources/hedge-fund-technicals";
import { TradingAgentsGraph } from "../../src/trading-agents/graph/trading-graph";
import { demoLLM } from "../../src/strategy-signals/demo";
import { MockEquityBroker } from "../../src/strategy-signals/venues/mock-equity-broker";
import { toEquityOrder } from "../../src/strategy-signals/execution";
import golden from "./golden/openbb-data-null-volume.json";

it("maps the original Python historical-model output to the reviewed normalized row", () =>
  expect(fromOpenBBBars(golden.raw)).toEqual(golden.expected));

it("sorts rows, tracks null volume and preserves the volume absence in each bar", () => {
  const rows = openBBTrendRows("up").slice(0, 2);
  const mapped = fromOpenBBBars([{ ...rows[1], volume: null }, rows[0]]);
  expect(mapped.bars.map((b) => b.date)).toEqual(["2026-01-01", "2026-01-02"]);
  expect(mapped.missingVolume).toBe(1);
  expect(mapped.bars[1]?.volume).toBe(0);
  expect(
    hedgeFundTechnicalsSource.run(
      { symbol: "FIXTURE", bars: mapped.bars },
      { evaluationTime: "2026-06-10T00:00:00Z" },
    )[0]?.reasoning,
  ).toContain("refused");
});
it("rejects duplicates, invalid dates, non-finite prices and negative volume", () => {
  const row = openBBTrendRows("up")[0]!;
  for (const rows of [
    [row, row],
    [{ ...row, date: "2026-02-30" }],
    [{ ...row, high: Infinity }],
    [{ ...row, volume: -1 }],
    [null],
    null,
  ])
    expect(() => fromOpenBBBars(rows)).toThrow();
});
it("normalizes explicit offsets and naive model datetimes deterministically to UTC", () => {
  const row = openBBTrendRows("up")[0]!;
  expect(fromOpenBBBars([{ ...row, date: "2026-01-01T01:30:00+02:00" }]).bars[0]?.date).toBe(
    "2025-12-31",
  );
  expect(fromOpenBBBars([{ ...row, date: "2026-01-01T01:30:00" }]).bars[0]?.date).toBe(
    "2026-01-01",
  );
});
it("maps raw OpenBB data through the fixture provider and source into approved stock BUY and SELL fills, without network", async () => {
  const fetch = vi.spyOn(globalThis, "fetch"),
    broker = new MockEquityBroker({ FIXTURE: 100 }, 100000),
    evaluationTime = "2026-06-10T00:00:00Z";
  try {
    for (const direction of ["up", "down"] as const) {
      const mapped = fromOpenBBBars(openBBTrendRows(direction).reverse()),
        provider = new FixtureDataProvider({ FIXTURE: mapped.bars });
      const bars = await provider.getDailyBars("FIXTURE", "2026-01-01", "2026-06-10");
      const signal = hedgeFundTechnicalsSource.run(
        { symbol: "FIXTURE", bars, missingVolume: mapped.missingVolume, quantity: 2 },
        { evaluationTime, account: broker.snapshot() },
      )[0]!;
      const action = direction === "up" ? "BUY" : "SELL";
      expect(signal.action).toBe(action);
      const llm = demoLLM(action),
        graph = new TradingAgentsGraph([], false, undefined, {
          llm: { deep: llm, quick: llm },
          riskReview: true,
          riskLimits: { maxPositionPerMarket: 5 },
        });
      const result = await graph.propagate("FIXTURE", "2026-06-10", {
        instrument: signal.instrument,
        strategySignals: [signal],
        account: broker.snapshot(),
        evaluationTime,
        sources: { [hedgeFundTechnicalsSource.id]: hedgeFundTechnicalsSource },
      });
      expect(result.signal.action).toBe(action);
      const close = bars.at(-1)!.close;
      broker.setClose("FIXTURE", close);
      const order = toEquityOrder(result.state.approval!, close, broker.snapshot());
      expect(order.qty).toBe(2);
      expect((await broker.createOrder(order)).status).toBe("FILLED");
    }
    const snapshot = broker.snapshot();
    expect(snapshot.kind).toBe("equity");
    if (snapshot.kind === "equity") {
      expect(snapshot.shares).toEqual({});
      expect(snapshot.cashCents).toBe(108200);
    }
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
