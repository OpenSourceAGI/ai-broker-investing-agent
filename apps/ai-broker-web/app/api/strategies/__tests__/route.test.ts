import { describe, expect, it } from "vitest";
import { STRATEGY_INFOS } from "indicatorts";

import algoStrategies from "@/packages/investing/src/algo-stategies/algo-strategies.json";
import {
  TECHNICAL_STRATEGIES,
  TECHNICAL_STRATEGY_NAME_BY_ID,
} from "@/lib/technical-strategies";
import { GET } from "../route";

const request = (query = "") =>
  new Request(`http://localhost/api/strategies${query}`);

describe("GET /api/strategies", () => {
  it("adds every built-in strategy without changing or duplicating catalog IDs", async () => {
    const response = await GET(request());
    const strategies = await response.json();
    const ids = strategies.map((strategy: { url: string }) => strategy.url);

    expect(response.status).toBe(200);
    expect(strategies).toHaveLength(
      algoStrategies.length + TECHNICAL_STRATEGIES.length,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      strategies.filter(
        (strategy: { provider: string }) => strategy.provider === "builtin",
      ),
    ).toHaveLength(24);
    expect(
      strategies.filter(
        (strategy: { provider: string }) => strategy.provider === "tradingview",
      ),
    ).toHaveLength(algoStrategies.length);

    const existing = algoStrategies[0];
    const existingSummary: Partial<typeof existing> = { ...existing };
    delete existingSummary.description;
    delete existingSummary.source;
    expect(
      strategies.find((strategy: { url: string }) => strategy.url === existing.url),
    ).toEqual({ ...existingSummary, source: "", provider: "tradingview" });
  });

  it("returns built-in details by the existing short ID", async () => {
    const response = await GET(request("?id=macd"));
    const strategy = await response.json();

    expect(response.status).toBe(200);
    expect(strategy).toMatchObject({
      url: "macd",
      name: "MACD Strategy",
      provider: "builtin",
      author: "Indicator TS",
      script_type: "strategy",
    });
    expect(strategy.description).toBeTruthy();
    expect(strategy.source).toBe("");
  });

  it("preserves exact indicatorts strategy names in the shared ID mapping", () => {
    const expectedMapping = {
      "buy-hold": "Buy Hold",
      "awesome-oscillator": "Awesome Oscillator",
      "rsi-2": "RSI 2",
      "ichimoku-cloud": "Ichimoku Cloud",
      "stochastic-oscillator": "Stochastic Oscillator",
      "williams-r": "Williams R",
      apo: "Absolute Price Oscillator (APO)",
      aroon: "Aroon Strategy",
      bop: "Balance of Power (BOM)",
      cfo: "Chande Forecast Oscillator (CFO)",
      kdj: "KDJ Strategy",
      macd: "MACD Strategy",
      psar: "Parabolic SAR",
      "typical-price": "Typical Price",
      vortex: "Vortex Strategy",
      "acceleration-bands": "Acceleration Bands",
      "bollinger-bands": "Bollinger Bands",
      "projection-oscillator": "Projection Oscillator",
      cmf: "Chaikin Money Flow (CMF)",
      emv: "Ease of Movement (EMV)",
      "force-index": "Force Index",
      mfi: "Money Flow Index",
      nvi: "Negative Volume Index (NVI)",
      vwap: "Volume Weighted Average Price",
    };

    expect(TECHNICAL_STRATEGIES).toHaveLength(24);
    expect(TECHNICAL_STRATEGY_NAME_BY_ID).toEqual(expectedMapping);
    expect(Object.values(TECHNICAL_STRATEGY_NAME_BY_ID).sort()).toEqual(
      STRATEGY_INFOS.map(({ name }) => name).sort(),
    );
  });

  it("continues to return TradingView details with provider metadata", async () => {
    const existing = algoStrategies[0];
    const response = await GET(
      request(`?id=${encodeURIComponent(existing.url)}`),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      url: existing.url,
      name: existing.name,
      provider: "tradingview",
    });
  });
});
