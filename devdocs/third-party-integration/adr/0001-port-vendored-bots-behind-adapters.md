# ADR 0001: Port vendored bots behind adapters instead of running them

**Status:** Accepted
**Date:** 2026-10-05
**Design brief:** [`devdocs/design/third-party-bot-integration.md`](../design/third-party-bot-integration.md)

## Context

`third-party-trading-bots/` holds 10 vendored projects in Python, TypeScript, JavaScript and Rust. The task is to make them usable from `packages/investing` and its agent pipeline. There are two ways to do that:

1. **Run the bots unchanged.** Start each bot as a subprocess or HTTP service, capture its output, and convert that output in a wrapper.
2. **Port the decision logic.** Re-implement each bot's decision core in TypeScript inside `packages/investing`, behind one adapter contract.

Four facts constrain the choice:

- **The repo forbids importing or editing the vendored code.** `.claude/CLAUDE.md` rule 5 says the folder is prior art: "do not edit it, import from it, or fix its lint". Turbo never builds it.
- **The package has to run everywhere.** `packages/investing` runs on Cloudflare Workers as well as in Node and Bun scripts. Workers cannot start subprocesses or run Python or Rust.
- **Running the bots unchanged has a high cost.** Most bots expect live venue credentials, wallets, Redis, or paid APIs to start at all. That would make a credential-free demo and deterministic tests impossible.
- **There is a precedent.** PR #199 already ported the PyKalshi momentum strategy this way, and the maintainer merged it.

## Decision

1. Each selected decision core is ported to a pure TypeScript function inside `packages/investing` when a complete notice exists, or implemented independently from its behavioral contract when notice evidence is incomplete.
2. A `StrategySource` adapter maps the function's output to `NormalizedSignal`.
3. The SDKs and the data layer (PyKalshi, pmxt, OpenBB) become typed interfaces (`VenueAdapter`, `MarketDataProvider`). Each ships with a mock implementation only.
4. The vendored folders stay untouched.
5. Each folder is run **once, for assessment only**: in its own simulation or demo mode, inside a throwaway Docker container, with no credentials. This records its real runtime, entry points, blockers and sample outputs for the overview and the fixtures. Nothing in `packages/investing` ever starts or calls a bot at runtime.

## Consequences

**Benefits**
- The new pure modules avoid Node APIs and run in the offline Bun harness. Workers runtime compatibility is a design constraint; no Workers runtime test was performed.
- Adapters are pure functions, so golden-fixture tests and the demo are deterministic and need no credentials.
- Core agents depend on one contract, not on any bot or venue.

**Costs and risks**
- **Porting effort:** each bot costs work to port, more for large strategies (the Rust toolkit, the NautilusTrader bot).
- **Drift:** a port can drift from the upstream. Each port names its upstream file and function, and golden fixtures come from upstream examples or tests where possible.
- **Upstream changes are not picked up automatically.** A port must be updated by hand.
- **Only the decision core is ported.** Upstream features outside it (dashboards, schedulers, live streaming) are not available through `packages/investing`.

**Rejected alternative**
- **Subprocess or HTTP wrapper around the running bots.** It breaks repo rule 5 in spirit. It cannot run on Workers. It needs each bot's toolchain and credentials on every machine that runs the pipeline.

## Implementation evidence

Five folders completed selected native component/import/simulation runs. pmxt/BTC were runtime-blocked, Gabagool has no safe demo mode, the Rust mock CLI still needs network, and the hedge-fund backtester requires interactive input. Each has an operational fixture-based TypeScript contribution despite those native limitations; see the overview.

The harness derives from pinned Bun and adds real Node/native build prerequisites. Source is staged without secrets, and container-only dependency volumes keep host node_modules out of all runs. Dist/subpath imports remain broken upstream. No full live bot, app consumption or published-package consumption is claimed.
