# Third-party bot integration

This folder holds the design, decisions, findings, plan and tooling for integrating the vendored projects in `third-party-trading-bots/` into `packages/investing`. The task's required overview lives one level up, at [`../third-party-trading-bots-overview.md`](../third-party-trading-bots-overview.md), now delivered with the build.

| Folder | Contents |
|---|---|
| [`plans/`](plans/) | The implementation plan (version 2). **This is the authoritative contract.** |
| [`design/`](design/) | The design brief: components, the contract, and the per-folder integration map |
| [`adr/`](adr/) | Architecture decision records: [0001](adr/0001-port-vendored-bots-behind-adapters.md) (port instead of run) and [0002](adr/0002-deterministic-risk-gate-overrides-llm.md) (deterministic gate overrides LLM decisions) |
| [`findings/`](findings/) | Evidence-backed findings about the codebase and the vendored projects, plus the plan revision log |
| [`skills/`](skills/) | `integrate-trading-bot`: the step-by-step workflow for porting one more bot |
| `harness/` | Docker wrapper scripts for installs, tests, type checks, assessment runs and the dev server. Delivered in plan Phase 0. |
| `local/` | Run logs, bot-assessment outputs and drafts. Excluded from git. |

## Findings index

| Doc | Topic |
|---|---|
| [01](findings/01-agent-pipeline.md) | The agent pipeline: stages never called, decision-parsing bugs, unenforced approvals, stock-only prompts |
| [02](findings/02-build-packaging-and-tooling.md) | Build and packaging: broken subpath exports and root import, type errors, the `dev` script, notices |
| [03](findings/03-typescript-baseline.md) | The source and expanded test/example pre-existing type diagnostics and comparison rule |
| [04](findings/04-test-and-runtime-baseline.md) | Test, build and package-consumer baseline results |
| [05](findings/05-third-party-bots.md) | The 10 vendored folders: kinds, licenses, stubs, and semantics a port must keep |
| [06](findings/06-plan-revisions.md) | How the plan changed after the baseline and the review, finding by finding |

## Delivered verification

All ten contributions are consumed by the source-level offline demo. Investing tests: 350 passed / 13 skipped, both in Docker and directly on the host. Root tests: five workspace tasks passed. Both type scopes introduce no new diagnostics; existing errors remain. Scoped V8 coverage: 96.59% statements/lines, 86.35% branches, 94.69% functions. Build/demo/pack exit 0, with source-only package limitations recorded in findings 02/04. Root dev was attempted and is not fully operational.

The three Phase B tracks were built in this checkout rather than in separate worktrees, and the changes were left uncommitted for review (decided 2026-10-05). A local PR draft records task coverage and the actual blockers.
