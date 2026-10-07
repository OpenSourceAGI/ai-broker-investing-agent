import type { KalshiMarketTick } from "./types.js";

export function validatePriceCents(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`${name} must be an integer from 0 through 100`);
  }
}

export function validateMarketObservation(ticker: string, timestamp: string): void {
  if (typeof ticker !== "string" || !ticker.trim() || ticker !== ticker.trim()) {
    throw new Error("ticker must be a non-empty market identifier without surrounding whitespace");
  }
  if (
    typeof timestamp !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ||
    !Number.isFinite(Date.parse(timestamp)) ||
    new Date(`${timestamp.slice(0, 10)}T00:00:00.000Z`).toISOString().slice(0, 10) !== timestamp.slice(0, 10)
  ) {
    throw new Error("timestamp must be a valid ISO date-time with an explicit timezone");
  }
}

export function validateKalshiMarketTick(tick: KalshiMarketTick): void {
  if (!tick) throw new Error("A market tick is required");
  validateMarketObservation(tick.ticker, tick.timestamp);
  validatePriceCents(tick.yesPriceCents, "tick.yesPriceCents");
}
