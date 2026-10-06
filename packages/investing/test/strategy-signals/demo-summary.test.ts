import { expect, it } from "vitest";
import { formatDemoSummary, runAllStrategiesDemo } from "../../src/strategy-signals/demo";

it("prints the six-stage chain for every demo run", async () => {
  const summary = formatDemoSummary(await runAllStrategiesDemo());
  for (const name of [
    "momentum run 1",
    "vibe-yes",
    "btc-bearish",
    "copy-trade-sizing",
    "gabagool first",
    "stock run 2",
    "defensive posture",
  ]) {
    expect(summary).toContain(name);
  }
  for (const stage of [
    "  1 strategy ",
    "  2 normalized ",
    "  3 research input ",
    "  4 trader ",
    "  5 portfolio mgr ",
    "  6 execution ",
  ]) {
    expect(summary.split(stage).length - 1).toBe(18);
  }
  // The research stage proves the bot's report reached the debate, not just the executor.
  expect(summary).toMatch(/vibe-yes\n(?:.*\n){2}.*read by: .*bull.*bear/);
  expect(summary).toMatch(/vibe-yes\n(?:.*\n){5}.*FILLED 9 @ 55¢/);
});
