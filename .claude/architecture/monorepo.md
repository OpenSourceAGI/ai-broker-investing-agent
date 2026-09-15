# Monorepo Mechanics

## Workspaces

```json
"workspaces": ["apps/*", "packages/*"]
```

Note what is *not* in that list: `third-party-trading-bots/` and `devdocs/`.
Turbo only fans out into apps and packages.

## Bun, and no lockfile

`packageManager` pins `bun@1.3.11`. CI installs with
[`oven-sh/setup-bun`](../../.github/workflows/test.yml) and runs a plain
`bun install` — deliberately **without** `--frozen-lockfile`, because lockfiles
are not committed in this repo. Do not add one; do not "fix" the missing
lockfile. The README still shows `npm install` in places — that is stale, use
`bun`.

## The `dist` trap

A workspace package is consumed by its `main`/`exports`, which point at built
output — not at `src/`. So:

> **Edit a package → rebuild it → then the app sees the change.**

`bun run build` runs `turbo run build` with `dependsOn: ["^build"]`, so building
the app builds its dependencies first. But `bun run dev` does **not** rebuild
dependencies on the fly. If a change to `packages/investing` "doesn't show up"
in the running app, you almost certainly skipped the rebuild:

```bash
bunx turbo run build --filter=investing
```

One deliberate exception in `turbo.json`: `ai-broker-web#build` overrides
`dependsOn` to `[]` so the app's own Cloudflare build does not rebuild the whole
graph.

## Turbo task graph

| Task | Notes |
| --- | --- |
| `build` | `dependsOn: ["^build"]`; outputs `dist/`, `build/`, `.source/`, `.wrangler/deploy/` |
| `test` | `dependsOn: ["^build"]` — tests run against built dependencies |
| `test:coverage` | Not build-dependent; outputs `coverage/` |
| `lint`, `type-check` | `dependsOn: ["^build"]` |
| `dev`, `start`, `preview`, `db:studio` | `cache: false`, `persistent: true` |
| `deploy`, `db:*`, `cf-typegen`, `clean` | `cache: false` |

`deploy` declares `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in its
`env` so turbo does not cache across credentials.

## The test-runner split

Almost everything is **Vitest**. `packages/fin-data-api` is **Jest** — the one
exception, inherited from its OpenBB port. `packages/mcp-server` has no test
script at all (it is generated).

| Workspace | Runner |
| --- | --- |
| `apps/ai-broker-web` | Vitest |
| `packages/investing` | Vitest (plus `test:debate` for the debate suite) |
| `packages/predictos` | Vitest |
| `packages/ai-broker-api-client` | Vitest |
| `packages/fin-data-api` | **Jest** |

Iterate inside the workspace — it is far faster than the root run:

```bash
bunx turbo run test --filter=investing
cd packages/investing && bun run test
```

## Coverage

`bun run test:coverage` runs every workspace's suite with coverage on, then
`.github/scripts/merge-coverage.mjs` merges the per-workspace LCOV reports into a single
`coverage/lcov.info` with repo-root-relative paths. CI uploads exactly that one
file to Codecov. Thresholds and the per-workspace component breakdown live in
[`codecov.yml`](../../codecov.yml); project and patch checks are **informational**,
so a coverage dip never blocks a merge on its own.
