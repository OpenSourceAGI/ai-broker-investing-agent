import { it, expect } from "vitest";
import { selectProposal } from "../../src/strategy-signals/proposal";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import { signal, market, time, approval } from "./helpers";

it("selects deterministic ties and binds the exact side, limit and quantity", async () => {
  const v = new MockVenue("kalshi", [market]);
  const no = signal({
    sourceId: "a",
    instrument: { type: "event", venue: "kalshi", marketId: "FIXTURE", outcome: "NO" },
    sizing: { quantity: 2, limitPriceCents: 50 },
  });
  const selected = selectProposal("BUY", [signal({ sourceId: "z" }), no], {
    instrument: { type: "event", venue: "kalshi", marketId: "FIXTURE" },
    account: v.snapshot(),
    evaluationTime: time,
  });
  expect("proposal" in selected && selected.proposal.outcome).toBe("NO");
  if (!("proposal" in selected)) throw Error("missing proposal");
  const a = approval({
    proposal: selected.proposal,
    finalQuantity: 2,
    fundManager: { decision: "APPROVE", proposalId: selected.proposal.proposalId, quantity: 2 },
  });
  const filled = await v.execute(a);
  expect(filled.intent).toMatchObject({
    ticker: "FIXTURE",
    outcome: "NO",
    priceCents: 50,
    quantity: 2,
  });
  expect(filled.portfolio.positions["FIXTURE:YES"]).toBeUndefined();
});
it("keeps equal market IDs on different venues separate", async () => {
  const v = new MockVenue("other", [{ ...market, venue: "other" }]);
  await expect(v.execute(approval())).rejects.toThrow("venue mismatch");
  expect(v.snapshot().kind === "event" && (v.snapshot() as any).portfolio.positions).toEqual({});
});
it("keeps direction-only signals as reports", () =>
  expect(
    selectProposal("BUY", [signal({ sizing: undefined })], {
      instrument: signal().instrument,
      evaluationTime: time,
    }),
  ).toEqual({ reportOnly: "direction-only signal" }));
