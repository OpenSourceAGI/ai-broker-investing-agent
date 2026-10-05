# Findings: the agent pipeline (`packages/investing/src/trading-agents`)

These findings come from reading the code at upstream commit `b877b41`, and from small runs of the existing code. Each finding gives its evidence (`file:line`, relative to `packages/investing/`), its effect, and what the integration plan does about it. The plan is [`../plans/third-party-bot-integration.md`](../plans/third-party-bot-integration.md).

## Summary

| # | Finding | Severity | Plan response |
|---|---|---|---|
| P1 | The risk team and the Fund Manager exist but are never called | High | Wire them in behind an opt-in `riskReview` flag |
| P2 | The risk team has no judge | High | Add a `RiskJudge` with a typed, binding decision |
| P3 | The returned `TradeSignal` is built before any later stage could change the decision | High | Build the returned signal from the final state |
| P4 | `extractDecision` returns BUY whenever the text contains "BUY" | High | Strict parser for the final proposal line only |
| P5 | The Fund Manager can never approve a SELL | High | Map approval to the proposal's own direction |
| P6 | The Fund Manager's position size is free text and is never enforced | High | Typed, validated approved quantity |
| P7 | The Trader sees a fixed sentence, not the debate | Medium | Reported only (out of scope) |
| P8 | LLM clients cannot be injected | Medium | `LLMClient` interface and a scripted fake |
| P9 | The pipeline handles stocks only, and its prompts assume a company | Medium | `instrument` input and event-specific prompt variants |
| P10 | The analysts need the network and swallow network errors | Medium | Event runs skip them; tests forbid network at two levels |
| P11 | `sentimentReport` and `fundamentalsReport` are placeholders | Low | Reported only |

## Details

### P1 — The risk team and the Fund Manager are never called

**Evidence.** `TradingAgentsGraph.propagate()` (`src/trading-agents/graph/trading-graph.ts:91-180`) runs Market Analyst → News Analyst → Bull/Bear ×3 → `InvestmentJudge` → `Trader`, and then returns. `RiskyAnalyst`, `SafeAnalyst`, `NeutralAnalyst` (`agents/risk-team.ts:10,71,136`) and `FundManager` (`agents/fund-manager.ts:9`) are never constructed. `src/trading-agents/index.ts` does not export them.

**Effect.** The chain that the task names (Analyst → Research Manager → Trader → Portfolio Manager) stops before the Portfolio Manager. No position limit is applied anywhere in the graph.

### P2 — The risk team has no judge

**Evidence.** The 3 risk debaters only append to `riskDebateState` histories (`agents/risk-team.ts:54-66` and the matching blocks). Nothing sets `riskDebateState.judgeDecision` or `finalRiskAdjustedPlan`, yet `FundManager` reads both (`agents/fund-manager.ts:33-40`).

**Effect.** If the Fund Manager were called today, it would read 2 empty sections.

### P3 — The returned signal is built before any later stage could change the decision

**Evidence.** `trading-graph.ts:163` stores the Trader's parsed decision in a local constant. Line 173 builds the returned `TradeSignal` from that constant. The live API route reads `signal.action` (`apps/ai-broker-web/app/api/trading-agents/route.ts:105`, repo root).

**Effect.** If a later stage (risk or Fund Manager) changed `state.finalTradeDecision`, callers would still receive the Trader's original action. A rejected BUY would look approved.

### P4 — `extractDecision` returns BUY whenever the text contains "BUY"

**Evidence.** `trading-graph.ts:224-233` tests `includes('BUY')` before SELL and HOLD. The Trader's own prompt tells the model to end with `FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**` (`agents/trader.ts:42`). A model that echoes that template, or writes "I would not BUY", is read as BUY.

**What we learned while designing the fix.** Two regex versions were tried, and each failed on real model-style output:

| Input | First regex | Second regex (letter/slash lookahead) | Final parser |
|---|---|---|---|
| `FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**` | BUY ✗ | HOLD ✓ | HOLD ✓ |
| `FINAL TRANSACTION PROPOSAL: BUYER` | BUY ✗ | HOLD ✓ | HOLD ✓ |
| `FINAL TRANSACTION PROPOSAL: **BUY / HOLD / SELL**` | BUY ✗ | BUY ✗ | HOLD ✓ |
| `FINAL TRANSACTION PROPOSAL: BUY \| SELL \| HOLD` | BUY ✗ | BUY ✗ | HOLD ✓ |
| `FINAL TRANSACTION PROPOSAL: BUY_foo` | BUY ✗ | BUY ✗ | HOLD ✓ |
| A valid BUY line, then the echoed template on a later line | BUY ✗ | BUY ✗ | HOLD ✓ |

