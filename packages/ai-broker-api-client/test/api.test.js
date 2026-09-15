import { describe, it, expect } from "vitest";
import * as BrokerClient from "../src/index";

// This suite calls the live https://autoinvestment.broker/api deployment, so it
// is opt-in. Run with RUN_INTEGRATION_TESTS=1 to exercise the real endpoints.
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

describe("broker clients", () => {
  it("exports the generated SDK operations", () => {
    expect(typeof BrokerClient.getStocksSearch).toBe("function");
    expect(typeof BrokerClient.getStocksQuoteBySymbol).toBe("function");
    expect(typeof BrokerClient.postTradingAgents).toBe("function");
  });

  it.runIf(runIntegration)("searches stocks by query", async () => {
    // Generated operations take an options object, not a bare string.
    const result = await BrokerClient.getStocksSearch({ query: { q: "AAPL" } });

    expect(result.error).toBeUndefined();
    expect(Array.isArray(result.data?.data)).toBe(true);
  });
});
