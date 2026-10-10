import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHistoricalData,
  getRealTimeData,
} from "../src/live-data/dukascopy-client";

/**
 * Cloudflare Workers reject `new Function(...)`. dukascopy-node's own
 * `getHistoricalRates` validates config with fastest-validator, which compiles
 * its schema that way, so production /api/markets/global failed every call.
 */
describe("dukascopy client on a runtime without code generation", () => {
  const RealFunction = globalThis.Function;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    globalThis.Function = function () {
      throw new EvalError("Code generation from strings disallowed for this context");
    } as unknown as FunctionConstructor;
    // An empty 200 body decodes to zero candles without touching the network.
    fetchMock = vi.fn(async () => new Response(new ArrayBuffer(0), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    globalThis.Function = RealFunction;
    vi.unstubAllGlobals();
  });

  it("fetches real-time data without compiling a validator", async () => {
    const result = await getRealTimeData({
      instrument: "usa500idxusd",
      timeframe: "m1",
      format: "json",
      last: 5,
    });

    expect(result).toEqual({ success: true, data: [] });
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toContain("dukascopy.com");
  });

  it("fetches historical data without compiling a validator", async () => {
    const result = await getHistoricalData({
      instrument: "eurusd",
      dates: { from: "2024-01-01", to: "2024-02-01" },
      timeframe: "d1",
    });

    expect(result).toEqual({ success: true, data: [] });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("still rejects unknown instruments and bad dates before fetching", async () => {
    const unknown = await getRealTimeData({ instrument: "notaninstrument" });
    expect(unknown.success).toBe(false);
    expect(unknown.error).toMatch(/Unknown Dukascopy instrument/);

    const backwards = await getHistoricalData({
      instrument: "eurusd",
      dates: { from: "2024-02-01", to: "2024-01-01" },
    });
    expect(backwards.success).toBe(false);
    expect(backwards.error).toMatch(/start before it ends/);

    const invalid = await getHistoricalData({
      instrument: "eurusd",
      dates: { from: "not a date" },
    });
    expect(invalid.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
