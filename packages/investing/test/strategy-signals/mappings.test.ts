import { it, expect, vi } from "vitest";
import { runAllStrategiesDemo } from "../../src/strategy-signals/demo";
import { yahooFinance } from "../../src/stocks/yahoo-finance-wrapper";
import * as search from "qwksearch-api-client";

vi.mock("qwksearch-api-client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  searchWeb: vi.fn(() => {
    throw new Error("unexpected search request");
  }),
}));
it("runs every folder contribution through the existing graph and mock execution", async () => {
  const fetch = vi.spyOn(globalThis, "fetch"),
    yahoo = vi.spyOn(yahooFinance, "getHistorical"),
    web = vi.mocked(search.searchWeb);
  try {
    const r = await runAllStrategiesDemo();
    expect(r.eventCases.map((c) => c.name)).toEqual([
      "vibe-yes",
      "vibe-no",
      "btc-bullish",
      "btc-bearish",
      "copy-trade-sizing",
      "pykalshi-mapping",
      "pmxt-mapping-synthetic-quotes",
    ]);
    expect(r.eventCases.every((c) => c.trace.fill?.status === "FILLED")).toBe(true);
    expect(r.eventCases[0].trace.fill?.fill).toMatchObject({ quantity: 9, priceCents: 55 });
    expect(r.eventCases[1].trace.fill?.intent.outcome).toBe("NO");
    expect(r.eventCases[2].trace.fill?.fill?.quantity).toBe(2);
    expect(r.eventCases[3].trace.fill?.intent.outcome).toBe("NO");
    for (const entry of r.eventCases.slice(-2))
      expect(entry.trace.after.kind === "event" && entry.trace.after.portfolio.cashCents).toBe(
        9835,
      );
    expect(r.stocks.map((t) => t.signal.action)).toEqual(["BUY", "SELL"]);
    expect(r.stocks.every((t) => t.fill?.status === "FILLED")).toBe(true);
    expect(r.stocks[1].after).toEqual({ kind: "equity", cashCents: 108200, shares: {} });
    expect(r.stocks[0].report).toContain("Advisory financial red flags");
    expect(r.defensive.fill?.fill?.quantity).toBe(5);
    expect(fetch).not.toHaveBeenCalled();
    expect(yahoo).not.toHaveBeenCalled();
    expect(web).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
    yahoo.mockRestore();
    web.mockClear();
  }
});
