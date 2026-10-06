# Plan revisions: version 1 → version 2

The implementation plan ([`../plans/third-party-bot-integration.md`](../plans/third-party-bot-integration.md)) went through a baseline run and two review rounds before any code was written. This document records what each review found and what changed in the plan as a result. It is kept so that a reader can see *why* the plan looks the way it does.

## Round 1: baseline run

These results came from a first run of the existing package. The evidence is in [04](04-test-and-runtime-baseline.md).

| Finding | Change to the plan |
|---|---|
| The first decision regex parsed `**BUY/HOLD/SELL**` and `BUYER` as BUY | A lookahead was added. Round 2 showed this was still not enough (see C7). |
| Subpath exports and the built root entry are broken | Report only. The demo and tests import source modules. |
| 86 pre-existing type errors | The type gate compares diagnostic identities and counts, not raw totals |
| `investing` has no `dev` script | Recorded as a blocker for the task's Step 1 command |
| Replaying momentum ticks with assumed fills can repeat an old BUY, or end on a SELL the pipeline cannot execute | Sources now read the real holdings, and the momentum source evaluates only the latest tick |
| Importing the source barrel loads a native module and runs `dotenv` | New code and tests import leaf modules only |

## Round 2: full review of the revised plan

The review found **7 critical, 12 major and 2 minor** issues. All but one major item were adopted in full. M4 was adopted in part, as recorded below.

### Critical

| ID | Finding | Change in version 2 |
|---|---|---|
| C1 | The returned `TradeSignal` was built before the risk stage, so a denied trade could still be returned as BUY | The returned signal is built from the final state, after all approvals |
| C2 | Risk-judge BLOCK/REDUCE and the Fund Manager's size were prose, never enforced | Typed `JudgeDecision` and `FundManagerApproval`, parsed strictly. The final quantity is the minimum of all caps. Anything malformed means no approval. |
| C3 | Event `signal` outputs (Vibe, BTC) had no path to execution | `selectProposal` turns every priced signal into one concrete proposal. A direction-only signal stays report-only, with a reason. |
| C4 | "Two fills or none" was promised for gabagool, but the executor fills one order at a time and upstream builds the hedge from actual fills | Portfolio targets execute **one leg per run**, recomputed from real holdings. An incomplete hedge is reported. |
| C5 | Approval was not bound to the exact proposal; the NO-side edge math was wrong; venues shared holdings | One selection per run, bound by `proposalId` through gate, judge, Fund Manager and execution. P(YES) is complemented for NO. There is one account scope per venue. |
| C6 | Sizing ignored current cash; the Vibe minimums and full Kelly, and the BTC limits, were missing | Common checks use the current snapshot. Source-specific guards carry Vibe's and BTC's own rules. |
| C7 | The second regex still read `BUY / HOLD / SELL` (with spaces), `BUY \| SELL \| HOLD`, `BUY_foo` and a later malformed line as BUY | A strict last-line parser that accepts exactly one token. A prototype passed 16 cases. |

### Major

