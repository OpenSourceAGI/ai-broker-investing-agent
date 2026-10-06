import { it, expect } from "vitest";
import { runGabagoolDemo } from "../../src/strategy-signals/demo";

it("builds portfolio targets sequentially through actual fills, rejection and completion", async () => {
  const r = await runGabagoolDemo();
  expect(r.first.fill?.fill).toMatchObject({ quantity: 5, priceCents: 49, cashChangeCents: -245 });
  expect(
    r.first.after.kind === "event" && r.first.after.portfolio.positions["GABA-FIXTURE:NO"],
  ).toBeUndefined();
  expect(r.wait.signal.action).toBe("HOLD");
  expect(r.wait.after).toEqual(r.first.after);
  expect(r.rejected.fill?.status).toBe("REJECTED");
  expect(r.rejected.after).toEqual(r.first.after);
  expect(r.completion.fill?.intent.outcome).toBe("NO");
  expect(r.completion.after.kind === "event" && r.completion.after.portfolio.cashCents).toBe(9510);
  expect(r.satisfied.signal.action).toBe("HOLD");
  expect(r.satisfied.after).toEqual(r.completion.after);
  expect(r.reduced.fill?.fill?.quantity).toBe(3);
});
