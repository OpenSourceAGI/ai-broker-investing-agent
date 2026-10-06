import { describe, it, expect } from "vitest";
import { parseFinalLine } from "../../src/trading-agents/utils/parse-final-line";
import { parseJudgeDecision } from "../../src/trading-agents/agents/risk-judge";
import { parseFundManagerApproval } from "../../src/trading-agents/agents/fund-manager";

describe("closing decision grammar", () => {
  const marker = "FINAL TRANSACTION PROPOSAL:";
  it.each([
    ["**BUY/HOLD/SELL**", "HOLD"],
    ["**BUY / HOLD / SELL**", "HOLD"],
    ["BUY | SELL | HOLD", "HOLD"],
    ["BUYER", "HOLD"],
    ["BUY_foo", "HOLD"],
    ["BUY2", "HOLD"],
    ["BUY because momentum", "HOLD"],
    ["**SELL**", "SELL"],
    ["buy", "BUY"],
    ["BUY.", "BUY"],
    ["**HOLD**.", "HOLD"],
    ["**BUY", "BUY"],
  ])("%s -> %s", (payload, expected) =>
    expect(
      parseFinalLine(`${marker} ${payload}`, marker, ["BUY", "SELL", "HOLD"]).value ?? "HOLD",
    ).toBe(expected),
  );
  it.each([
    [`${marker} **BUY/HOLD/SELL**\n${marker} **SELL**`, "SELL"],
    [`${marker} BUY\n${marker} **BUY/HOLD/SELL**`, "HOLD"],
    [`${marker} BUY\n${marker} SELL`, "HOLD"],
    ["No proposal", "HOLD"],
  ])("uses closing line and rejects contradictions", (text, expected) =>
    expect(parseFinalLine(text, marker, ["BUY", "SELL", "HOLD"]).value ?? "HOLD").toBe(expected),
  );
  it.each([
    "REDUCE",
    "REDUCE -1",
    "REDUCE 1.5",
    "REDUCE NaN",
    "REDUCE 9007199254740992",
    "PROCEED extra",
  ])("invalid judge %s blocks", (v) =>
    expect(parseJudgeDecision(`RISK DECISION: ${v}`).decision.kind).toBe("BLOCK"),
  );
  it("parses numeric judge reduction", () =>
    expect(parseJudgeDecision("RISK DECISION: REDUCE 3").decision).toEqual({
      kind: "REDUCE",
      maxQuantity: 3,
    }));
  it.each(["-1", "1.5", "NaN", "Infinity", "9007199254740992"])(
    "invalid manager quantity %s rejects",
    (q) =>
      expect(
        parseFundManagerApproval(
          `PROPOSAL ID: id\nDECISION: APPROVE\nAPPROVED QUANTITY: ${q}`,
          "id",
        ).decision,
      ).toBe("REJECT"),
  );
});
