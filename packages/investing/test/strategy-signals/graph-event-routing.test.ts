import { it, expect, vi } from "vitest";
import { MarketAnalyst } from "../../src/trading-agents/agents/market-analyst";
import { NewsAnalyst } from "../../src/trading-agents/agents/news-analyst";
import { graphRun } from "./helpers";
import { yahooFinance } from "../../src/stocks/yahoo-finance-wrapper";
import * as search from "qwksearch-api-client";

vi.mock("qwksearch-api-client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  searchWeb: vi.fn(() => {
    throw new Error("unexpected search request");
  }),
}));

it("routes events without either external analyst and uses event prompts", async () => {
  const m = vi.spyOn(MarketAnalyst.prototype, "analyze"),
    n = vi.spyOn(NewsAnalyst.prototype, "analyze"),
    fetch = vi.spyOn(globalThis, "fetch"),
    yahoo = vi.spyOn(yahooFinance, "getHistorical"),
    web = vi.mocked(search.searchWeb);
  try {
    const r = await graphRun();
    expect(m).not.toHaveBeenCalled();
    expect(n).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(yahoo).not.toHaveBeenCalled();
    expect(web).not.toHaveBeenCalled();
    for (const { prompt } of r.llm.calls) {
      expect(prompt).toContain("Will the fixture event occur?");
      expect(prompt).toContain("P(YES)");
      expect(prompt).not.toMatch(
        /revenue projections|company.*growth|stock is overvalued|Valuation Concerns/i,
      );
    }
  } finally {
    m.mockRestore();
    n.mockRestore();
    fetch.mockRestore();
    yahoo.mockRestore();
    web.mockClear();
  }
});
