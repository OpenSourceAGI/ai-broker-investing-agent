import { beforeEach, describe, expect, it, vi } from "vitest";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

const queryState = vi.hoisted(() => ({
  where: undefined as unknown,
  orderBy: [] as unknown[],
  rows: [] as unknown[],
}));

vi.mock("../src/db", () => ({
  db: {
    select: () => {
      const chain = {
        from() {
          return chain;
        },
        where(value: unknown) {
          queryState.where = value;
          return chain;
        },
        orderBy(...values: unknown[]) {
          queryState.orderBy = values;
          return Promise.resolve(queryState.rows);
        },
      };
      return chain;
    },
  },
}));

import { getTraderTradesThroughCutoff } from "../src/prediction/db/trade-history";

beforeEach(() => {
  queryState.where = undefined;
  queryState.orderBy = [];
  queryState.rows = [];
});

describe("getTraderTradesThroughCutoff", () => {
  it("queries every TRADE row through an inclusive cutoff in stable order", async () => {
    const cutoff = new Date("2026-01-02T03:04:05.000Z");
    queryState.rows = [{ id: "a" }, { id: "b" }];

    expect(await getTraderTradesThroughCutoff("0xwallet", cutoff)).toEqual(
      queryState.rows,
    );

    const dialect = new SQLiteSyncDialect();
    const where = dialect.sqlToQuery(queryState.where as never);
    expect(where.sql).toContain('"polymarket_trade_history"."trader_id" = ?');
    expect(where.sql).toContain('"polymarket_trade_history"."type" = ?');
    expect(where.sql).toContain('"polymarket_trade_history"."timestamp" <= ?');
    expect(where.params).toEqual([
      "0xwallet",
      "TRADE",
      cutoff.getTime() / 1000,
    ]);

    expect(queryState.orderBy).toHaveLength(2);
    const ordering = queryState.orderBy.map((term) =>
      dialect.sqlToQuery(term as never).sql,
    );
    expect(ordering[0]).toContain('"timestamp" asc');
    expect(ordering[1]).toContain('"id" asc');
  });

  it("rejects an empty wallet or invalid cutoff", async () => {
    await expect(getTraderTradesThroughCutoff("", new Date())).rejects.toThrow(
      TypeError,
    );
    await expect(
      getTraderTradesThroughCutoff("0xwallet", new Date(Number.NaN)),
    ).rejects.toThrow(RangeError);
  });
});
