---
name: integrate-trading-bot
description: Port a third-party trading bot, agent framework, venue SDK, or data layer into packages/investing behind the strategy-signals contract, so its output flows through the TradingAgentsGraph pipeline. Use when adding or integrating any bot from third-party-trading-bots/ (or a new outside bot), writing a StrategySource, SourceGuard, venue mapping, or data mapping, or when asked to "integrate", "wire up", or "port" a trading bot.
---

# integrate-trading-bot

Turn one outside project into a tested source, mapping or posture inside `packages/investing`. The project is **never imported or edited**. It is run **once, in Docker, for assessment only**. Its decision logic is ported to pure TypeScript, or implemented independently when its license evidence is incomplete.

**The authoritative contract** is the implementation plan, `devdocs/third-party-integration/plans/third-party-bot-integration.md`, at Steps 2–9 and Phase B. If this workflow and the plan disagree, follow the plan. The evidence behind every rule is in `devdocs/third-party-integration/findings/`.

## Hard rules

1. **Never edit or import `third-party-trading-bots/`** (`.claude/CLAUDE.md`, rule 5).
2. **Never loosen a risk guard,** widen a cap, or drop a validation to make a test pass.
3. **Sources are pure:** no network, no file I/O, no clock and no randomness. Time comes only from `context.evaluationTime`. No Node built-ins (`node:*`, `fs`, `process`) in `strategy-signals/`.
4. **Every command runs in Docker** through `devdocs/third-party-integration/harness/run.sh` or `assess.sh`, never on the host.
5. **Precision:**
   - strategy prices are decimal cents, kept exactly as upstream (for example `49.9`);
   - only the execution bridge requires whole cents, and it rejects anything else without rounding;
   - `probability` is always P(YES), and only from a real model estimate, never from a market price.
6. **Ownership:** create only your track's files, plus `pi/test/strategy-signals/<id>*`, `.../golden/<id>-*` and `pi/src/strategy-signals/fixtures/<id>/` (where `pi/` = `packages/investing/`). Appending export lines to `strategy-signals/index.ts` is the only shared edit allowed. Do **not** edit Phase A files, the demo, the overview or other shared docs; return their content instead (Step 8).

## Step 1 — Classify

| Kind | Signs | Deliverable |
|---|---|---|
| Strategy | Turns market data into trade decisions | A `StrategySource` (and `SourceGuard`s for rules specific to this strategy) |
| Agent framework | Analysts, debates, a portfolio manager | One deterministic analyst or scorer → a `StrategySource` with `kind: 'recommendation'` |
| Venue SDK | Market, order and order-book models | A mapping `from<Name>Market(raw) → VenueMarket`, used by `MockVenue` in a filled run |
| Data layer | Price or news fetchers | A mapping `→ StockData[]`, used by `FixtureDataProvider` in a run |
| Risk logic | Sizing rules, gates, drawdown states | `SourceGuard`s, or a `RiskPosture` function |

Use the source ID and file names that the plan's Phase B table assigns to this folder.

## Step 2 — Survey (read only)

Record each of these facts for the overview:
- **license evidence** (Step 3);
- **format** (standalone script, service, package, Docker, Python, Node or Rust project), language and runtime;
- **entry points**;
- **inputs and outputs**, with units;
- **data providers, exchanges and broker APIs**;
- **credentials, environment variables and external services**;
- **what is outdated, incomplete or a stub**, and what clashes with Bun, Turbo or Workers;
- **whether it can be reused directly** or needs an adapter.

Then find the **decision core**: the smallest code that turns inputs into a decision. Also list the details that change decisions (thresholds, tie rules, windows, rounding, numeric conventions). The plan's "must preserve" column lists the ones already known.

## Step 3 — License gate

1. Find the exact notice for the vendored revision: the copyright holder and the full license text. Get the vendored file's hash with `git rev-parse b877b41:third-party-trading-bots/<path>`.
2. **Complete notice:** translation is allowed, and the notice goes into `THIRD_PARTY_NOTICES.md`.
3. **Incomplete notice** (a badge or metadata only, or no license): **implement independently**, from the observed behavior and your own reasoning, with no translated code. Say so in the overview.

## Step 4 — Assessment run in Docker

Run `bash devdocs/third-party-integration/harness/assess.sh <folder> <source-id> <image> '<install command>' '<offline run command>'`. The five arguments are required; choose the project's actual safe entrypoint. The script does all of this:
1. **Stage:** copies the folder without `.env*`, keys, credentials or `.git`, and reads no file contents.
2. **Preflight:** a trivial write as user 1000.
3. **Install stage:** network on, a time limit, writable `HOME` and caches under `/work`, and a venv for Python.
4. **Run stage:** `--network=none`, a time limit, the folder's own simulation, paper or demo mode only, and no credentials.
5. **Cleanup:** removes the containers on every exit.

**Record the outcome** in `devdocs/third-party-integration/local/bot-runs/<id>/run.md`. It is one of `ran`, `credential-blocked`, `needs-network`, `no-demo-mode`, `unsupported-runtime`, `harness-failure` or `bot-failure`. Never invent a working demo. For SDK and data folders, a documented import or example run is enough. A successful run's outputs may become reference goldens; add a `source.md` that names the run.

## Step 5 — Port and adapt

