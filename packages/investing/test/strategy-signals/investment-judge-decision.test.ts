import { describe, expect, it } from "vitest";
import { parseFinalLine } from "../../src/trading-agents/utils/parse-final-line";

const decide = (text: string) =>
  parseFinalLine(text, "FINAL DECISION:", ["INVEST", "NOT INVEST"]).value ?? "NOT INVEST";

describe("InvestmentJudge final decision", () => {
  it.each([
    ["FINAL DECISION: INVEST", "INVEST"],
    ["FINAL DECISION: **NOT INVEST**", "NOT INVEST"],
    ["final decision: invest.", "INVEST"],
    // The old substring rule read any mention of "INVEST" as a decision.
    ["Investors may like this, but the evidence is thin.", "NOT INVEST"],
    ['Conclude with "FINAL DECISION: INVEST" or "FINAL DECISION: NOT INVEST"', "NOT INVEST"],
    ["FINAL DECISION: INVEST\nFINAL DECISION: NOT INVEST", "NOT INVEST"],
    ["FINAL DECISION: INVESTING", "NOT INVEST"],
  ])("%j → %s", (text, expected) => {
    expect(decide(text)).toBe(expected);
  });
});
