# ADR 0002: A deterministic risk gate has the final say over LLM decisions

**Status:** Accepted
**Date:** 2026-10-05
**Design brief:** [`devdocs/design/third-party-bot-integration.md`](../design/third-party-bot-integration.md)

## Context

The agent chain is Analyst → Research Manager → Trader → Portfolio Manager. `TradingAgentsGraph.propagate()` stops at the Trader. The risk team (`RiskyAnalyst`, `SafeAnalyst`, `NeutralAnalyst`) and the `FundManager` exist, but nothing calls them. The risk team also has no judge, so nothing sets `riskDebateState.judgeDecision` or `finalRiskAdjustedPlan`.

The repo treats risk limits as safety-critical. `.claude/CLAUDE.md` says: "Never loosen a risk guard, widen a position cap or disable a validation." Today, every stage decides through free-text LLM output. The output is parsed with string matching, which already has two bugs:

- `trading-graph.ts:224`: "BUY" matches before any other action.
- `fund-manager.ts:100`: APPROVE and MODIFY both map to BUY.

Three options were considered:

1. **LLM risk judge only.** It reuses the most code, but position limits would exist only as prose that a model can ignore or misread.
2. **Deterministic gate only.** It is fully testable, but it leaves the existing risk-team agents unused.
3. **LLM risk debate and judge, then a deterministic gate with a hard veto.**

## Decision

Option 3. When `riskReview` is on, the chain after the Trader runs in this order:

1. **One proposal is selected** (`selectProposal`), with a stable `proposalId`. Every later step refers to that exact proposal.
2. **Risky → Safe → Neutral debate** (the existing agents).
3. **A new `RiskJudge` (LLM)** must end with `RISK DECISION: PROCEED`, `BLOCK` or `REDUCE <whole number>`.
   - The reply is parsed strictly.
   - A malformed reply, a fractional, negative or missing cap, or any model error counts as BLOCK.
   - BLOCK forces HOLD.
4. **`applyRiskGate` is a pure function.** It returns a `RiskVerdict` (`allowed`, `maxQuantity`, `reasons`).
   - **Common checks for every source:** current cash, position cap, open-position limit, posture, and exits always allowed.
   - **Then the source's own guards:** for example, `Kalshi-Vibe-Bot`'s forecast-based Kelly, edge and confidence rules apply only to that source. A market price is never treated as a forecast.
5. **The `FundManager` (LLM)** sees the proposal, the verdict and the judge's decision. It must end with the proposal ID, `DECISION: APPROVE|REJECT|MODIFY` and `APPROVED QUANTITY: <whole number>`.
   - A mismatched ID, a missing or invalid quantity, or a model error counts as REJECT.
   - Approval follows the proposal's own direction, so a SELL can be approved.
6. **The final quantity is the minimum** of the proposal's quantity, the verdict's `maxQuantity`, the judge's REDUCE cap and the Fund Manager's quantity. Any denial, or a 0 result, gives HOLD.
7. **The graph's returned signal is built from this final decision,** never from the Trader's earlier one.

Every threshold in the gate and in each source guard is pinned by a test.

## Consequences

**Benefits**
- Position limits are code, not prose. A reviewer sees every limit change in a diff and in a failing test.
- The existing risk agents are reused, and the LLMs still add judgment inside the limits.
- The demo and tests stay deterministic, because the gate does not depend on LLM output to enforce a limit.

**Costs and risks**
- **More LLM calls when enabled:** 3 debaters, 1 judge and the Fund Manager. That is why `riskReview` is opt-in, so the existing API routes keep their cost.
- **Disagreement:** the gate can veto a trade that the LLM agents approved. The final state records the veto reasons, so the outcome is explained, not silent.
- **Limits are global per run:** the gate's limits come from `riskLimits` in the graph options. Per-user limits are future work.

## Implementation clarifications

- Executable third-party proposals require a source registry entry, so omitting a source cannot bypass its guards. Report-only inputs still reach the agents. The selected signal is passed directly to its own guards; it is never reselected after approval.
- Common entry posture and source entry guards do not block a validated SELL from current holdings. Judge/Fund Manager rejection and malformed account/approval data still prevent execution.
- Stock direction can be approved without a quoted signal, but the risk review itself needs the current stock `AccountSnapshot` (cash and shares): without one, the gate denies and the run ends at HOLD. `toEquityOrder` requires a current stock account and supported positive fixture close, and caps quantity again by cash or held shares before the Alpaca-shaped order.
- Individual paper fill prices are whole cents. Account average cost may be fractional because it is a weighted average of valid fills. Rejecting fractional averages would invalidate actual sequential holdings.
- Portfolio targets execute one leg per call. A failed execution does not mutate the account; the caller refreshes the snapshot before another run. There is no ledger, version check or concurrency control.