- **Prediction-market strategy logic:** goes in `pi/src/prediction-markets/strategies/<name>.ts`. Follow the existing `kalshi-momentum.ts`: a typed config with defaults, `normalize…Config`, input validation, and a pure `evaluate…`.
- **The adapter:** goes in `pi/src/strategy-signals/sources/<id>.ts`:

```ts
import type { NormalizedSignal, StrategySource } from '../types'

export const exampleSource: StrategySource<ExampleInput> = {
  id: 'example',
  upstream: '<folder>/<path>:<function>',
  maxSignalAgeMs: 5 * 60_000,          // if the upstream has a freshness window
  guards: [exampleGuard],              // rules specific to this strategy only
  run(input, context) {
    // 1. Validate the input contract: one market, ordered, no duplicates; empty → HOLD with a reason.
    // 2. Read the current holdings from context.account; never assume past orders filled.
    // 3. Evaluate the latest input only, at context.evaluationTime.
    return [{
      sourceId: 'example', upstream: '…', kind: 'order',
      instrument, action, confidence, reasoning, asOf,
      order,                              // a real PredictionMarketTradeIntent for kind 'order'
      evidence: { /* the numbers behind the decision */ },
    } satisfies NormalizedSignal]
  },
}
```

**Mapping rules:**
- **`kind`:** `order` carries a real `PredictionMarketTradeIntent`. `portfolio` carries `targets: { ticker, outcome, quantity, priceCents }[]`, in the order the legs should fill; execution takes one leg per run. `signal` and `recommendation` may carry `sizing: { quantity, limitPriceCents }`; without executable sizing, event signals stay report-only. A stock direction can be priced later at execution preflight.
- **`confidence`:** if the upstream has none, derive it with a stated, deterministic rule, and explain it in `reasoning`.
- **Registration:** supply the source in `run.sources` for any executable third-party proposal. Missing registration must deny execution rather than silently omit guards. Pass the exact selected signal to the gate.
- **Forecast checks** (edge, AI probability, calibration, forecast-based Kelly) are `SourceGuard`s on forecast sources only. For NO, use `1 − P(YES)`. Common cash and position checks already run for every source; do not repeat them.
- **Venue mappings:** keep both quote sides, outcome IDs and tick sizes. Reject non-binary or unknown markets.

## Step 6 — Test

| Test | What it covers |
|---|---|
| **Golden** | Each fixture → a reviewed `golden/<id>-<case>.json`. Expected values come from the upstream run (Step 4), the upstream's own tests, or hand-reviewed numbers. **Never** from the new code alone. |
| **Edge cases** | Every case in the plan's "Must test" column for this folder |
| **Validation** | A malformed fixture is rejected without crashing |
| **Guards** | One test per threshold, pinning the number |
| **Consumer** | Mappings and sources are used in a run that reaches an approved paper fill, or a recorded report-only reason |

## Step 7 — Verify (all in Docker)

```bash
devdocs/third-party-integration/harness/run.sh test       # offline
devdocs/third-party-integration/harness/run.sh tsc        # passes only if tsc-diff shows no new diagnostic identity/occurrence
devdocs/third-party-integration/harness/run.sh build      # exit 0 is not proof of a working dist/
```

The package has 86 pre-existing source diagnostics and 77 in the full test/example scope (`findings/03`). Compare each scope by diagnostic identity and occurrence, and reproduce any newly exposed baseline failure against untouched upstream. Do not expect a clean compiler exit; expect a clean `tsc-diff`. A failed compiler with no parseable diagnostics must fail the gate.

## Step 8 — Return, don't write

Return these in your final report. The integrating track writes them into the shared files:
1. **The overview section** for this folder, with every Step 2 field, plus: the assessment outcome; ported vs. independent vs. mocked; and the path into `packages/investing`.
2. **The `THIRD_PARTY_NOTICES.md` entry,** or a note that the code was implemented independently.
3. **One PR note line:** what was evaluated, what is operational, and what could not run and why.
4. **Any Phase A change you needed** (only listed; you do not make it).

## Done checklist

- [ ] Kind, source ID and files as in the plan
- [ ] License gate passed, or independent implementation used
- [ ] Assessment run attempted in Docker, outcome recorded
- [ ] Pure source; holdings from context; latest input only; evaluation time from context
- [ ] Precision kept; P(YES) convention; guards only where they belong
- [ ] Golden (independent expectations), edge, validation, guard and consumer tests pass
- [ ] `tsc-diff` clean; build exits 0
- [ ] Overview section, notice entry and PR line returned

## Delivered harness and account conventions

The implementation image derives from Bun 1.3.11 and adds real Node/Python/native build prerequisites. All runtime checks use a credential-excluded staged checkout, container-only dependency volumes, UID 1000, dropped capabilities and offline networking. The host only edits, inspects Git and orchestrates Docker. Assessment installs alone may use network; raw commands/digests/results remain local.

Actual account weighted-average costs may be fractional even when individual fills are whole cents. Preserve those averages for sequential hedge limits. Unsupported executable prices are rejected without changing holdings. The demo records execution rejection reasons in its trace. Refresh current snapshots and serialize runs; ledger/version/concurrency checks are outside this integration.

Follow the active user's workflow over plan checkpoint mechanics. This build used three default-model subagents in one checkout, leaving everything unstaged/uncommitted. No worktrees or checkpoint commits were created.
