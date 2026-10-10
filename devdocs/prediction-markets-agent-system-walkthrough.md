# Momentum paper replay: system walkthrough

This contribution follows the shared strategy-signal pipeline introduced in PR #200.
It adds a reviewed, sequential momentum replay; it does not add another graph,
FundManager, risk subsystem or strategy implementation.

## Goal and development history

The original assignment was to assess vendored trading projects and make one
strategy usable through the investing package, with a reproducible paper demo.
The local checkout at b877b41 already had the PyKalshi momentum port, synchronous
replay, paper executor, binary intent types and 15 momentum tests.

The work began with read-only inspection of Git state, manifests, AGENTS guidance,
source/tests, exports, developer documentation and all ten vendored projects.
Bun 1.3.11 was used, following the root packageManager declaration. Installation
initially failed on network connections; a lower-concurrency retry succeeded.
Existing Windows native-module and package TypeScript problems were recorded.

The first local solution supplied StructuredReport research to the old graph.
An architecture review identified that its Trader output still lacked final
FundManager approval. An opt-in review was added, preserving BUY/SELL and YES/NO
and leaving the executor authoritative. That original completed checkout remains
separate from this contribution.

Before PR submission, upstream main had advanced to 15f7409 and merged PR #200.
It already supplied normalized signals, event-specific prompts, risk review,
proposal-bound FundManager decisions and execution approvals. This follow-up
therefore uses those existing contracts, keeps the current graph/manager
implementations unchanged, and preserves upstream package versions, notices,
overview and other strategy sources.

## Why momentum was selected

PyKalshi's vendored momentum example has small deterministic rules, an available
MIT notice and a clean boundary between price observations and a trade intent.
Its existing TypeScript port required no Python subprocess or exchange access.
It was the best fit for the assignment's scope, licensing, architecture and
credential-free reproduction. No profitability comparison established it as the
best trading strategy.

The other projects were assessed for runtime, entry points, dependencies, services,
credentials, inputs/outputs and reuse/license considerations. Their full
service/wallet lifecycles were not part of the local momentum integration.
The current repository's [vendor overview](./third-party-trading-bots-overview.md)
contains the upstream assessment and broader integrations; this follow-up does
not overwrite it.

