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
    // An empty candle payload decodes to zero candles without touching the
    // network. dukascopy-node's jetta endpoints answer in JSON (and reject any
    // other content type), so the mock mirrors that shape.
    const emptyCandles = {
      timestamp: 0,
      multiplier: 0.001,
      times: [],
      opens: [],
      highs: [],
      lows: [],
      closes: [],
      volumes: [],
    };
    // dukascopy-node cannot aggregate a completely empty daily file, so daily
    // URLs get one candle dated before any range these tests request. It is
    // filtered out by date, leaving zero candles all the same.
    const staleDailyCandle = {
      timestamp: Date.UTC(2020, 0, 1),
      multiplier: 0.001,
      shift: 24 * 60 * 60e3,
      open: 1.1,
      high: 1.2,
      low: 1.0,
      close: 1.15,
      times: [0],
      opens: [0],
      highs: [0],
      lows: [0],
      closes: [0],
      volumes: [1],
    };
    fetchMock = vi.fn(
      async (url: string | URL) =>
        new Response(JSON.stringify(String(url).includes("/candles/day/") ? staleDailyCandle : emptyCandles), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
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
