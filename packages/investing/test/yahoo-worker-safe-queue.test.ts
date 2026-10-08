import { describe, it, expect } from "vitest";
import YahooFinance from "yahoo-finance2";
import { createYahooFinance } from "../src/stocks/yahoo-finance-wrapper";

/**
 * Regression test for "Cannot perform I/O on behalf of a different request
 * (I/O type: ReadableStreamSource)" from GET /api/stocks/quotes on Workers.
 *
 * yahoo-finance2 queues fetches on a module-level queue. A deferred job is
 * started from another job's completion, i.e. inside another request's
 * context, which Workers rejects when the body is read. createYahooFinance()
 * must start every fetch immediately, in the caller's own context.
 */
describe("createYahooFinance", () => {
  const CALLS = 12; // well above yahoo-finance2's default queue concurrency of 4

  async function countStartedFetches(yf: any): Promise<number> {
    let started = 0;
    const pending: Array<(r: Response) => void> = [];
    const fetch = (_url: any, _init?: any) => {
      started++;
      return new Promise<Response>((resolve) => pending.push(resolve));
    };

    const calls = Array.from({ length: CALLS }, (_, i) =>
      yf
        .chart(
          `SYM${i}`,
          { period1: "2026-01-01", period2: "2026-01-10", interval: "1d" },
          { validateResult: false, fetch },
        )
        .catch(() => undefined),
    );

    // Let every call reach the fetch queue.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const startedBeforeAnyResponse = started;

    // Drain: answer every fetch (including any that were deferred).
    while (pending.length || started < CALLS) {
      pending.splice(0).forEach((resolve) =>
        resolve(new Response("{}", { status: 200 })),
      );
      await new Promise((r) => setTimeout(r, 0));
    }
    await Promise.all(calls);
    return startedBeforeAnyResponse;
  }

  it("starts every fetch immediately instead of deferring it to another call's context", async () => {
    expect(await countStartedFetches(createYahooFinance())).toBe(CALLS);
  });

  it("guards against the library default, which defers fetches past its concurrency limit", async () => {
    const started = await countStartedFetches(new YahooFinance());
    expect(started).toBeLessThan(CALLS);
    // Restore the shared queue for any later test in this worker.
    await countStartedFetches(createYahooFinance());
  });
});