The preserved license is
[the strategy MIT notice](../packages/investing/src/prediction-markets/strategies/kalshi-momentum.LICENSE).
The upstream source is the vendored PyKalshi momentum example, identified by its
manifest as [ArshKA/pykalshi](https://github.com/ArshKA/pykalshi).

## Units and binary semantics

Ticks carry ticker, timestamp and integer YES price in cents, from 0 through 100.
This simple replay assumes NO price = 100 - YES price. Real executable bids/asks
need not be complementary.

Action describes BUY, SELL or HOLD. Outcome identifies YES or NO.
SELL YES closes YES holdings and never silently becomes BUY NO.
Buying NO follows falling YES prices without shorting YES.

Cash is also cents; quantities are whole contracts. Decimal dollars such as
0.53 are rejected as tick prices rather than guessed to mean 53 cents.

## The algorithm

For each price after the first, record direction:

```text
up   -> +1
down -> -1
flat ->  0
```

The first tick establishes a reference price. At most lookback directions are
retained. A flat move breaks a consecutive streak, and movement magnitude does
not affect the directional count.

When flat, the latest momentumThreshold directions must all be +1 to propose
BUY YES, or all -1 to propose BUY NO. Otherwise the result is HOLD.
The default threshold of three requires four observations, such as 50,51,52,53.

When holding a position, compute P&L per contract using the held outcome's
current price. Exit conditions, in priority order, are:

1. Gain reaches profitTargetCents.
2. Loss reaches stopLossCents.
3. The latest two directions oppose the held outcome.

Two falling YES observations oppose a YES holding; two rising observations
oppose a NO holding. An exit sells the currently held quantity of that outcome.
There is only one decision per tick; closing a position does not also open an
opposite position on that tick.

| Setting | Default | Purpose |
| --- | ---: | --- |
| lookback | 5 | Direction history capacity |
| momentumThreshold | 3 | Consecutive directions for entry |
| positionSize | 10 | Requested entry contracts |
| profitTargetCents | 5 | Exit gain per contract |
| stopLossCents | 3 | Exit loss per contract |
| maxPosition | 50 | Combined YES/NO limit per market |
| initialCashCents | 10,000 | Default replay cash |

Strategy settings must be positive safe integers; threshold cannot exceed
lookback. A requested size above the limit produces HOLD. Initial cash may be
zero but must be a nonnegative safe integer.

This is a deterministic direction-following algorithm, not a trained model or
a forecast of the event's true probability.

## Complete runtime flow

```text
recorded tick
 -> evaluateKalshiMomentumTick
 -> PredictionMarketTradeIntent
 -> StructuredReport evidence in existing NormalizedSignal
 -> TradingAgentsGraph
 -> Bull/Bear research (three rounds)
 -> InvestmentJudge
 -> Trader
 -> existing Risky/Safe/Neutral analysis and RiskJudge
 -> existing deterministic risk gate
 -> existing proposal-bound FundManager
 -> existing ExecutionApproval
 -> adapter confirms unchanged intent or returns HOLD
 -> existing InMemoryPaperExecutor
 -> applyMomentumExecution reconciles actual inventory
```

The adapter registers the existing kalshiMomentumSource and supplies event
instrument identity, original order, evaluation time and the current event
account snapshot through the graph's existing per-run context. It does not call
a live market provider or start a vendored bot.

predictionMarketResearch returns the existing StructuredReport shape with the
intent, cash, positions and equity. It is serialized into NormalizedSignal
evidence, which the current graph carries to research and approval prompts.

Recorded event inputs bypass inappropriate stock-data analysis. The existing
event-specific graph prompts supply the research context. InvestmentJudge
provides the research-manager decision; BUY still needs its explicit INVEST
approval. SELL is an exit, reviewed by Trader and the existing risk/portfolio path.

The demo enables the current graph's riskReview option and injects recorded
LLM responses through GraphOptions.llm. The existing pipeline includes three
risk perspectives and RiskJudge; no new RiskDebateFacilitator flow is added.

FundManager approves an exact proposal using its existing typed protocol:

```text
PROPOSAL ID: <the selected proposal ID>
DECISION: APPROVE
APPROVED QUANTITY: 10
```

The adapter calls the existing execution bridge to validate the resulting
approval and compares action, outcome, market, quantity, price and timestamp
instant against the original intent.

For this replay, explicit APPROVE of the unchanged intent is required when
fundManagerReview is true. REJECT, malformed/missing approval, wrong identity,
MODIFY and a changed/reduced quantity yield HOLD. Upstream supports bounded
resizing for other callers; this replay deliberately preserves the original
intent instead. No upstream resizing policy is weakened or rewritten.

If the upstream risk gate denies a proposal, FundManager is not consulted.
If it caps a ten-contract intent to nine, this adapter holds instead of executing
nine silently. The final executor can still reject an approved intent when its
actual account constraints differ from the review snapshot.

## Shared APIs and state

- runKalshiMomentumPaperAgent: synchronous strategy/paper replay without research.
- runKalshiMomentumPaperAgentWithResearch: same replay generator with an async
  callback for actionable intents.
- reviewPredictionMarketIntent: normalize into existing graph context, review,
  and optionally require explicit unchanged typed FundManager approval.
- runKalshiMomentumResearchDemo: recorded model/ticks and the full existing
  approval pipeline.

To enable the complete path, construct the existing graph with riskReview: true
and inject the recorded model through its existing llm options. The adapter's
fundManagerReview flag requires that approval to be present; it does not
reconfigure an arbitrary supplied graph.

HOLD ticks do not call the model. An actionable approved tick invokes six
research contributions, InvestmentJudge, Trader, three risk perspectives,
RiskJudge and FundManager: thirteen recorded model calls.

Strategy state contains bounded history, previous YES price, ticker/time
provenance, optional position and filled-execution count. The final result
includes raw ticks/intents, review signals, actual execution results, snapshots,
final portfolio and a readable report. Two fills are two executions, not two
completed round trips.

## Validation and state consistency

A replay requires nonempty input, one market, explicit-timezone ISO timestamps
and strictly increasing instants. Equivalent timezone-offset spellings of one
instant are duplicates. The adapter converts time to UTC for upstream's existing
signal contract but retains the original intent for paper execution.

Resumed strategy and portfolio holdings must match market, outcome, quantity and
cost basis. Old history without market/time provenance is rejected.
Input snapshots are cloned; caller-owned holdings are not mutated.

The executor validates orders and enforces actual cash, combined market limits
and named-outcome inventory. A rejected BUY must not create a strategy position.
A rejected or vetoed SELL must not clear owned inventory or buy the opposite
outcome. Filled partial position exits leave remaining strategy inventory aligned
with the executor's actual portfolio.

Both public replay entries drive the same generator, so a reviewed tick executes
once. Resumed chronology prevents replaying an already processed observation.
There is no durable ledger or universal order-ID idempotency.

Exceptions from a custom review callback propagate before the affected intent
executes. No partial replay result is returned, and no external order is placed.
The upstream model/risk stages may instead fail closed to HOLD under their
existing policies.

## Portfolio calculations and worked demo

BUY cost = quantity × price in cents; cash decreases by that cost.
An increased holding uses weighted average entry cost.
SELL proceeds = quantity × sale price; realized P&L = quantity ×
(sale price - average entry cost).

Marking updates unrealized P&L without trading:
equity = cash + sum(quantity × current outcome mark price).
Cost basis may contain fractional cents after multiple buys.

| YES tick | Strategy | Execution | Cash cents | Holding |
| ---: | --- | --- | ---: | --- |
| 50 | HOLD: first reference | SKIPPED | 10,000 | None |
| 51 | HOLD: one rise | SKIPPED | 10,000 | None |
| 52 | HOLD: two rises | SKIPPED | 10,000 | None |
| 53 | BUY YES 10 | APPROVE -> FILLED | 9,470 | 10 YES at 53 |
| 58 | SELL YES 10: target reached | APPROVE -> FILLED | 10,050 | None |

The purchase costs 530 cents. The sale returns 580 cents.
Realized profit is 10 × (58 - 53) = 50 cents.
Final cash/equity is $100.50, realized P&L is $0.50 and no position remains.
Descending YES prices 50,49,48,47,42 exercise BUY NO / SELL NO equivalently.

The demo prints research, Trader, RiskJudge, proposal ID, FundManager decision,
approved quantity, execution result and final portfolio. Its small fixture profit
does not establish expected market returns.

## Running and testing

From the repository root with Bun 1.3.11:

```sh
bun run --cwd packages/investing demo:kalshi-momentum
```

From the investing package directory:

```sh
bun run test test/kalshi-momentum-agent.test.ts test/prediction-market-research.test.ts test/prediction-markets-exports.test.ts test/strategy-signals/kalshi-momentum.test.ts test/strategy-signals/graph-risk-stage.test.ts
bun run test
bun run build
node scripts/verify-prediction-market-build.mjs
```

The demo has no keys or services. The verifier forbids fetch, imports actual
built ESM/CommonJS subpaths, runs research/approval/paper execution and compares
the packaged MIT notice with the vendored original.

Validation on Windows for this follow-up:

| Check | Result |
| --- | --- |
| Targeted compatibility tests | 126 passed |
| Full investing tests | 425 passed, 13 skipped, two baseline failures |
| Build and built ESM/CommonJS execution | Passed |
| Strict changed-core check | Passed |
| Package TypeScript baseline comparison | 86 upstream / 86 current; zero new diagnostics |
| Test-project TypeScript baseline comparison | 77 upstream / 77 current; zero new diagnostics |

The two unchanged upstream failures are graph-compat's CRLF fixture versus LF
prompt comparison and no-node-apis' URL.pathname handling on Windows.
The pre-change baseline also failed the root export suite on native XGBoost.
The task's export-wiring test isolates that unrelated native module; it does not
make the runtime work on Windows. No investing lint script is configured. The repository Docker harness could not
run because the local Docker Linux engine was not running.

Package-wide type checking still fails, and Vite emits existing declaration
diagnostics. The comparison uses identical dependencies/configuration with
tracked HEAD sources substituted in memory; tests/examples are also checked for
new diagnostics. No root-wide, Linux, hosted-provider or Workers success is claimed.

## Packaging and scope

Vite now emits the already-declared prediction-market and trading-agent subpath
entries. Their CommonJS targets use .cjs, with automatic external interop.
The strategy's full MIT notice is emitted into dist/prediction-markets.
Other unrelated package exports are not redesigned.

No new dependency, competing lockfile, portfolio class, live executor or source
adapter registry is introduced. Upstream graph, FundManager, risk code, package
version and other bot integrations remain intact.

See [the local PR description](./prediction-markets-agent-pr-description.md),
[the strategy](../packages/investing/src/prediction-markets/strategies/kalshi-momentum.ts),
[the replay](../packages/investing/src/prediction-markets/agents/kalshi-momentum-agent.ts),
[the graph adapter](../packages/investing/src/prediction-markets/adapters/trading-agents.ts),
[the paper executor](../packages/investing/src/prediction-markets/execution/paper.ts)
and [the recorded fixture](../packages/investing/examples/fixtures/kalshi-momentum-research.ts).

## Limitations and next steps

Recorded responses demonstrate orchestration, not independent market research.
The fixed 0.75 confidence is not a calibrated probability. Directional momentum
can lose in choppy markets, and tick-driven stops do not guarantee an exact exit
price. No profitability ranking or historical/out-of-sample study was performed.

Paper fills are immediate at complementary prices; fees, spread, slippage,
depth, latency, partial order fills, settlement and resolution are absent.
A partial position sale is supported but is not a liquidity simulation.

Replay is single-market and in-memory. Graph/account use must be serialized;
the upstream path's current-snapshot and concurrency limitations remain.
Kalshi live mapping remains unimplemented. No real trades or external market
services were invoked.

Further work should use measured recorded data, fees/spread and domain review
evaluation before making performance claims. Persistence and live execution
would require separate requirements and operational work.
