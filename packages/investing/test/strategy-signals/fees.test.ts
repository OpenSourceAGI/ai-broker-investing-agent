import { expect, it } from "vitest";
import { affordableQuantity, takerFeeCents } from "../../src/strategy-signals/fees";

// Expected values come from Kalshi's published fee schedule (0.07 × C × P × (1 − P),
// rounded up to the cent; makers pay a quarter) and Polymarket's Crypto category table.
it.each([
  [10, 50, 700, 18], // $0.175 rounds up to $0.18
  [100, 50, 700, 175], // "$1.75 per 100 contracts at 50¢"
  [100, 10, 700, 63], // "$0.63 per 100 contracts at 10¢"; float product must not round up
  [1, 50, 700, 2],
  [100, 50, 175, 44], // maker rate
  [100, 50, 0, 0], // fee-free category
])("fee for %s contracts at %s¢ and %s bps is %s¢", (quantity, price, bps, fee) =>
  expect(takerFeeCents(quantity, price, bps)).toBe(fee),
);
it.each([
  [500, 50, 0, 10],
  [500, 50, 700, 9],
  [517, 50, 700, 9], // 10 contracts cost 500 + 18
  [518, 50, 700, 10],
  [30, 0.1, 0, 300], // fee-free stays exactly floor(cash / price)
  [0, 50, 700, 0],
])("cash %s at %s¢ and %s bps affords %s", (cash, price, bps, quantity) =>
  expect(affordableQuantity(cash, price, bps)).toBe(quantity),
);