| ID | Finding | Change in version 2 |
|---|---|---|
| M1 | The stock demo still called Yahoo and web search; the stock holdings had no shape | Stock runs use fixture bars (from the OpenBB mapping), and an `AccountSnapshot` covers stocks too |
| M2 | Validation did not cover malformed shapes or configuration | Everything is validated as `unknown` first: enums, nested consistency, unique targets, safe integers, limits, posture and account |
| M3 | Forcing integer cents everywhere would round away real strategy boundaries (0.499, sub-cent ticks) | Decisions keep full precision. Only execution needs whole cents, and it rejects anything else rather than round it. |
| M4 | Freshness, input order and repeated execution were unspecified | **Adopted:** evaluation time as input; freshness and future-data rejection; one ordered market per input; defined empty input; a per-run snapshot; stable proposal IDs. **Deferred and documented as a limit:** an execution ledger, portfolio versioning, concurrency control. |
| M5 | The Docker recipe could fail before reaching a bot | A tested harness: preflight; writable paths and caches; a venv; separate install and run stages with time limits; cleanup; outcome categories |
| M6 | The network and secret limits were stated, but no command enforced them | A staged copy without secret files; an offline run stage; an empty environment for the dev server; sanitized logs |
| M7 | Venue and data mappings dropped fields, and nothing consumed them | Both quote sides and outcome IDs are kept, and unsupported shapes rejected. Each mapping feeds a filled run. |
| M8 | The numeric semantics of the ports were underspecified | Per-folder "must preserve" lists, and goldens from upstream runs or tests |
| M9 | Verification could pass without proving the behavior | Zero-call spies; an offline container; byte-identical legacy prompts; type checks for tests and examples; an identity-based type gate; root tests |
| M10 | The linked documents and the track ownership contradicted each other | The plan is the authoritative contract; exact source IDs and files per track; tracks return document content instead of editing shared docs |
| M11 | License evidence was thin, and notices would not ship | A license gate per folder; `THIRD_PARTY_NOTICES.md` in the published files, checked in the tarball |
| M12 | Event contracts would be debated with stock prompts | Event-specific prompt variants; stock prompts unchanged |

### Minor

| ID | Finding | Change in version 2 |
|---|---|---|
| N1 | Several line anchors were wrong (taken from a concatenated read), and the toolkit stub count was 8, not 7 | All anchors corrected; "advisory" wording for red flags |
| N2 | Bun version drift; vague rollback wording | All runs use `oven/bun:1.3.11`; rollback by reverting specific commits |

## Other decisions recorded on 2026-10-05

- **Docker:** everything runs in Docker. Containers use their own `node_modules`.
- **Red flags** are advisory, not a veto.
- **Risk-judge decisions:** BLOCK forces HOLD; REDUCE gives a cap that the Fund Manager may lower further.
- **Openclaw demo multipliers:** 1.0 / 1.0 / 0.75 / 0.5 / 0. These are new policy, not upstream behavior.
- **Gabagool:** keeps portfolio targets, with one leg per run.
- **Repository layout:** our documents live under `devdocs/third-party-integration/`. The required overview stays at `devdocs/third-party-trading-bots-overview.md`, and the upstream `devdocs/` files are not moved.

## Build decisions and implementation clarifications

The build workflow changed on 2026-10-05: **the changes stay uncommitted for review, and the three tracks ran in this checkout instead of separate worktrees.** Track ownership stayed bounded, and the integrating track completed the consolidation and the shared docs. There were no merges between worktrees, because none were created.

The following reversible clarifications were needed to realize the plan:

1. The base Bun image lacks real Node/native build prerequisites; a derived pinned image adds them. All source is credential-excluded staging, never a direct mount of host dependencies.
2. Executable third-party proposals require their source registry entry, preventing omitted source guards. Report-only input still reaches the agents.
3. Account average entry prices can be fractional because the existing executor computes weighted averages of whole-cent fills. Strategy and account arithmetic preserve that value; only executable individual prices require integer cents.
4. Expanding type checks to every test/example reveals pre-existing failures outside the original source baseline. An untouched `b877b41` comparison reproduced 77 test-scope diagnostics; the full 77-diagnostic reference is recorded separately in 03 (including 12 additional test/example occurrences), with no suppression of new diagnostics. Each configuration uses its own exact baseline rather than a union.
5. The demo returns thrown execution rejections in its trace and keeps the account unchanged, so sequential hedging can show the rejected leg and subsequent actual fill.
6. Root dev's HTTP 200 is Financial Data API, not proof of the web app; MCP registration and browser opener failures are recorded separately.

The graph also validates malformed signal collections before iteration; null, object and string inputs are recorded as rejected and return event HOLD without approval. Regression cases cover each shape.

All plan deliverables were built and checks run. Remaining dist/package, Workers, ledger/concurrency and legacy analyst gaps are the plan's documented non-goals, not deferred implementation steps.
