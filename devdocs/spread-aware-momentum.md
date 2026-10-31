# Spread-aware momentum

The existing PyKalshi port enters after three consecutive last-trade price moves. That is a useful candidate generator, but three rising prints do not say whether the current ask is worth crossing. This change keeps that bot's rules and adds a quote-based entry filter inside `packages/investing`.

## What was reused

- Vendored reference: `third-party-trading-bots/kalshi-bot-api/examples/momentum_bot.py` (Python, PyKalshi 0.3.6).
- Existing deterministic port: `src/prediction-markets/strategies/kalshi-momentum.ts`.
- Existing normalized source: `src/strategy-signals/sources/kalshi-momentum.ts`.
- Existing Kalshi market mapping, trading graph, risk gate, Fund Manager review and mock venue.

Paths beginning with `src/`, `test/` or `examples/` below are relative to `packages/investing`.

The native Python entry helper was also invoked offline with three rising directions. It selected 10 YES contracts at a 52c reference price. The object was constructed with `__new__`, bypassing the client constructor, and socket connections were blocked. This checks the selected entry rule, not the SDK's network/authentication loop. The runnable integration uses the existing TypeScript port; it does not start Python or import a vendored service.

The broader bot inventory remains in [third-party-trading-bots-overview.md](third-party-trading-bots-overview.md). Its historical assessment is separate from this change. Other bots were not newly installed or made operational here. They add dependencies and provider requirements without helping answer this narrower question.

## Indicator definition

Use the last five timestamped YES bid/ask midpoints, retaining half-cent values. Let `d` be their successive changes, and `M` the last midpoint minus the first.

```text
efficiency = abs(M) / sum(abs(d))              # zero when the path is flat
movementScale = sqrt(sum(d * d))
cost = selected outcome's full spread + costAllowanceCents
residual = max(0, abs(M) * efficiency - cost)
score = sign(M) * residual / max(1 cent, movementScale + cost)
```

The path-efficiency term penalizes reversals. The full spread is a conservative round-trip hurdle at current quotes; the allowance is an additional configurable fee/slippage reserve. The root-sum-square term scales the score by observed movement. It is not a statistical volatility forecast. Sample frequency changes the score, so a deployment must choose a consistent feed cadence.

The existing bot must first propose BUY. A YES entry then requires `score >= 0.5`; a NO entry requires `score <= -0.5`. Orders use the selected outcome's own ask. NO quotes are supplied explicitly, never inferred from YES prices. A disagreement between last-trade direction and midpoint direction produces HOLD.

Example: midpoints `[40, 43, 46, 49, 52]`, a 2c spread and a 1c allowance give efficiency 1, movement scale 6c, cost 3c, and score `(12 - 3)/(6 + 3) = 1`. Widening that spread to 12c makes the residual zero.

Confidence is `abs(score)/(1 + abs(score))`, a bounded ranking score. No `probability` is emitted: this is not P(YES), an expected return, or a claim of indicator originality or profitability. The default window, threshold and allowance are design choices, not fitted parameters.

## Pipeline and failure behavior

```text
PyKalshi momentum port -> quote filter -> NormalizedSignal
  -> existing bull/bear research -> Research Manager -> Trader
  -> risk review and cash/position limits -> Fund Manager -> MockVenue
```

The graph registers the source as `kalshi-spread-aware-momentum`. Its structured report includes movement, efficiency, movement scale (`noiseCents`), spread, cost, score and threshold. Signals keep the observation timestamp, allowing the graph to reject them if consumed late.

- Default maximum quote age and maximum gap between window observations: 60 seconds each, inclusive.
- Missing quotes, insufficient history, excessive gaps and weak scores produce HOLD. Mixed markets, duplicate/out-of-order/future timestamps and invalid/crossed prices throw validation errors.
- The original bot's exits are preserved, using actual account holdings. An exit uses that outcome's bid and bypasses the entry score/window requirements. Freshness and executable-bid checks still apply.
- Exit triggers still use the upstream last-trade rules. They are not a new executable-bid P&L stop system.
- Existing portfolio limits, cash checks and approvals remain authoritative. A scripted Trader insisting on BUY cannot turn a filtered HOLD into a proposal.

