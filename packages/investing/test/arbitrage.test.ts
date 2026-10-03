/**
 * @fileoverview Cross-venue arbitrage finder. The two LLM clients and the
 * Kalshi (DFlow) data layer are mocked and Polymarket's Gamma API is stubbed at
 * `fetch`, so the orchestration — URL parsing, price normalisation, query
 * generation and the analysis hand-off — runs for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callOpenAIResponses = vi.hoisted(() => vi.fn());
const callGrokResponses = vi.hoisted(() => vi.fn());
const dflowRequest = vi.hoisted(() => vi.fn());

vi.mock("../src/prediction-markets/ai/callOpenAI", () => ({ callOpenAIResponses }));
vi.mock("../src/prediction-markets/ai/callGrok", () => ({ callGrokResponses }));
vi.mock("../src/prediction-markets/data/kalshi", () => ({ dflowRequest }));

import { findArbitrage } from "../src/prediction-markets/arbitrage";

/** An LLM response carrying one assistant message with the given text pieces. */
const llm = (texts: string[], extra: Record<string, unknown> = {}) => ({
  model: "test-model",
  usage: { total_tokens: 123 },
  output: [
    { type: "reasoning", content: [] },
    { type: "message", content: texts.map((text) => ({ type: "output_text", text })) },
  ],
  ...extra,
});

const ANALYSIS = {
  isSameMarket: true,
  sameMarketConfidence: 0.9,
  marketComparisonReasoning: "same question",
  matchedMarket: { source: "kalshi", name: "Matched", yesPrice: 60, noPrice: 40 },
  arbitrage: { hasArbitrage: true, profitPercent: 5 },
  summary: "buy low sell high",
  risks: ["resolution mismatch"],
  recommendation: "do it",
};

let fetchMock: ReturnType<typeof vi.fn>;
const json = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

const gammaEvent = {
  title: "Will it rain?",
  slug: "will-it-rain",
  markets: [
    { question: "Rain tomorrow?", outcomePrices: '["0.42","0.58"]' },
    { title: "Rain Friday?", outcomePrices: "not json" },
    { question: "No prices" },
    { question: "" },
  ],
};

