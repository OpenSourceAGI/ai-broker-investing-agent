# Findings: build, packaging and tooling

Evidence comes from upstream commit `b877b41` and from the baseline runs in [04](04-test-and-runtime-baseline.md). Paths are relative to the repository root unless noted.

## Summary

| # | Finding | Effect | Plan response |
|---|---|---|---|
| B1 | The task text and the README say `npm`; the repository uses Bun | `npm install` is not the supported path | Use Bun everywhere, on the pinned version |
| B2 | Bun version drift between the host and the pin | Results may differ from CI | Run in Docker on `oven/bun:1.3.11` |
| B3 | `investing` has no `dev` script | The task's Step 1 command `turbo run dev --filter=investing` runs nothing | Document; run the root `bun run dev` in Docker and record its blockers |
| B4 | Subpath exports point at files the build never writes | `import "investing/prediction-markets"` fails for package consumers | Report only (not fixed in this change) |
| B5 | The built root entry fails to import | `import("investing")` throws `e.inherits is not a function` | Report only; the demo and tests use source modules |
| B6 | `bun run build` exits 0 with 86 type errors | A green build is not evidence of type safety | Compare type diagnostics by identity ([03](03-typescript-baseline.md)) |
| B7 | Importing the source barrel has side effects | Loads a native module and runs `dotenv` | New code and tests import leaf modules only |
| B8 | Tests and examples are not type-checked | Type errors in tests go unnoticed | Add a test-only `tsconfig` |
| B9 | The build strips comments, and the package publishes only `dist` and `data` | License notices in source headers would not ship | Add `THIRD_PARTY_NOTICES.md` to the published files |

## Details

### B1 — `npm` in the task text, Bun in the repository

- **Evidence:** the root `package.json` declares `"packageManager": "bun@1.3.11"`. The repo's `.claude/CLAUDE.md` says: "Bun, never npm or yarn … The README's `npm` examples are stale". CI installs with `bun install`, without a frozen lockfile.
- **Plan:** every install, test and run command uses Bun.

### B2 — Bun version drift

- **Evidence:** the first baseline used the host's Bun 1.3.14, while the pin is 1.3.11.
- **Plan:** all later runs happen in Docker on the pinned image `oven/bun:1.3.11`. The baseline is rerun there and becomes the reference.

### B3 — `investing` has no `dev` script

- **Evidence:** `packages/investing/package.json` has `build`, `test` and `demo:*` scripts, but no `dev`. `bunx turbo run dev --filter=investing` exits 0 and runs zero tasks.
- **Effect:** the task's Step 1 command does nothing for this package.
- **Plan:** run the root `bun run dev` (the web app and any workspace with a `dev` script) once, in a container with a clean environment, and record what starts and what blocks it.

### B4 — Subpath exports point at files the build never writes

- **Evidence:** `packages/investing/package.json` exports `./alpaca`, `./stocks`, `./prediction`, `./prediction-markets`, `./trading-agents`, `./constants` and `./utils`, each pointing at `dist/<name>/index.mjs`. But `packages/investing/vite.config.ts:20` builds a single library entry (`src/index.ts`). After `bun run build`:
  - no `dist/<name>/index.mjs` exists for any subpath;
  - type declaration files exist only for `stocks`, `prediction`, `prediction-markets` and `trading-agents`.
- **Effect:** package consumers cannot use any subpath import. The existing tests import source files, so they never notice.
- **Plan:** report only. Fixing it needs a multi-entry build, which other workspaces depend on. That belongs in its own change.

### B5 — The built root entry fails to import

- **Evidence:** `import("./dist/index.mjs")` from `packages/investing` throws `e.inherits is not a function`, both in Node 24 and in Bun. This was reproduced with `fetch` replaced by a throwing stub, so it is not a network error. The likely cause, not yet confirmed, is a CommonJS dependency that relies on `util.inherits` being bundled for the wrong target.
- **Effect:** the published package cannot be imported at all.
- **Plan:** report only. The demo and tests run from source modules, and the PR says so. It makes no claim about the built package.

### B6 — The build passes with type errors

- **Evidence:** `bun run build` exits 0. Its declaration step prints TypeScript errors. `bunx tsc --noEmit -p tsconfig.json` exits 2 with 86 diagnostics in 20 files ([03](03-typescript-baseline.md)).
- **Plan:** treat the type check as its own gate. Pass means "no new diagnostic identities or occurrences", never "exit 0".

### B7 — Importing the source barrel has side effects

- **Evidence:** importing `packages/investing/src/index.ts` loads the native module `xgboost_node` (it prints "Loading native module from …") and runs `dotenv` (it prints "injected env … from .env"). Importing `src/trading-agents/index.ts` or `src/prediction-markets/index.ts` directly is silent.
- **Plan:**
  - The new module, its tests and the demo import leaf modules only.
  - The graph imports the new module's individual files, never its barrel.
  - `demo.ts` stays out of every barrel, which avoids a runtime import cycle.

### B8 — Tests and examples are not type-checked

- **Evidence:** `packages/investing/tsconfig.json:25-26` includes `src/**/*` and excludes `**/*.test.ts`. The `examples/` folder is not included at all.
- **Plan:** add `tsconfig.test.json` (no emit) covering `test/**` and `examples/**`. Its new diagnostics are compared the same way as in B6.

### B9 — License notices would not ship

- **Evidence:** `packages/investing/vite.config.ts:39-40` sets `comments: false` for the minifier. `packages/investing/package.json` publishes only `dist` and `data`.
- **Effect:** a license notice placed only in a source header disappears from the published package.
- **Plan:**
  - Add `packages/investing/THIRD_PARTY_NOTICES.md` with each translated port's upstream path, the vendored file's git blob hash, its license and the full notice text.
  - Add the file to `package.json` `files`.
  - Check that it is in the tarball, using `bun pm pack --dry-run` in Docker.

### B3 Docker assessment update

Pinned Bun with Node/native build prerequisites starts root dev tasks without credentials. The available loopback port returned HTTP 200 from Financial Data API, not an established web-app startup. MCP registration failed on undefined `name.length` in the SDK (`packages/mcp-server/src/index.js:62`); the browser opener reports `spawn xdg-open ENOENT`. Watchers continued running; the container was deliberately stopped (exit 137). The investing-only dev command still has no task. Credentials were excluded before staging; no host credential environment was inherited. See 04 for exact outcomes.

## Delivered tooling changes

- B2: all implementation checks used the derived Bun 1.3.11 Docker image, not host Bun 1.3.14. Node 22/Python/make/g++ are installed in the image for native dependencies.
- B8: `tsconfig.test.json` now includes all `test/**/*.ts`, `examples/**/*.ts` and source ambient declarations. Existing diagnostics were reproduced against original `b877b41`; see 03. Both source and test-scope identity/occurrence gates pass.
- B9: full translated-project notices and independent-reference provenance now ship in `THIRD_PARTY_NOTICES.md`; `bun pm pack --dry-run` lists the file; an actual offline tarball contains byte-identical notice text.
- B4/B5/B6/B7 remain upstream limitations: a build exit 0 does not make dist/subpaths usable or type-clean. The new demo and tests import source leaves. No dependency, published export map or multi-entry build repair was added. The final offline root/subpath consumer probe reproduces the same import blockers.