Configure indicator settings through `createSpreadAwareMomentumSource({...})`; the input's optional `config` retains the upstream bot configuration. The new code adds no dependencies or environment variables.

## Run it

With the repository dependencies already installed, from the repository root:

```bash
cd packages/investing
bun run demo:spread-aware-momentum
npm exec -- vitest run test/strategy-signals test/kalshi-momentum-agent.test.ts test/prediction-market-research.test.ts
```

The demo disables `fetch`, uses synthetic quotes and injects scripted model responses. It prints a comparison table followed by the actual graph stages, evidence, proposal, risk result, approval, fill and portfolio snapshots. It does not require keys, a broker account, a running web app, or model access. Model responses demonstrate orchestration rather than independent research.

Each scenario starts with 10,000c and no holdings:

| Scenario | Original candidate | Filtered action | Paper result |
|---|---|---|---|
| Sustained rise, 2c spread | BUY YES | BUY YES | 10 at the 53c ask; cash 9,470c |
| Same rise, 12c spread | BUY YES | HOLD | No order; cash unchanged |
| Noisy path ending in three rises | BUY YES | HOLD | No order; cash unchanged |
| Quotes aged 80 seconds | BUY YES | HOLD | No order; cash unchanged |
| Sustained fall, 2c spread | BUY NO | BUY NO | 10 at the 53c NO ask; cash 9,470c |

The original-candidate column is a signal comparison, not an executed baseline or a performance benchmark. The mock venue does not deduct the cost allowance as a fee; it is only an entry hurdle. It has no queue, depth, partial-fill or latency model.

## Verification and existing blockers

Verified on Windows with Node 24.15.0 and Bun 1.3.11, against base commit `a45226d290c8835a6a2f27ba6bd5070f20769f6a`:

- 403 tests passed across 31 relevant test files, including 14 new indicator/integration cases.
- New indicator and adapter: 100% line coverage and 93.97% branch coverage in the focused V8 run.
- Demo completed with network calls disabled. Integration tests confirm YES/NO fills, unchanged portfolios on HOLD, a subsequent exit using filled holdings, and rejection of a forced BUY against a filtered signal.
- Two existing test portability failures reproduced on untouched source: URL `.pathname` produced an invalid Windows path, and CRLF fixture text differed from JavaScript template newlines. The tests now use `fileURLToPath` and normalize fixture newline encoding; prompt content remains checked.
- Source type checking still reports 76 pre-existing diagnostics. The test/example scope reports 67. Both were compared against an untouched archive using the same dependencies; no new diagnostics remain (absolute checkout paths normalized).
- Package build is blocked by existing dependency resolution: current checkout reports a missing LangChain export; untouched archive also fails, at an unresolved `jszip` import through `grab-url`. A successful package build or published-package import is not claimed.

Ordinary npm installation first hit conflicting LangChain peer ranges, then the Linux/macOS-only `xgboost_node` package. For these scoped Windows checks, installation was:

```bash
cd packages/investing
npm install --force --ignore-scripts --workspaces=false --package-lock=false --no-audit --no-fund
```

This bypasses platform/peer checks and leaves native install scripts unrun. It supports these source-level checks; it does not establish a working full monorepo or native XGBoost runtime. No dependency declarations or lockfiles were changed. The demo also ran via `npm exec --yes --package=bun@1.3.11 -- bun run demo:spread-aware-momentum`.

Next work would be an out-of-sample replay with recorded timestamped quotes, real fee schedules and explicit fill assumptions, comparing candidate counts and outcomes against the unchanged momentum bot. That evidence should determine whether this entry filter is useful before any live execution work.
