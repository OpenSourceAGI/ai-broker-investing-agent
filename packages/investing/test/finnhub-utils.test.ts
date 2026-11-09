import { describe, it, expect } from "vitest";
import { mapIntervalToYahoo, toUnixTimestamp } from "../src/stocks/finnhub-utils";

describe("toUnixTimestamp", () => {
  it("passes Unix seconds through unchanged", () => {
    // `new Date("1791504000")` is Invalid Date; this used to return NaN.
    expect(toUnixTimestamp("1791504000")).toBe(1791504000);
  });

  it("reads a millisecond timestamp", () => {
    expect(toUnixTimestamp("1791504000000")).toBe(1791504000);
  });

  it("reads ISO dates and Date objects", () => {
    expect(toUnixTimestamp("2024-01-01T00:00:00Z")).toBe(1704067200);
    expect(toUnixTimestamp(new Date("2024-01-01T00:00:00Z"))).toBe(1704067200);
  });
});

describe("mapIntervalToYahoo", () => {
  it("maps intraday sizes so zoomed-in charts can fall back to Yahoo", () => {
    expect(mapIntervalToYahoo("15m")).toBe("15m");
    expect(mapIntervalToYahoo("1h")).toBe("1h");
    expect(mapIntervalToYahoo("60")).toBe("60m");
  });

  it("keeps daily/weekly/monthly and rejects unknown sizes", () => {
    expect(mapIntervalToYahoo("D")).toBe("1d");
    expect(mapIntervalToYahoo("1wk")).toBe("1wk");
    expect(mapIntervalToYahoo(undefined)).toBe("1d");
    expect(mapIntervalToYahoo("3y")).toBeNull();
  });
});
