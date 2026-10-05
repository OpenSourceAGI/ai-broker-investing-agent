# Plan: Integrate the 10 third-party folders into `packages/investing`

**Version 2** (2026-10-05). This version replaces version 1 after a full review. [`../findings/06-plan-revisions.md`](../findings/06-plan-revisions.md) maps every review finding to the change it caused.

- **Paths:** repository-relative, unless they start with `packages/investing/` (written `pi/` below for short).
- **Line anchors:** refer to upstream commit `b877b41`.
- **Evidence:** every factual claim is backed in [`../findings/`](../findings/).
- **Decisions:** the design is [`../design/third-party-bot-integration.md`](../design/third-party-bot-integration.md), and ADRs [0001](../adr/0001-port-vendored-bots-behind-adapters.md) and [0002](../adr/0002-deterministic-risk-gate-overrides-llm.md) record the key decisions. **This plan is the authoritative contract.** Where an older document disagrees, this plan wins, and that document is updated in Phase C.

## Goal

Make every folder in `third-party-trading-bots/` usable from `packages/investing` through the existing agent chain:

```
Analyst → InvestmentJudge (Research Manager) → Trader → risk team → FundManager (Portfolio Manager) → paper execution
```

Each bot's decision logic is ported into a pure TypeScript **source**. The source's output becomes one **selected proposal**. That proposal is debated, risk-checked, approved with a typed quantity, and executed only as approved. A demo with no credentials and no network proves the chain end to end.

## Scope

**In scope**
- **The contract:** a new `strategy-signals` module with the signal envelope, proposals, validation, the report, the risk gate, the execution bridge, and venue and data ports with mocks.
- **Graph changes:** LLM injection, per-run inputs, an opt-in risk stage with typed and binding decisions, event-specific prompts, a strict decision parser, and a returned signal that matches the final state.
- **10 folder integrations, by kind:** 5 strategy bots, 2 agent frameworks, 2 venue SDKs and 1 data layer.
- **One Docker assessment run per folder,** in its own demo or simulation mode.
- **The overview** at `devdocs/third-party-trading-bots-overview.md` (the exact path the task requires), findings docs, README and `.claude` note updates, `THIRD_PARTY_NOTICES.md`, and the PR text.

**No time box.** The task's "3–5 hours" no longer applies (confirmed with the reviewer, 2026-10-05). All 10 folders are required. The only fallback is about whether a port is *possible*: a folder whose logic cannot be separated from its I/O, or whose license evidence is incomplete, ships as an independent implementation or an interface + mock. The reason goes in the overview.

**Non-goals**
- **No real venue, broker or data clients:** no credentials and no live trading.
- **No fix for the broken built package** (see [`../findings/02`](../findings/02-build-packaging-and-tooling.md), B4–B5). The demo and tests run from source modules, and the PR states that this proves nothing about `dist/` or the web app.
- **No change to the 2 API routes or the dashboard.**
- **No fix for the `investmentPlan` fixed sentence** (finding P7).
- **No edits to `third-party-trading-bots/`.** Running a folder in Docker for assessment is allowed; importing it is not.
- **No change to the paper executor's whole-cent price model.** Sub-cent execution is out of scope; sub-cent proposals are rejected at execution with their original price.
- **No execution ledger, portfolio versioning or concurrency control.** Nothing in the package or demo runs concurrently. This is a documented limit for any future live path (decided 2026-10-05).

## Execution environment: everything runs in Docker

Every install, test, type check, build, coverage run, demo and dev-server run happens in a container (decided 2026-10-05). The host only edits files and runs `git`.

