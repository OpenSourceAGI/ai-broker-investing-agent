import type { Bar } from "./types";

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Turn provider rows (Yahoo, Alpaca, fixtures) into clean daily bars: rows
 * without a valid date or with a non-finite open/high/low/close are dropped,
 * a missing volume becomes 0, and the result is sorted by date with one bar
 * per day (the last row for a date wins).
 */
export function normalizeBars(rows: unknown[]): Bar[] {
  const byDate = new Map<string, Bar>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const date = toIsoDate(r.date);
    const prices = [r.open, r.high, r.low, r.close];
    if (!date || !prices.every((p) => typeof p === "number" && Number.isFinite(p))) continue;
    const volume = typeof r.volume === "number" && Number.isFinite(r.volume) ? r.volume : 0;
    const [open, high, low, close] = prices as number[];
    byDate.set(date, { date, open, high, low, close, volume });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