**The same bug class in `InvestmentJudge`.** `agents/researchers.ts` decided with `includes('INVEST') && !includes('NOT INVEST')`, so any text mentioning "invest" counted as INVEST. It now reads only the last `FINAL DECISION:` line with the same parser, and treats anything malformed as the conservative NOT INVEST.

**Lesson.** Do not search the text for a decision word. Find the **last** proposal line, take its whole payload, strip only supported Markdown and end punctuation, and accept the payload only if it is exactly one of BUY, SELL or HOLD. Anything else is HOLD, with the reason recorded. Contradictory proposal lines are also HOLD. The same rule applies to the new risk-judge and Fund Manager decisions.

### P5 — The Fund Manager can never approve a SELL

**Evidence.** `agents/fund-manager.ts:100` maps APPROVE and MODIFY to `'BUY'`, and everything else to `'HOLD'`.

**Effect.** An approved exit becomes a new entry.

### P6 — The Fund Manager's position size is free text and is never enforced

**Evidence.** `agents/fund-manager.ts:87-99` copies the text after `Position Size:` into `approvedPositionSize` (a string). Nothing reads it.

**Effect.** A MODIFY to a smaller size has no effect. The plan replaces this with a typed approval: a decision, a whole-unit quantity, and the ID of the exact proposal it approves. The final quantity is the smallest of the requested size, the deterministic caps, the risk judge's cap and the Fund Manager's quantity. Any malformed or missing value means no executable approval.

### P7 — The Trader sees a fixed sentence, not the debate

**Evidence.** `InvestmentJudge` sets `investmentPlan` to one of two constants: "Proceed with investment based on bull arguments" or "Avoid investment due to bear concerns" (`agents/researchers.ts:170`). `Trader` reads only `investmentPlan` in its user message (`agents/trader.ts:50-54`). It uses the 4 reports only as a memory lookup key.

**Effect.** The debate's reasoning never reaches the Trader. The integration adds the strategy-signals report to the Trader's message, but it does not change `investmentPlan`. That fix belongs in its own change.

### P8 — LLM clients cannot be injected

**Evidence.** The graph builds its clients from config (`trading-graph.ts:69-70`). `UnifiedLLMClient` has private fields (`utils/llm-client.ts:16-21`). TypeScript compares classes with private members nominally, so no test double can satisfy the class type.

**Effect.** No deterministic or credential-free run of the graph is possible. The plan adds an `LLMClient` interface that the class implements, and an optional constructor option to pass clients in.

### P9 — The pipeline handles stocks only, and its prompts assume a company

**Evidence.** `AgentState` is keyed by `companyOfInterest` (`types/index.ts:50-58`). The Bull prompt argues "growth potential, competitive advantages" (`agents/researchers.ts:32-37`), and the Bear prompt argues stock valuation (`:93-98`).

**Effect.** A prediction-market contract sent through the graph would be debated as if it were a company. The plan adds an `instrument` input and, for event contracts only, prompt variants that carry the market question, the selected outcome, the P(YES) convention, the quote and the closing time. Stock prompts stay byte-identical when no new input is given.

### P10 — The analysts need the network and swallow network errors

**Evidence.** `MarketAnalyst` calls `getStockData` (`agents/market-analyst.ts:55`), which calls Yahoo Finance (`tools/data-tools.ts:23`). `NewsAnalyst` calls `searchWeb` (`agents/news-analyst.ts:25`). Both catch every error and turn it into report text (`market-analyst.ts:103`, `news-analyst.ts:77`).

**Effect.** A test that only makes `fetch` throw can still pass while the code tries to reach the network. The plan's tests spy on the HTTP boundary and assert zero calls. They also run in a Docker container with `--network=none`, so a hidden call fails at the operating-system level too.

### P11 — Sentiment and fundamentals are placeholders

**Evidence.** `trading-graph.ts:114` and `:124` set fixed strings, for example "No social media analysis performed."

**Effect.** 2 of the 4 analyst slots carry no information. This is reported only.

## Implementation status (2026-10-05)

The source-level integration resolves P1–P6 and P8–P10: opt-in risk debate/judge/Fund Manager, final-state returned signal, strict decision parsing, bound SELL/quantity approval, injectable LLMs, event prompts and no event analyst calls. Risk tests cover BLOCK, REDUCE, rejection, mismatched IDs, malformed sizes and model errors. Eight legacy prompts remain byte-identical.

Third-party proposals select once and require a registered source. Common entry caps and source guards use the selected signal and current account; forecast checks apply only to real forecasts. Red flags reach prompts as advisory text and cannot veto by themselves. Actual paper fills advance portfolio targets one leg at a time.

P7 (the legacy Trader's fixed investment-plan sentence) and P11 (legacy sentiment/fundamental placeholders) remain the plan's explicit non-goals. The new report reaches agents through the added prompt section; this does not repair those legacy stages. Real LLM behavior and app consumption are not validated by scripted fixture tests.
