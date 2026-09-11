# CLAUDE.md — AI Broker Investing Agent

Orientation for Claude agents working in this repository. Read this first; the
detailed notes live in [`.claude/architecture/`](.claude/architecture/) and are
linked from each section below.

A **Bun + Turborepo monorepo**. Multi-agent trading research — LLM analyst
agents that debate a position, algorithmic entry/exit signals, copy-trading
leaderboards and prediction-market arbitrage — shipped as one Next.js app on
Cloudflare Workers at [autoinvestment.broker](https://autoinvestment.broker).

> **This code reasons about money.** Trading logic, position sizing and risk
> limits are not ordinary business rules — a wrong sign or an off-by-one on a
> threshold moves real capital. Never loosen a risk guard, widen a position cap
> or disable a validation to make a test pass.

## Ground rules

1. **Bun, never npm or yarn.** `packageManager` pins `bun@1.3.11` and CI
   installs with it. The README's `npm` examples are stale — use `bun`.
2. **Lockfiles are deliberately not committed here.** CI runs a plain
   `bun install` *without* `--frozen-lockfile`. Do not add `bun.lock`.
3. **Find the owning package before you edit.** Trading behaviour lives in
   `packages/investing` and `packages/predictos`, not in the app that renders
   it. See [`architecture/overview.md`](.claude/architecture/overview.md).
4. **Packages are consumed as built `dist/`, not live source.** A package edit
   that "doesn't show up" almost always means it was not rebuilt. See
   [`architecture/monorepo.md`](.claude/architecture/monorepo.md).
5. **`third-party-trading-bots/` is vendored reference material.** It is
   outside the workspace globs, turbo never fans out into it, and nothing there
   ships. Read it as prior art; do not edit it, import from it, or fix its
   lint.
6. **Generated code is not hand-edited.** `packages/ai-broker-api-client` is
   generated from the OpenAPI spec and `packages/mcp-server` from the same
   spec — change the source route, then regenerate.
7. **Respect package boundaries.** Import from a package's public entry point,
   never reach into its internals.
8. **Never commit secrets**, API keys, broker credentials, or build output.
   Broker and LLM keys belong in Worker secrets — see
   [`architecture/web-app.md`](.claude/architecture/web-app.md).

## Where things live

| You want to change… | Go to |
| --- | --- |
| Trading agents, signals, market data, brokers | `packages/investing` |
| Prediction markets, cross-venue arbitrage | `packages/predictos` |
| Congress / earnings / CFTC data providers | `packages/fin-data-api` |
| The typed API client (generated) | `packages/ai-broker-api-client` |
| The MCP server (generated) | `packages/mcp-server` |
| Routes, `/api` handlers, auth, D1 schema, crons | `apps/ai-broker-web` |
| User-facing documentation | `apps/ai-broker-web/content/docs` |
| Internal runbooks and decision records | `devdocs/` |

Full map: [`architecture/overview.md`](.claude/architecture/overview.md) ·
trading domain: [`architecture/trading.md`](.claude/architecture/trading.md).

## Commands

```bash
bun install                    # never npm/yarn
bun run dev                    # turbo run dev
bun run build                  # turbo run build across the graph
bun run test                   # turbo run test
bun run test:coverage          # per-workspace coverage, merged to coverage/lcov.info
bun run type-check             # tsc --noEmit everywhere

bunx turbo run test --filter=investing     # much faster while iterating
```

Database and deploy commands live in
[`architecture/web-app.md`](.claude/architecture/web-app.md).

## Before you open a PR

- Run the touched workspace's own tests, then `bun run test` from the root.
- Run `bun run build` if you changed anything a sibling workspace imports.
- Add or update a test for every behaviour change — especially anything that
  sizes a position, sets a threshold, or decides a trade.
- Update the workspace's `README.md` and its `CLAUDE.md` when behaviour or
  public API changes.
- Commit style is **gitmoji + conventional commits**:
  `✨ feat(scope): what changed`. See
  [`architecture/conventions.md`](.claude/architecture/conventions.md).
- Target `main`. Keep the PR focused; no drive-by refactors.

## Detailed notes

| Note | Covers |
| --- | --- |
| [overview.md](.claude/architecture/overview.md) | System architecture, the request path, every package and app |
| [monorepo.md](.claude/architecture/monorepo.md) | Workspaces, the `dist` trap, turbo, the test-runner split |
| [web-app.md](.claude/architecture/web-app.md) | The deployed Cloudflare app: Worker, D1, auth, crons, deploy, migrations |
| [trading.md](.claude/architecture/trading.md) | Agents, strategies, brokers, prediction markets, and the rules around risk |
| [conventions.md](.claude/architecture/conventions.md) | Code style, commits, PRs, CI, publishing, security |