| Purpose | Image | Network | Notes |
|---|---|---|---|
| Install | `oven/bun:1.3.11` (the repository's pinned Bun) | on | `bun install` writes only to named volumes |
| Tests, type checks, build, coverage, demo | `oven/bun:1.3.11` | **`--network=none`** | Proves at the OS level that nothing calls the network |
| Root dev server (Step 1b) | `oven/bun:1.3.11` | on, port published on `127.0.0.1` only | Empty environment (`--env-file /dev/null`) |
| Folder assessment, install stage | per language (see Step B0) | on | Staged copy, no secrets |
| Folder assessment, run stage | same image | **`--network=none`** | A run that needs network or credentials is recorded as blocked |

**Common flags:** `--rm --user 1000:1000 --cap-drop=ALL --security-opt no-new-privileges`, a named container, and cleanup with `docker rm -f` on success, timeout and interruption. No host home, Docker socket, `.env` or `.dev.vars` is ever mounted.

**`node_modules`:** the repository is mounted read-write at `/repo`. Each `node_modules` directory is masked by a named volume (`aibroker-nm-root`, `aibroker-nm-investing`, `aibroker-nm-web`, plus any other workspace that has one after install), so container-built native modules never mix with the host's. The host's existing `node_modules` is left untouched.

**Wrapper script:** `devdocs/third-party-integration/harness/run.sh <install|test|tsc|build|coverage|demo|dev> [args]` holds these exact `docker run` lines, so every command in this plan is one reproducible call. Raw logs go to `devdocs/third-party-integration/local/`, which is excluded from git through `.git/info/exclude`.

## Steps

### Phase 0: Baseline in Docker

0. **Harness.** Create `harness/run.sh` and `harness/tsc-diff.sh` (both under `devdocs/third-party-integration/`).
   - **`run.sh` preflight:** first run `id && touch /repo/.harness-ok && rm /repo/.harness-ok` as user 1000, and fail loudly if it fails.
   - **`tsc-diff.sh`:** normalizes `tsc` output to `(file, code, message)` and compares the counts against the list in [`../findings/03-typescript-baseline.md`](../findings/03-typescript-baseline.md). It exits 1 on any identity whose count rose, and prints any count that fell.

1. **Re-run the baseline on the pinned Bun.** Run `run.sh install`, then `run.sh test` (for `investing`, and for the repository root), `run.sh tsc` and `run.sh build`, all with `--network=none` after install.
   - **Record:** update [`../findings/04`](../findings/04-test-and-runtime-baseline.md) with these results, labeled "reference (Docker, Bun 1.3.11)". The earlier host run stays as history.
   - **Type list:** if the `tsc` identities differ from the host list, replace the list in `03` and say why.

1b. **Root dev server.** Run `run.sh dev` with an empty environment.
   - **Timeout:** the script waits up to 180 s.
   - **Record the real result:** use `docker wait` and the container state, not a `tee` exit code. Probe the published URL with `curl`. Then stop the container.
   - **Sanitize the log before saving:** replace values that look like keys or tokens with `[REDACTED]`.
   - **Save to `local/dev-server.log`,** and add the findings (what starts, what fails, which env or binding is missing) to `../findings/02` under B3.

### Phase A: Contract and pipeline (one track, sequential; Phase B depends on it)

All new code lives in `pi/src/strategy-signals/`, unless stated otherwise.

**Import rules (apply to every step):**
- **Types:** cross-module types use `import type`.
- **No barrels:** `trading-agents` imports leaf files from `strategy-signals`, never its barrel.
- **`demo.ts`:** is in no barrel.
- **Runtime APIs:** `strategy-signals` uses no Node built-ins (`node:*`, `fs`, `process`), so it can run on Workers. A test checks this by scanning the sources.

2. **Contract** (`types.ts`). It has these parts:
   - **`Instrument`:**
     - `{ type: 'equity'; symbol }`, or
     - `{ type: 'event'; venue; marketId; outcome?: 'YES' | 'NO' }`.
   - **`NormalizedSignal`** is an envelope built from existing types:
     - **Identity:** `sourceId`, `upstream`.
     - **Kind:** `kind: 'signal' | 'recommendation' | 'order' | 'portfolio'`.
     - **What it is about:** `instrument`.
     - **`TradeSignal` fields:** `action`, `confidence` (0..1), `reasoning`, with the same names and meaning as `TradeSignal` (`pi/src/trading-agents/types/index.ts:174`).
     - **Time:** `asOf` (ISO UTC).
     - **Forecast:** `probability?`, which is **always P(YES)**, and only from a real model estimate.
     - **Order:** `order?`, a `PredictionMarketTradeIntent` (`pi/src/prediction-markets/types.ts:120`), required for `kind: 'order'`.
     - **Portfolio:** `targets?`, required for `kind: 'portfolio'`. Each target is `{ ticker, outcome, quantity, priceCents }`; the first 3 fields come from `PaperPosition`.
     - **Sizing:** `sizing?: { quantity?; limitPriceCents? }`.
     - **Evidence:** `evidence?: Record<string, number | string>`.
     - `toTradeSignal(s)` converts an envelope to the existing `TradeSignal`.
   - **Price precision** (decided 2026-10-05):
     - **Decisions keep full precision.** Strategy-level prices (`limitPriceCents`, target `priceCents`, quotes) are **cents as decimal numbers** and keep upstream precision (for example `49.9`). Strategy decisions use them unrounded.
     - **Execution needs whole cents.** Only an executable order needs whole cents. `toExecutableCents(x)` accepts `x` only if `|x − round(x)| < 1e-9`, which tolerates floating-point noise. Otherwise it rejects with the original value: "sub-cent price 49.9¢ is not executable by the paper executor". It never rounds.
   - **`TradeProposal`:** one concrete candidate trade.
     - **Fields:** `{ proposalId, sourceId, instrument, action: 'BUY' | 'SELL', outcome?, limitPriceCents, quantity, asOf }`.
     - **`proposalId`:** `<sourceId>:<venue|equity>:<marketId|symbol>:<outcome|->:<action>:<asOf>`, which is stable.
   - **`AccountSnapshot`:** the current holdings for the instrument's own scope, passed **per run**.
     - **Event contracts:** `{ kind: 'event'; venue; portfolio: PaperPortfolioState }`.
     - **Stocks:** `{ kind: 'equity'; cashCents; shares: Record<symbol, { quantity; averagePriceCents }> }`.
     - **One scope per venue,** so equal market IDs on different venues never share holdings.
   - **`StrategySource<I>`:** `{ id; upstream; maxSignalAgeMs?; guards?: SourceGuard[]; run(input: I, context: SourceContext): NormalizedSignal[] }`.
     - `SourceContext` is `{ account?: AccountSnapshot; evaluationTime: string }`.
     - `run` is pure: no I/O, no clock, no randomness. Time comes only from `evaluationTime`.
   - **`SourceGuard`:** `(proposal, context, signal) → { maxQuantity?: number; deny?: string }`. These are source-specific risk rules, owned by the source.
   - **Risk types:**
     - `RiskLimits`: `maxPositionPerMarket`, `maxOpenPositions?`;
     - `RiskPosture`: `label`, `sizeMultiplier` (0..1), `allowNewEntries`;
     - `RiskVerdict`: `allowed`, `maxQuantity`, `reasons`, `limits`.
   - **Typed decisions:**
     - `JudgeDecision`: `{ kind: 'PROCEED' } | { kind: 'BLOCK' } | { kind: 'REDUCE'; maxQuantity: number }`;
     - `FundManagerApproval`: `{ decision: 'APPROVE' | 'REJECT' | 'MODIFY'; proposalId; quantity? }`;
     - `ExecutionApproval`: `{ proposal; finalQuantity; verdict; judge; fundManager; reasons }`.
   - **Venue and data types** (keep the upstream fields, finding [05](../findings/05-third-party-bots.md)):
     - `VenueMarket { venue; marketId; title; question?; status: 'open' | 'closed'; closesAt?; outcomes: { outcomeId; label; side: 'YES' | 'NO'; bidCents: number | null; askCents: number | null; tickSizeCents? }[] }`, binary markets only;
     - `VenueAdapter { venue; getMarket(id); placeOrder(intent) }`;
     - `MarketDataProvider { getDailyBars(symbol, from, to): Promise<StockData[]> }`.

3. **Validation** (`validate.ts`). All input is `unknown` until it is checked. The checks run before any field is read.
   - **`validateSignal(x, expected?)`** returns `string[]`. Each of these is an error:
     - not an object;
     - an unknown `kind`, `action` or `outcome`;
     - an empty or untrimmed `sourceId`, `upstream` or `reasoning`;
     - a non-finite `confidence` or `probability`, or one outside [0, 1];
     - an `asOf` that does not parse;
     - an instrument that does not match `expected`, including `outcome` when both sides set it;
     - for `order`: a missing `order`, or an order whose `action`, `ticker` or `outcome` disagrees with the envelope;
     - for `portfolio`: missing or empty `targets`, a duplicate `(ticker, outcome)`, a quantity that is not a safe non-negative integer, or a non-finite `priceCents`;
     - a sizing quantity that is not a safe non-negative integer;
     - a HOLD that carries a positive quantity.
   - **Optional fields** are validated only when present.
   - **`validateLimits`, `validatePosture`** (multiplier in [0, 1]) and **`validateAccount`** (non-negative safe-integer cash, quantities and prices) guard the configuration the same way.
   - **`partitionValidSignals(xs, expected, evaluationTime, source)`** returns `{ valid, rejected[] }`. It also rejects signals whose `asOf` is after `evaluationTime` (future), or older than `source.maxSignalAgeMs` (stale).

4. **Report** (`report.ts`).
   - **`toStructuredReport(valid, rejected): StructuredReport`** (`pi/src/trading-agents/types/index.ts:93`):
     - `summary` holds the counts per action;
     - `findings` has one line per signal, sorted by `sourceId`, then `asOf`;
     - `recommendations` holds the agreeing actions;
     - `confidence` is High, Medium or Low, from the mean confidence at thresholds 0.75 and 0.5;
     - `data` holds the evidence, orders and targets.
   - **`formatStructuredReport`** turns it into deterministic text.
   - **`renderStrategySignalsReport`** composes the two. With no signals, it returns `"No third-party strategy signals."`.

5. **Proposal selection** (`proposal.ts`). `selectProposal(decision, valid, context) → { proposal } | { reportOnly: reason }`. It is called **once** per run, and both the gate and execution use its result.
   - **Order of choice:** among the signals whose `action` agrees with the Trader's decision, take the highest confidence. Ties go to the lowest `sourceId`, then the latest `asOf`, then the lowest `proposalId`.
   - **Conversion by kind:**
     - **`order`:** the proposal comes from the order's fields.
     - **`signal` or `recommendation` with `sizing.limitPriceCents` and `sizing.quantity`:** a proposal, with the outcome from the instrument or `evidence.outcome`.
     - **Without a price or quantity:** `reportOnly: 'direction-only signal'`. The report keeps it; it is never silently dropped.
     - **`portfolio`: one leg at a time** (finding C4 in [06](../findings/06-plan-revisions.md)). Compute each target's delta against `context.account`. The proposal is the **first** leg with a non-zero delta, in the order the source listed them. Already-satisfied targets give `reportOnly: 'target already held'`. A later run recomputes from the new holdings, so the hedge advances only from real fills.
   - **Stocks with no signal:** a stock decision may proceed without any strategy signal, as decided. In that case the proposal comes from the decision itself. Its quantity is set by the gate, and its price is set at execution preflight (Step 8).
   - **Closed markets:** a market whose `closesAt` is not after `evaluationTime` gives `reportOnly: 'market closed'`.

6. **Risk gate** (`risk-gate.ts`). `applyRiskGate(proposal, context, limits, posture, source) → RiskVerdict`.
   - **Common checks** run for every source:
     1. **Exits:** a SELL is allowed up to the held quantity, and exits are never blocked by entry rules or posture. A BUY needs `posture.allowNewEntries`.
     2. **Position cap:** `maxPositionPerMarket − held`.
     3. **Cash:** `floor(cashCents ÷ price)`, using the **current** account snapshot. For stocks, the price is checked at preflight.
     4. **Open positions:** `maxOpenPositions` when it is set.
     5. **Posture:** multiply by `posture.sizeMultiplier` and floor.
     6. **Zero:** a final quantity of 0 means not allowed.
   - **Source guards** run next, from `source.guards`. The tightest cap wins, and any `deny` blocks. Forecast checks are guards on forecast sources only. A market price is never treated as a forecast.

7. **Graph changes** (`pi/src/trading-agents/`).
   1. **LLM injection** (`utils/llm-client.ts`):
      - add `export interface LLMClient { invoke(input: string | Message[]): Promise<LLMResponse> }`, and make `UnifiedLLMClient implements LLMClient`;
      - every agent constructor takes `LLMClient`, a type-only change;
      - add `utils/scripted-llm.ts`: `ScriptedLLMClient`, with rules matched on a role phrase unique to each prompt. An unmatched prompt throws. Every call is recorded as `{ rule, prompt }`.
   2. **Legacy prompt fixtures.** Before any prompt edit, run the graph with `selectedAnalysts: []` and a recording client on fixed inputs. Save every prompt to `pi/test/strategy-signals/fixtures/legacy-prompts/*.txt`. Step 7.4's compatibility test compares against these byte for byte.
   3. **Constructor options.** Add `options: { llm?: { deep; quick }; riskReview?: boolean; riskLimits?: RiskLimits; riskPosture?: RiskPosture } = {}` as the 4th parameter. Per-run data does **not** go in the constructor.
   4. **`propagate(companyName, tradeDate, run?)`.** The new optional argument is `run: { instrument?; strategySignals?; account?; evaluationTime?; event?: VenueMarket; sources?: Record<id, StrategySource> }`.
      - **Without `run`:** the behavior and every prompt are byte-identical to today, except for the decision-parser fix.
      - **With an event instrument:**
        - the Market and News Analysts are skipped, and each report says "Not applicable for an event contract.";
        - Bull, Bear, Trader, the risk debaters and the Fund Manager get **event prompt variants**: the market question and title, the selected outcome and its meaning, the P(YES) convention, the quote, the closing time, and the fixture evidence;
        - absent information is stated as absent, never invented;
        - no company-growth or valuation instructions appear.
      - **Stocks with signals:** the existing prompts plus one line with the strategy-signals report.
   5. **Strict decision parser** (finding P4 in [01](../findings/01-agent-pipeline.md)):
      - `parseFinalLine(text, marker, allowed)` finds the **last** line that contains the marker;
      - it strips only `*`, `_` and backticks, and trailing `.` or `!`;
      - it accepts the payload only if it is exactly one allowed token, and otherwise returns `null` with a reason;
      - if several marker lines hold different valid tokens, it returns `null`.
      - `extractDecision` uses it with `FINAL TRANSACTION PROPOSAL:` and `{BUY, SELL, HOLD}`. A `null` result means HOLD.
   6. **Risk stage** (when `riskReview` is on and the decision is not HOLD):
      1. Call `selectProposal` once.
      2. Run the risk debaters (Risky → Safe → Neutral, one round). The proposal is shown in their prompts.
      3. **`RiskJudge`** (new, `agents/risk-judge.ts`) must end with `RISK DECISION: PROCEED`, `RISK DECISION: BLOCK` or `RISK DECISION: REDUCE <whole number>`. It is parsed with `parseFinalLine`. A malformed, missing, fractional, negative or NaN cap, or any model error, counts as **BLOCK**, with the reason.
      4. `applyRiskGate`.
      5. **`FundManager`** sees the proposal (with its `proposalId`), the verdict and the judge's decision. It must end with `PROPOSAL ID: <id>`, `DECISION: APPROVE|REJECT|MODIFY` and `APPROVED QUANTITY: <whole number>`. APPROVE and MODIFY require a quantity. A mismatched ID, a missing or invalid quantity, or a model error counts as REJECT. Approval follows the proposal's own action, so SELL works (finding P5).
      6. **Final quantity:**
         - it is `min(proposal.quantity, verdict.maxQuantity, judge REDUCE cap, Fund Manager quantity)`;
         - BLOCK, REJECT, a denied verdict or a 0 quantity gives HOLD;
         - otherwise the result is stored as `state.approval: ExecutionApproval`.
   7. **Returned signal** (finding P3). After all stages, build the returned `TradeSignal` from `state.finalTradeDecision`, and log the state only then. The response shape stays the same.
   8. **Exports:** `trading-agents/index.ts` adds `risk-team`, `fund-manager`, `risk-judge`, `scripted-llm` and `LLMClient`.

8. **Execution bridge** (`execution.ts`). Execution consumes **only** `state.approval`.
   - **Events:** `toPredictionMarketIntent(approval)` builds one intent from the approved proposal, with `finalQuantity`. It requires `toExecutableCents(limitPriceCents)`. It checks that the venue in the approval matches the `MockVenue` it is sent to.
   - **Stocks:**
     - `toEquityOrder(approval, lastClose)` gives `{ symbol, qty, side, type: 'market', time_in_force: 'day' }`;
     - the **affordability preflight** reduces `qty` to what the current cash buys at `lastClose`, and to 0 stops it;
     - orders go to an `EquityOrderClient`, which has the same `createOrder` shape as `createAlpacaClient()` (`pi/src/alpaca/client.ts:16`).
   - **Mocks:**
     - `venues/mock-venue.ts`: one `InMemoryPaperExecutor` per venue. BUY fills at `askCents` and SELL at `bidCents`. A missing side is rejected unless the fixture supplies a complementary quote, which is documented as synthetic.
     - `venues/mock-equity-broker.ts`: fills market orders at the fixture's last close. It exposes `snapshot(): AccountSnapshot` and rejects a SELL beyond the held shares.
   - **Rejections:** a rejected fill changes nothing, and the reason is returned.

9. **Reference source: `kalshi-momentum`** (`sources/kalshi-momentum.ts`).
   - **Input:** `{ ticks; config? }`.
   - **Input contract:** one ticker; strictly increasing timestamps; duplicate timestamps rejected; empty input gives a HOLD signal with reason "no ticks"; each tick validated as in `kalshi-momentum.ts:47-55`.
   - **Behavior:** build the direction history from ticks `0..n-2` without fills. Take the position from `context.account` (`<ticker>:<outcome>` key, `pi/src/prediction-markets/execution/paper.ts:16-17`). Evaluate only the last tick.
   - **Output:**
     - BUY or SELL becomes `kind: 'order'`, with the strategy's own intent;
     - HOLD becomes a `signal`;
     - there is no `probability`;
     - confidence = `momentumThreshold ÷ lookback`, stated in `reasoning`;
     - there are no forecast guards.
   - **Fixtures:**
     - `entry-yes`;
     - `fresh-entry-price` (`[50,51,52,53,55]` from flat → BUY YES at 55¢);
     - `held-no-reentry` (same ticks, holding 10 YES at 53¢ → HOLD);
     - `exit-held` (holding 10 YES at 53¢, last tick 58¢ → SELL);
     - `hold-flat`;
     - `mixed-tickers` (rejected);
     - `out-of-order` (rejected);
     - `empty` (HOLD).

10. **Demo** (`demo.ts`, plus `pi/examples/strategy-signals-demo.ts` and the `demo:strategy-signals` script).
    - **Flow:** fixture market → `VenueMarket` → source → validation → report → graph (scripted LLM, `riskReview: true`) → approval → `MockVenue` fill → updated account.
    - **Return value:** the full trace, including both account snapshots.
    - **Two consecutive runs:** a BUY, then (with new ticks and the updated snapshot) a SELL.

11. **Barrel.** `strategy-signals/index.ts` uses an **explicit** export list: `types`, `validate`, `report`, `proposal`, `risk-gate`, `execution`, `venues/*`, `data/*` and `sources/kalshi-momentum`. It must not include `demo`, and it must not re-export a name that `src/index.ts` already exports. `src/index.ts` adds `export * from "./strategy-signals"` after line 32.

12. **Notices.** Create `pi/THIRD_PARTY_NOTICES.md` with the PyKalshi momentum entry: the upstream path, the vendored blob hash from `git rev-parse b877b41:third-party-trading-bots/kalshi-bot-api/examples/momentum_bot.py`, and the full MIT text. Add it to `pi/package.json` `files`. Check with `run.sh pack` (`bun pm pack --dry-run`) that it is in the tarball.

### Phase B: The other 9 folders (3 independent tracks, after the Phase A commit)

Each track works in its own git worktree, branched from the Phase A commit, and follows the per-folder workflow below. The same workflow is packaged step by step in [`../skills/integrate-trading-bot/SKILL.md`](../skills/integrate-trading-bot/SKILL.md). A gitignored copy at `.claude/skills/integrate-trading-bot/SKILL.md` must stay identical to it.

**Ownership.** Each track creates only the files listed in its rows, plus its own tests (`pi/test/strategy-signals/<source-id>*.test.ts`), goldens (`.../golden/<source-id>-*.json`) and fixtures (`pi/src/strategy-signals/fixtures/<source-id>/`). It may also **append** export lines to `strategy-signals/index.ts`; that is the only shared file it may edit. It must not edit Phase A files, shared docs, the demo or another track's files. A track that needs a Phase A change stops and reports it. Each track **returns**, and does not write: its overview section, its assessment result, its `THIRD_PARTY_NOTICES` entry and its PR note. The integrating track writes those in Phase C.

**Per-folder workflow:**
- **B0, assessment run in Docker** (`harness/assess.sh <folder> <id>`):
  1. **Stage:** copy the folder to `local/bot-runs/<id>/src` with `rsync`, excluding `.env*`, `*.pem`, `*.key`, `*.p12`, `id_*`, `credentials*`, `secrets*` and `.git`. No file contents are read.
  2. **Preflight:** a trivial write as user 1000.
  3. **Install stage:** network on; `timeout 900`; writable `/work` with `HOME`, `XDG_CACHE_HOME`, `PIP_CACHE_DIR`, `CARGO_HOME` and `npm_config_cache` under `/work`; a Python venv where needed.
  4. **Run stage:** `--network=none`, `timeout 600`, the folder's own simulation, paper or demo mode only, with no credentials.
  5. **Cleanup:** named containers, a cid file and `docker rm -f` on every exit.
  6. **Record** in `local/bot-runs/<id>/run.md`: the exact image digest, the commands, a separate exit status for each stage, and the outcome, which is one of `ran` / `credential-blocked` / `needs-network` / `no-demo-mode` / `unsupported-runtime` / `harness-failure` / `bot-failure`.
  7. **SDK and data folders:** a documented import or example run is enough.
  8. **Reference outputs** from a successful run may become goldens, with a `source.md` that names the run.
- **B1, license gate:** assemble the full notice (holder and text) for the vendored revision. If it cannot be assembled, use an independent implementation (no translated code), and say so.
- **B2, port, adapter, guards and tests,** as in the rows below. Golden expectations come from the upstream run (B0), from the upstream's own tests, or from hand-reviewed values, **never** only from the new code.

| Track | Folder | Source ID and files | Must preserve (see [05](../findings/05-third-party-bots.md)) | Must test |
|---|---|---|---|---|
| 1 | `Kalshi-Vibe-Bot` | `kalshi-vibe`: `sources/kalshi-vibe.ts`, `sources/kalshi-vibe-guards.ts` | P(YES) from recorded model output; edge and AI minimums (5 points, 60 %) and ceilings (22, 90 %); 26¢ floor; calibration block; **full Kelly** with the 5 % ceiling and the small-account fallback; NO side uses `1 − P(YES)` | YES and NO fills; negative and low edge; minimum AI; NO-side Kelly; small bankroll |
| 1 | `kalshi-bot-api` (PyKalshi) | `kalshi-venue`: `venues/kalshi-venue-mapping.ts` | separate, nullable yes/no bid/ask | independent YES/NO quotes; null quote; mapped market used by `MockVenue` in a filled run |
| 1 | `polymarket-exec-api` (pmxt) | `pmxt-venue`: `venues/pmxt-venue-mapping.ts` | `outcomeId`, `label`, sub-cent `tickSize`; reject non-binary or unknown labels | sub-cent quote (decision kept, execution rejected); non-binary rejected; mapped market used in a run |
| 2 | `poly-bot-gabagool` | `gabagool`: `pi/src/prediction-markets/strategies/gabagool.ts`, `sources/gabagool.ts` | `kind: 'portfolio'` targets, ordered so the next leg comes first; next-leg price limit = `maxSumAvg − actual average cost of the other side`; 0.499 threshold kept exactly | first leg fills; waiting for the other side; second leg rejected; later completion; already satisfied; gate-reduced leg; 49.8/49.9/50.0¢ boundaries |
| 2 | `Polymarket-BTC-15-Minute-Trading-Bot` | `btc15m-fusion`: `pi/src/prediction-markets/strategies/btc15m-fusion.ts`, `sources/btc15m-fusion.ts` | weights; a tie is bullish; actionable at score ≥ 60 and confidence ≥ 0.6; the 5-minute window measured from `evaluationTime`, not the wall clock (documented correction); guard for $1 per position, $10 exposure and 5 positions; drawdown and daily-loss limits listed as not ported | bullish and bearish fills; tie; unknown direction; no recent signals; window boundary at exactly 5 minutes |
| 2 | `Prediction-Markets-Trading-Bot-Toolkits` | `copy-trade-sizing`: `pi/src/prediction-markets/strategies/copy-trade-sizing.ts`, `sources/copy-trade-sizing.ts` | `size_for_trade` (`src/service/strategy.rs:26,74`); dollar notional → whole contracts `floor(notional × 100 ÷ priceCents)`; below 1 contract → no order | the Rust file's own test cases (`:120-150`); adaptive and rounding boundaries |
| 3 | `ai-hedge-fund` | `hedge-fund-technicals`: `sources/hedge-fund-technicals.ts` | the 5 signal groups and the helpers RSI (rolling means), Bollinger, EMA, ADX, ATR, Hurst (`technicals.py:160-523`), with the exact window, EMA-adjust and variance conventions | short and flat series; zero variance; references from the upstream Python run; combined score at ±0.2 |
| 3 | `debate-agents` | `red-flags`: `sources/red-flags.ts` | **independent** implementation; **advisory** `recommendation` only, never a veto (decided 2026-10-05) | each rule; advisory effect visible in the report, not in the gate |
| 3 | `poly-bot-openclaw` | `survival-posture`: `pi/src/strategy-signals/survival-posture.ts` | start in SURVIVAL; 3-tick hysteresis; CRITICAL immediate; recovery transitions; **new** multiplier table (Growth and Survival 1.0, Recovery 0.75, Defensive 0.5, Critical 0 with entries blocked; exits always allowed), documented as new policy | third tick; interrupted pending change; immediate critical; recovery sequence |
| 3 | `fin-data-api-python` (OpenBB) | `openbb-data`: `data/openbb-mapping.ts` | rows sorted ascending; duplicate dates rejected; null volume → `0` with a `missingVolume` count; sources that use volume refuse when any is missing | null volume; out of order; duplicate; mapped bars feed the stock run |

### Phase C: Merge, demo, documents

13. **Merge** the tracks in order 1, 2, 3, and run the full verification after each merge.
14. **Extend the demo.** Add:
    - one run per event source, including Vibe YES and NO, BTC bullish and bearish, and the gabagool sequence across several runs;
    - one stock run with fixture bars from the OpenBB mapping, a BUY then a SELL, with zero network attempts;
    - one Defensive-posture run.
15. **Overview** at `devdocs/third-party-trading-bots-overview.md`.
    - **Opening:** a concise summary table, one row per folder.
    - **Per folder, every item the task's Step 2 names:** kind; format; language and runtime; entry points; inputs and outputs; data providers, exchanges and broker APIs; credentials, environment variables and services; license evidence; completeness and incompatibilities; reuse directly vs. adapter.
    - **Per folder, also:** the assessment outcome; what was ported vs. mocked vs. implemented independently; and the path into `packages/investing`.
    - **Two more sections:** "Monorepo setup and blockers" (Step 1b) and "How to add another bot".
    - **Wording:** keep "assessment run succeeded", "port operational" and "mock only" clearly apart.
16. **Docs:**
    - add a README section "Third-party strategy signals" to `pi/README.md`;
    - update `.claude/packages/investing/CLAUDE.md` (the layout row and the public surface);
    - complete `THIRD_PARTY_NOTICES.md`;
    - bring the design, the ADRs, the findings and the workflow in `../skills/` in line with what was built, then copy the workflow to `.claude/skills/integrate-trading-bot/SKILL.md`, so both copies are identical.
17. **PR text** (drafted in `local/pr-description.md`, never committed). Cover:
    - motivation first;
    - the task's 7 items, with truthful per-folder results;
    - findings 01–05;
    - test and coverage numbers, with the skip count;
    - the limits: source-level only, no `dist/` or app consumption, and no Workers runtime test (the pure modules use no Node APIs, but that is not proven on Workers);
    - next steps.

    No AI attribution.

## Data / Schema / Config Changes

- **Additive public API:** the optional 4th constructor parameter, the optional `run` argument to `propagate`, and optional `AgentState` fields (`instrument`, `strategySignals`, `strategySignalsReport`, `proposal`, `riskVerdict`, `judgeDecision`, `approval`).
- **Behavior changes for existing callers:**
  - **The strict decision parser.** It only removes false BUYs.
  - **The returned signal now matches the final state.** Without `riskReview`, nothing changes after the Trader, so the two still agree.
- **Packaging:** `THIRD_PARTY_NOTICES.md` is added to the published `files`.
- **Script:** `demo:strategy-signals`.
- **Nothing else:** no new dependencies, no environment variables and no database changes.

## Verification

All of this runs through `harness/run.sh` in Docker, offline after install.

| Level | Test | Failure it catches |
|---|---|---|
| E2E | `demo.e2e.test.ts`: two consecutive demo runs (BUY, then SELL) | A chain that only looks connected; a hidden network call; a wrong portfolio |
| Integration | `graph-risk-stage.test.ts`: cover gate denial → HOLD in **both** `state` and the returned `signal`; judge BLOCK + Fund Manager APPROVE → no fill; REDUCE 3 + Fund Manager 8 → at most 3; MODIFY 2 → 2; SELL approval; Fund Manager REJECT; mismatched `proposalId`; malformed, fractional, negative or NaN quantities; a model error | Findings P3, P5, P6; an LLM overriding a limit |
| Integration | `graph-compat.test.ts`: no `run` → every recorded prompt equals the legacy fixtures byte for byte | Breaking the 2 API routes |
| Integration | `graph-event-routing.test.ts`: event prompts contain the fixture question and outcome and no stock instructions; no analyst call | Event debated as a company |
| Integration | `proposal-binding.test.ts`: YES and NO signals on one market; an order whose nested fields disagree; equal-confidence ties; the same market ID on 2 venues; the executed identity, price and quantity equal the approved proposal | Executing something other than what was approved |
| Integration | `portfolio-sequential.test.ts`: the gabagool leg sequence; cash and holdings after each step | Atomic-hedge assumptions; fictitious positions |
| Integration | `equity-execution.test.ts`: BUY then SELL through `MockEquityBroker`; the affordability preflight; zero network | Stock path gaps |
| Integration | `mappings.test.ts`: raw PyKalshi, pmxt and OpenBB fixtures → mapping → the mock used in a filled run | Mappings never consumed |
| Golden | one per source, with provenance per golden | Port drift |
| Unit | `parse-final-line.test.ts`: the 16 decision cases (see below), plus the risk-judge and Fund Manager lines. String grammar has many edge cases, and a unit test is the cheapest level that lists them. | Bug P4 and its two failed regex fixes |
| Unit | `risk-gate.test.ts`: one test per threshold: position cap; cash for 0 and for less than 1 unit; open-position limit; posture 0.5 and blocked entries; SELL without a holding; a source cap tighter than the common cap. Threshold math has many boundaries, and the repository requires one pinned test per threshold. | A loosened guard; off-by-one |
| Unit | `validate.test.ts`: null; missing fields; empty arrays; duplicate legs; unknown enums; Infinity or NaN; unsafe integers; negative limits; invalid multipliers; zero quantities; future and stale timestamps | Bad input reaching an order path |
| Unit | `precision.test.ts`: `toExecutableCents` for 50, 50.0000000001, 49.9, 0.1 + 0.2 style noise | Rounding a strategy boundary into an order |
| Unit | `no-node-apis.test.ts`: scans `strategy-signals/**` for `node:`, `fs` and `process` | Code that breaks on Workers |

**Decision-parser cases:**

| Input | Expected |
|---|---|
| `**BUY/HOLD/SELL**` | HOLD |
| `**BUY / HOLD / SELL**` | HOLD |
| `BUY \| SELL \| HOLD` | HOLD |
| `BUYER` | HOLD |
| `BUY_foo` | HOLD |
| `BUY2` | HOLD |
| `BUY because momentum` | HOLD |
| `**SELL**` | SELL |
| lowercase `buy` | BUY |
| `BUY.` | BUY |
| `**HOLD**.` | HOLD |
| `**BUY` (unbalanced emphasis is tolerated) | BUY |
| the template echoed first, then `**SELL**` | SELL |
| a valid BUY, then the echoed template | HOLD |
| a BUY line, then a SELL line (contradictory) | HOLD |
| no proposal line | HOLD |

Every input except the last two is the payload after `FINAL TRANSACTION PROPOSAL:`. A prototype of this rule passed all 16 cases.

**Network proof:**
- **OS level:** every test runs with `--network=none`.
- **In code:** spies on `fetch` and the search and Yahoo clients assert **zero calls**, even where an analyst would catch the error (finding P10).

**Type checks:**
- `run.sh tsc` runs `tsc -p tsconfig.json` and the new `tsconfig.test.json` (covering `test/**` and `examples/**`).
- Each result is passed through `tsc-diff.sh`.
- **Pass** means no new diagnostic identity or occurrence. The exit code is captured, but it is not the gate.

**Commands** (all through `run.sh`):

| Command | Must give |
|---|---|
| `test` | investing tests pass |
| `test-root` | all workspaces pass, or a pre-existing failure is recorded with evidence |
| `tsc` | `tsc-diff` clean |
| `build` | exit 0; this is not evidence of a working `dist/` |
| `coverage` | reports coverage for `strategy-signals/**` and the changed graph files, plus the skip count |
| `demo` | the trace, in this order: signals → report → proposal → Trader → risk debate → judge → verdict → Fund Manager → approval → fill → snapshot |
| `pack` | `THIRD_PARTY_NOTICES.md` is in the tarball |

## Commit Checkpoints

Local commits at these points were approved on 2026-10-05. They use gitmoji + conventional style. Nothing is pushed without an explicit instruction.

1. `🔧 chore(devdocs): add docker harness and baseline` (Phase 0)
2. `✨ feat(investing): add strategy-signals contract and risk gate` (Steps 2–6)
3. `🐛 fix(investing): parse final decisions strictly and bind approvals` (Step 7.5–7.7)
4. `✨ feat(investing): wire risk review and LLM injection into graph` (rest of Step 7)
5. `✨ feat(investing): add kalshi momentum source and pipeline demo` (Steps 8–12)
6. One commit per Phase B track, then `📝 docs: add third-party bots overview and findings` (Phase C)

## Risks & Rollback

| Risk | Likelihood | Impact | Mitigation / Rollback |
|---|---|---|---|
| A new type error hides among the 86 existing ones | M | M | `tsc-diff.sh` compares identities and counts |
| A green build is taken as proof | H | M | Findings B4–B6; source-only claims in the PR |
| A port drifts from upstream semantics | M | H | Per-folder "must preserve" lists; goldens from upstream runs or tests |
| An assessment run harms the machine or leaks a secret | L | H | Staged copy without secret files; offline run stage; no host mounts; cleanup on every exit |
| Incomplete license evidence | M | H | B1 gate; independent implementation fallback |
| The scripted LLM hides prompt bugs | M | M | Byte-identical legacy fixtures; event prompt assertions |
| A track needs a Phase A change | M | M | The track stops and reports; the change is made once, on the main track |
| Rollback | — | — | Each checkpoint is one commit. Revert the specific commits with `git revert`, or rebuild in a clean worktree from `upstream/main`. Switching branches does not discard untracked files, so check `git status` first. |

## Resolved Decisions

All dated 2026-10-05.

1. Local commits at the checkpoints are approved; push only on instruction.
2. Sources get the real holdings through a per-run `AccountSnapshot`. The momentum source evaluates only the latest tick.
3. `probability` is always P(YES), from real model estimates only. NO-side checks use its complement.
4. Stock BUYs need no signal or price for direction. Affordability is checked at execution preflight.
5. No time box. All 10 folders.
6. The broken `dist/` build is reported only.
7. Gaps from the task re-check, all adopted:
   - Docker assessment runs;
   - the root dev-server run;
   - envelopes composed of existing types;
   - the full overview fields;
   - a portfolio-kind source (gabagool);
   - mock stock execution;
   - a coverage report.
8. Red flags are advisory input, not a veto.
9. RiskJudge BLOCK forces HOLD. REDUCE gives a whole-number cap that the Fund Manager may lower further.
10. Common cash and position caps apply to every source. Forecast checks apply only where a real forecast exists.
11. Decision prices keep their precision. Executable prices must be whole cents and are never rounded.
12. Openclaw multipliers: Growth and Survival 1.0, Recovery 0.75, Defensive 0.5, Critical 0 with entries blocked. Exits are always allowed.
13. Gabagool emits portfolio targets and executes one leg at a time, from actual fills.
14. Execution ledger, portfolio versioning and concurrency control are deferred and documented as a limit.
15. All installs, tests and runs happen in Docker on the pinned Bun image, with container-only `node_modules`.
16. The plan ships in the PR. The review baseline, logs and PR draft stay local.
17. Build workflow (changed during the build): the three Phase B tracks ran in this checkout instead of separate worktrees, and all changes stay uncommitted until reviewed. This replaces the worktree and checkpoint-commit mechanics above.
