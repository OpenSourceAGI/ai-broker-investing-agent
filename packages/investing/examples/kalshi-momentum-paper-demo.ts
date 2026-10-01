import { runKalshiMomentumPaperAgent } from "../src/prediction-markets/index.js";

const baseTime = Date.parse("2026-01-01T00:00:00.000Z");
const yesPrices = [50, 51, 52, 53, 58];
const ticks = yesPrices.map((yesPriceCents, index) => ({
  ticker: "DEMO-KALSHI-MARKET",
  timestamp: new Date(baseTime + index * 60_000).toISOString(),
  yesPriceCents,
}));

const result = runKalshiMomentumPaperAgent({ ticks, initialCashCents: 10_000 });

console.log(result.report);
console.log("\nStructured result:");
console.log(JSON.stringify(result, null, 2));
