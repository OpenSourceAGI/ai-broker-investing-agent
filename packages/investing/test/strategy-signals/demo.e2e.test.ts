import { it, expect, vi } from "vitest";
import { runMomentumDemo } from "../../src/strategy-signals/demo";

it("connects source, debate, approvals, BUY and SELL with actual holdings", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  try {
    const [buy, sell] = await runMomentumDemo();
    expect(buy.signal.action).toBe("BUY");
    expect(buy.fill?.fill).toMatchObject({ priceCents: 55, quantity: 10, cashChangeCents: -550 });
    expect(
      buy.after.kind === "event" && buy.after.portfolio.positions["MOMENTUM:YES"].quantity,
    ).toBe(10);
    expect(sell.signal.action).toBe("SELL");
    expect(sell.fill?.fill).toMatchObject({ priceCents: 60, quantity: 10, cashChangeCents: 600 });
    expect(sell.after.kind === "event" && sell.after.portfolio.positions).toEqual({});
    expect(sell.after.kind === "event" && sell.after.portfolio.cashCents).toBe(10050);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(buy.prompts.map((c) => c.rule)).toEqual([
      "bull",
      "bear",
      "bull",
      "bear",
      "bull",
      "bear",
      "research-manager",
      "trader",
      "risky",
      "safe",
      "neutral",
      "risk-judge",
      "fund-manager",
    ]);
  } finally {
    fetchSpy.mockRestore();
  }
});