beforeEach(() => {
  callOpenAIResponses.mockReset();
  callGrokResponses.mockReset();
  dflowRequest.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("findArbitrage — input validation", () => {
  it("requires a url and a model", async () => {
    await expect(findArbitrage({ url: "", model: "gpt-5.1" })).rejects.toThrow("Missing required parameter: 'url'");
    await expect(findArbitrage({ url: "https://polymarket.com/event/x", model: "" })).rejects.toThrow(
      "Missing required parameter: 'model'",
    );
  });

  it("rejects URLs from unknown platforms", async () => {
    await expect(findArbitrage({ url: "https://example.com/event/x", model: "gpt-5.1" })).rejects.toThrow(
      "Invalid URL. Must be a Polymarket or Kalshi market URL.",
    );
  });

  it("rejects Polymarket URLs without an event slug", async () => {
    await expect(findArbitrage({ url: "https://polymarket.com/markets", model: "gpt-5.1" })).rejects.toThrow(
      "Could not extract event slug from Polymarket URL",
    );
    await expect(findArbitrage({ url: "not a url but polymarket.com", model: "gpt-5.1" })).rejects.toThrow(
      "Could not extract event slug",
    );
  });

  it("rejects Kalshi URLs without a ticker", async () => {
    await expect(findArbitrage({ url: "https://kalshi.com/browse", model: "gpt-5.1" })).rejects.toThrow(
      "Could not extract ticker from Kalshi URL",
    );
    await expect(findArbitrage({ url: "kalshi.com/no-scheme", model: "gpt-5.1" })).rejects.toThrow(
      "Could not extract ticker",
    );
  });

  it("fails when the source event cannot be fetched or has no markets", async () => {
    fetchMock.mockResolvedValueOnce(json({}, false, 404));
    await expect(findArbitrage({ url: "https://polymarket.com/event/x", model: "gpt-5.1" })).rejects.toThrow(
      "Could not fetch event data from polymarket",
    );

    fetchMock.mockResolvedValueOnce(json({ title: "Empty", markets: [] }));
    await expect(findArbitrage({ url: "https://polymarket.com/event/x", model: "gpt-5.1" })).rejects.toThrow(
      "Could not fetch event data from polymarket",
    );

    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(findArbitrage({ url: "https://polymarket.com/event/x", model: "gpt-5.1" })).rejects.toThrow(
      "Could not fetch event data",
    );

    dflowRequest.mockRejectedValueOnce(new Error("dflow down"));
    await expect(findArbitrage({ url: "https://kalshi.com/events/KX-1", model: "gpt-5.1" })).rejects.toThrow(
      "Could not fetch event data from kalshi",
    );
  });
});

describe("findArbitrage — Polymarket source, OpenAI model", () => {
  it("searches Kalshi with a 2-word query and returns the AI analysis", async () => {
    fetchMock.mockResolvedValueOnce(json(gammaEvent));
    callOpenAIResponses
      .mockResolvedValueOnce(llm(['"Rain forecast tomorrow"']))
      .mockResolvedValueOnce(llm([JSON.stringify(ANALYSIS).slice(0, 20), JSON.stringify(ANALYSIS).slice(20)], { model: "gpt-5.1-2026" }));
    dflowRequest.mockResolvedValueOnce({
      events: [
        {
          ticker: "KXRAIN",
          title: "Rain",
          markets: [
            { ticker: "KXRAIN-1", title: "Rain?", yesSubTitle: "Rain tomorrow", yesBid: "0.55", yesAsk: "0.65" },
            { ticker: "KXRAIN-2", title: "Ask only", yesAsk: "0.7" },
            { ticker: "KXRAIN-3", title: "Bid only", yesBid: "0.3" },
            { ticker: "KXRAIN-4", title: "", yesSubTitle: "" },
          ],
        },
        { ticker: "KXNONE", title: "No markets" },
      ],
    });

    const result = await findArbitrage({ url: "https://polymarket.com/event/will-it-rain/rain-tomorrow", model: "gpt-5.1" }, {
      openaiApiKey: "sk-openai",
      dflowApiKey: "dflow-key",
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://gamma-api.polymarket.com/events/slug/will-it-rain");
    // The query is stripped of quotes and cut to two words.
    expect(dflowRequest).toHaveBeenCalledWith("/search", {
      params: { q: "Rain forecast", event_status: "open", withNestedMarkets: true },
      apiKey: "dflow-key",
    });
    expect(callOpenAIResponses.mock.calls[0][2]).toBe("text");
    expect(callOpenAIResponses.mock.calls[0][5]).toEqual({ apiKey: "sk-openai" });
    expect(callOpenAIResponses.mock.calls[1][2]).toBe("json_object");
    expect(callGrokResponses).not.toHaveBeenCalled();

    expect(result.model).toBe("gpt-5.1-2026");
    expect(result.tokensUsed).toBe(123);
    expect(result.sourceMarket).toBe("polymarket");
    expect(result.searchedMarket).toBe("kalshi");
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);

    const a = result.analysis;
    expect(a).toMatchObject({
      isSameMarket: true,
      sameMarketConfidence: 0.9,
      arbitrage: { hasArbitrage: true, profitPercent: 5 },
      summary: "buy low sell high",
      risks: ["resolution mismatch"],
      recommendation: "do it",
    });
    // Source market: first market's price (0.42 → 42%), complement for NO.
    expect(a.polymarketData).toMatchObject({
      source: "polymarket",
      name: "Will it rain?",
      identifier: "will-it-rain",
      yesPrice: 42,
      noPrice: 58,
      url: "https://polymarket.com/event/will-it-rain",
    });
    expect(a.polymarketData!.rawData!.markets).toEqual([
      { title: "Rain tomorrow?", yesPrice: 42 },
      { title: "Rain Friday?", yesPrice: 50 }, // unparsable prices default to 50
      { title: "No prices", yesPrice: 50 },
    ]);
    // The other side comes from the model's matched market.
    expect(a.kalshiData).toEqual(ANALYSIS.matchedMarket);
  });

  it("passes the normalised Kalshi results to the analysis prompt", async () => {
    fetchMock.mockResolvedValueOnce(json(gammaEvent));
    callOpenAIResponses.mockResolvedValueOnce(llm(["rain"])).mockResolvedValueOnce(llm([JSON.stringify(ANALYSIS)]));
    dflowRequest.mockResolvedValueOnce({
      events: [
        {
          ticker: "KXRAIN",
          title: "Rain",
          markets: [
            { ticker: "a", title: "T1", yesSubTitle: "Both", yesBid: "0.2", yesAsk: "0.4" },
            { ticker: "b", title: "T2", yesAsk: "0.7" },
            { ticker: "c", title: "T3", yesBid: "0.3" },
            { ticker: "d", title: "T4" },
          ],
        },
      ],
    });
    await findArbitrage({ url: "https://polymarket.com/event/will-it-rain", model: "gpt-4.1" });

    const analysisPrompt = JSON.stringify(callOpenAIResponses.mock.calls[1].slice(0, 2));
    // mid of 20/40 = 30, ask-only 70, bid-only 30, none → 50
    for (const fragment of ["Both", "T2", "T3", "T4", "KXRAIN"]) expect(analysisPrompt).toContain(fragment);
  });
});

describe("findArbitrage — Kalshi source, Grok model", () => {
  const kalshiEvent = {
    ticker: "KXRAIN",
    title: "Rain event",
    markets: [
      { ticker: "KXRAIN-1", yesSubTitle: "Rain tomorrow", yesBid: "0.4", yesAsk: "0.6" },
      { ticker: "KXRAIN-2", yesSubTitle: "Ask only", yesBid: null, yesAsk: "0.7" },
      { ticker: "KXRAIN-3", yesSubTitle: "Bid only", yesBid: "0.2", yesAsk: null },
      { ticker: "KXRAIN-4", yesSubTitle: "", yesBid: null, yesAsk: null },
      { ticker: "KXRAIN-5", yesSubTitle: "No quote", yesBid: null, yesAsk: null },
    ],
  };

  it("fetches the event by ticker via DFlow and searches Polymarket", async () => {
    dflowRequest.mockResolvedValueOnce(kalshiEvent);
    callGrokResponses.mockResolvedValueOnce(llm(["rain weather"])).mockResolvedValueOnce(llm([JSON.stringify(ANALYSIS)]));
    fetchMock.mockResolvedValueOnce(
      json({
        events: [
          {
            slug: "rain-2026",
            markets: [{ question: "Rain?", outcomePrices: '["0.5","0.5"]' }, { title: "Bad", outcomePrices: "{" }, {}],
          },
          { slug: "no-markets" },
        ],
      }),
    );

    const result = await findArbitrage({ url: "https://kalshi.com/markets/kxrain/rain/kxrain-26", model: "grok-4" }, { xaiApiKey: "xai" });

    // Ticker comes from the last segment of a 4-part path, upper-cased.
    expect(dflowRequest).toHaveBeenNthCalledWith(1, "/event/KXRAIN-26", {
      params: { withNestedMarkets: true },
      apiKey: undefined,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://gamma-api.polymarket.com/public-search?q=rain%20weather&events_status=open",
    );
    expect(callGrokResponses.mock.calls[0][2]).toBe("text");
    expect(callGrokResponses.mock.calls[0][6]).toEqual({ apiKey: "xai" });
    expect(callOpenAIResponses).not.toHaveBeenCalled();

    expect(result.sourceMarket).toBe("kalshi");
    expect(result.searchedMarket).toBe("polymarket");
    const k = result.analysis.kalshiData!;
    expect(k).toMatchObject({
      source: "kalshi",
      name: "Rain event",
      identifier: "KXRAIN-26",
      yesPrice: 50, // mid of 0.4 / 0.6
      noPrice: 50,
      url: "https://kalshi.com/events/KXRAIN-26",
    });
    expect(k.rawData!.markets).toEqual([
      { title: "Rain tomorrow", yesPrice: 50 },
      { title: "Ask only", yesPrice: 70 },
      { title: "Bid only", yesPrice: 20 },
      { title: "No quote", yesPrice: 50 },
    ]);
    expect(result.analysis.polymarketData).toEqual(ANALYSIS.matchedMarket);
  });

  it("uses a /events/ URL's ticker as-is and falls back to the ticker for the title", async () => {
    dflowRequest.mockResolvedValueOnce({ ...kalshiEvent, title: undefined });
    callGrokResponses.mockResolvedValueOnce(llm(["x"]));
    fetchMock.mockResolvedValueOnce(json({ events: [] }));
    const result = await findArbitrage({ url: "https://kalshi.com/events/kxabc", model: "grok-4" });
    expect(dflowRequest.mock.calls[0][0]).toBe("/event/KXABC");
    expect(result.analysis.kalshiData!.name).toBe("KXABC");
  });
});

describe("findArbitrage — no counterpart found", () => {
  it("returns an explanatory non-arbitrage result without running the analysis", async () => {
    fetchMock.mockResolvedValueOnce(json(gammaEvent));
    callOpenAIResponses.mockResolvedValueOnce(llm(["obscure topic words"]));
    dflowRequest.mockResolvedValueOnce({ events: [] });

    const result = await findArbitrage({ url: "https://polymarket.com/event/will-it-rain", model: "gpt-5.2" });

    expect(callOpenAIResponses).toHaveBeenCalledTimes(1);
    expect(result.model).toBe("none");
    expect(result.analysis).toMatchObject({
      isSameMarket: false,
      sameMarketConfidence: 0,
      arbitrage: { hasArbitrage: false },
      risks: ["No matching market found on the other platform"],
    });
    expect(result.analysis.marketComparisonReasoning).toContain('query "obscure topic"');
    expect(result.analysis.polymarketData).toMatchObject({ source: "polymarket", yesPrice: 42 });
    expect(result.analysis.kalshiData).toBeUndefined();
  });

  it("treats search failures as empty results", async () => {
    // Kalshi search throws → []
    fetchMock.mockResolvedValueOnce(json(gammaEvent));
    callOpenAIResponses.mockResolvedValueOnce(llm(["q"]));
    dflowRequest.mockRejectedValueOnce(new Error("dflow"));
    let result = await findArbitrage({ url: "https://polymarket.com/event/will-it-rain", model: "gpt-5.1" });
    expect(result.model).toBe("none");

    // Polymarket search: non-OK status, then a thrown error → []
    dflowRequest.mockResolvedValueOnce({ ticker: "KX", title: "t", markets: [{ yesSubTitle: "m", yesBid: "0.5", yesAsk: "0.5" }] });
    callGrokResponses.mockResolvedValue(llm(["q"]));
    fetchMock.mockResolvedValueOnce(json({}, false, 500));
    result = await findArbitrage({ url: "https://kalshi.com/events/KX", model: "grok-4" });
    expect(result.model).toBe("none");

    dflowRequest.mockResolvedValueOnce({ ticker: "KX", title: "t", markets: [{ yesSubTitle: "m", yesBid: "0.5", yesAsk: "0.5" }] });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    result = await findArbitrage({ url: "https://kalshi.com/events/KX", model: "grok-4" });
    expect(result.model).toBe("none");
  });

  it("propagates a malformed analysis response", async () => {
    fetchMock.mockResolvedValueOnce(json(gammaEvent));
    callOpenAIResponses.mockResolvedValueOnce(llm(["q"])).mockResolvedValueOnce(llm(["not json"]));
    dflowRequest.mockResolvedValueOnce({ events: [{ ticker: "K", title: "t", markets: [{ ticker: "m", title: "M" }] }] });
    await expect(findArbitrage({ url: "https://polymarket.com/event/will-it-rain", model: "gpt-5.1" })).rejects.toThrow();
  });

  it("uses the event slug as its title when the API returns none, and the default 50¢ for an empty price list", async () => {
    fetchMock.mockResolvedValueOnce(json({ markets: [{ question: "Only market" }] }));
    callOpenAIResponses.mockResolvedValueOnce(llm(["q"]));
    dflowRequest.mockResolvedValueOnce({ events: [] });
    const result = await findArbitrage({ url: "https://polymarket.com/event/my-cool-event", model: "gpt-5.1" });
    expect(result.analysis.polymarketData).toMatchObject({ name: "my cool event", identifier: "my-cool-event", yesPrice: 50 });
  });
});

describe("model routing", () => {
  it.each(["gpt-5.2", "gpt-5-nano", "gpt-9-future", "gpt-4.1-mini"])("treats %s as an OpenAI model", async (model) => {
    fetchMock.mockResolvedValueOnce(json(gammaEvent));
    callOpenAIResponses.mockResolvedValueOnce(llm(["q"]));
    dflowRequest.mockResolvedValueOnce({ events: [] });
    await findArbitrage({ url: "https://polymarket.com/event/x", model });
    expect(callOpenAIResponses).toHaveBeenCalled();
    expect(callGrokResponses).not.toHaveBeenCalled();
  });

  it.each(["grok-4", "grok-3-mini", "something-else"])("sends %s to Grok", async (model) => {
    fetchMock.mockResolvedValueOnce(json(gammaEvent));
    callGrokResponses.mockResolvedValueOnce(llm(["q"]));
    dflowRequest.mockResolvedValueOnce({ events: [] });
    await findArbitrage({ url: "https://polymarket.com/event/x", model });
    expect(callGrokResponses).toHaveBeenCalled();
    expect(callOpenAIResponses).not.toHaveBeenCalled();
  });
});
