# Test and runtime baseline

Results before any change for this work, at upstream commit `b877b41` on branch `feat/third-party-bot-adapters`. This first baseline ran **on the host**, with Bun 1.3.14. The repository pins Bun 1.3.11 (`package.json`, `packageManager`). The implementation plan reruns this baseline in Docker on the pinned image `oven/bun:1.3.11` (Phase 0). That Docker run becomes the reference for all later comparisons.

## Environment

- Host: a Linux workstation; Bun 1.3.14; Node v24.21.0; resolved Turbo 2.11.7.
- The repository pins Bun 1.3.11; this baseline used installed Bun 1.3.14.
- Host installation generated an ignored local lockfile, consistent with repository policy.
- Test commands used `env -u OPENAI_API_KEY -u GROQ_API_KEY -u ANTHROPIC_API_KEY LLM_PROVIDER=offline_baseline` to exclude provider credentials. No credential files were inspected.

## Commands and results

| Working directory | Command | Result |
|---|---|---|
| Repository root | `bun install` | Exit 0; 3,952 packages installed; peer dependency warnings for LangChain and React |
| `packages/investing` | `bun run test` (credential exclusion above) | Exit 0; 104 passed, 13 skipped; 7 files passed, 1 skipped |
| Repository root | `bunx turbo run test --filter=investing` (credential exclusion above) | Exit 0; same 104 passed, 13 skipped; one task executed, no cache hit |
| `packages/investing` | `bunx tsc --noEmit -p tsconfig.json` | Exit 2; 86 diagnostics across 20 files |
| `packages/investing` | `bun run build` | Exit 0; declaration generation reports TypeScript errors; successful build does not imply clean type checking |
| Repository root | `bunx turbo run dev --filter=investing` | Exit 0, but zero tasks executed: investing has no dev script |
| Repository root | `git diff --check` | Exit 0; no tracked changes |

## Package consumer checks

Checked the advertised export targets after building:

- Root `dist/index.mjs`, `dist/index.js`, and `dist/index.d.ts` exist.
- JavaScript targets for `alpaca`, `stocks`, `prediction`, `prediction-markets`, `trading-agents`, `constants`, and `utils` are absent.
- Declaration files for `stocks`, `prediction`, `prediction-markets`, and `trading-agents` exist. The other advertised declaration targets are absent.
- Bun imports of `investing/prediction-markets` and `investing/trading-agents` fail because their targets are missing.
- `import("investing")` fails in both Bun and Node with `e.inherits is not a function`. The Bun check replaced `globalThis.fetch` with a throwing function before import.
- Existing export tests import source files, so they do not verify the built package entry points.

## Focused behavior checks

- Executed the proposed decision regex in Bun. Both `FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**` and `FINAL TRANSACTION PROPOSAL: BUYER` parse as BUY.
- Replayed the existing momentum paper agent for `[50, 51, 52, 53, 55]`: latest intent HOLD; last non-HOLD intent BUY; internal replay holds a YES position. Emitting the earlier BUY into a new pipeline would reissue a historical entry.
- Replayed `[50, 51, 52, 53, 58]`: last intent SELL; internal replay ends flat. An independent graph/executor starting flat cannot execute that SELL.

## Limits of this baseline

- Six credential-dependent debate cases and seven live price-history cases were skipped. This does not validate a real LLM run.
- No full monorepo development server, application smoke test, root-wide tests/build, or Workers runtime test was run.
- Source, plan, design, ADR, handoff, and integration skill files were preserved. No changes were staged or committed.
- Compare later TypeScript diagnostics by file, code, message, and occurrence count. A raw error-count comparison can hide new failures; line numbers may move after edits.

## What these results mean for the integration

- **Tests:** 104 passing tests prove the existing deterministic code (arbitrage, greeks, momentum, exports). The 13 skipped tests are the only ones that touch a real LLM or live prices, so **no green run here proves that the agent graph works with a real model**. The new tests use a scripted LLM and run in a container with no network, which makes them independent of keys.
- **Package consumers:** they cannot use the built package today (see [02](02-build-packaging-and-tooling.md)). This work runs its demo and tests from source modules, and says so. It does not claim that the built package or the web app consumes the new code.

## Reference (Docker, Bun 1.3.11) — implementation preflight

The untouched staged checkout was tested before graph edits. Host node_modules was excluded. All test/type/build commands used `--network=none`; container-only named volumes held dependencies.

- Investing: 104 passed, 13 skipped, 7 test files passed and 1 skipped.
- Root: all 5 workspace test tasks succeeded (45.162 seconds).
- Source type check: exit 2, the same 86 diagnostic identities and occurrences; `tsc-diff` passed. The list in 03 was retained unchanged.
- Investing build: exit 0, with declaration diagnostics and bundle warnings; this does not prove built imports work.
- Install: the base `oven/bun:1.3.11` lacked Python and real Node; installation stalled in native dependency scripts and was stopped. The derived harness image adds Node 22.23.3, Python, make and g++, preserving Bun 1.3.11. Re-running install completed successfully.
- Root dev: an initial fixed host-port attempt failed because 3000 was occupied. The corrected harness publishes an available loopback port. HTTP GET / returned 200 from Financial Data API, which shares default port 3000 with the web app. It does not prove the web app started. MCP tool registration failed on undefined `name.length` in the SDK, from `packages/mcp-server/src/index.js:62`. Container state was running because watchers survived; it was deliberately stopped (exit 137). The browser opener also failed because `xdg-open` is unavailable in the container.
- Eight legacy prompts were captured from the unchanged graph before prompt edits.

Logs are local under `../local/` and are not published.

## Final implementation verification (Docker, Bun 1.3.11)

All checks below ran against the completed source implementation with container-only dependencies and `--network=none`. The two source-level gates, not build exit alone, define the type result.

| Harness command | Actual result |
|---|---|
| `test` | Exit 0; **350 passed, 13 skipped**, 34 files passed, one skipped (363 tests total), after the review fixes |
| `test` on the host (no Docker, existing host dependencies, Bun 1.3.14, provider keys unset) | Exit 0; same 350 passed, 13 skipped. `bun run demo:strategy-signals` on the host exits 0, and its 18-run summary is identical to the Docker run. |
| `test-root` | Exit 0; **5 successful workspace tasks**, two cache hits, 30.651 seconds |
| `tsc` | Harness exit 0; source compiler exit 2 / 86 diagnostics, test/example compiler exit 2 / 77 diagnostics; **no new diagnostic identity or occurrence** in either scope |
| `build` | Exit 0, 23.35 seconds; existing declaration errors and bundle warnings remain |
| `coverage` | Exit 0; same 350 passed / 13 skipped; V8 scope `strategy-signals/**/*.ts`, graph files and risk judge: **96.59% statements/lines, 86.35% branches, 94.69% functions** |
| `demo` | Exit 0; all event-source, venue-mapping, Gabagool, stock and Defensive traces emitted from source |
| `pack` | Exit 0; `THIRD_PARTY_NOTICES.md` listed in package contents |

Coverage includes fixtures/demo and is scoped rather than whole-package coverage. It measures exercised lines; it does not replace boundary assertions. Graph line coverage is 87.98%, and mock-equity branch coverage is 40%. No arbitrary coverage target was imposed. Six real-LLM debate cases and seven live price-history cases are skipped.

Representative externally observable results: momentum BUY 10 at 55¢ then SELL at 60¢ leaves 10,050¢ and no positions; Vibe YES/NO each buy nine at 55¢; BTC has two-contract entry caps; copy sizing buys forty at 50¢; Defensive reduces ten to five. Sequential Gabagool first buys YES, waits, records a rejected NO limit with unchanged holdings, then fills NO and reports satisfied HOLD. Mapped OpenBB bars produce stock BUY then SELL and an empty final holding; flagged fundamentals remain advisory. Both OS network isolation and zero-call spies protect fixture consumers.

The eight legacy prompts are byte-identical to the pre-edit recording. New tests also verify exact proposal binding, precision rejection, malformed input, source registration, numeric caps, risk/model denial and current-account exits. Native per-folder results are recorded in 05 and the overview; no native runtime success is inferred from these TypeScript tests.

Final local logs: `final-test.log`, `final-root-test.log`, `final-tsc.log`, `final-build.log`, `final-coverage.log`, `final-demo.log`, `final-pack.log`. Raw coverage artifacts remain in the staged container checkout. Logs and drafts are excluded from Git.

### Final harness and package-consumer checks

- Both exact configuration baselines were rechecked: source 86, test/example 77; no new diagnostic identity or occurrence. Eight Docker probes prove the gate tolerates moved line numbers and rejects an extra occurrence, a new identity at the same total count, and compiler startup failure, separately for both scopes. Shell syntax checks pass for all three harness scripts.
- An actual package tarball was created offline in local `pack-verification/`. Extracting `package/THIRD_PARTY_NOTICES.md` and comparing with the source notice file succeeded byte for byte. The dry-run list also reports 298 files, 5.37 MB unpacked.
- Final offline consumer probe still reports `e.inherits is not a function` for root dist and missing modules for trading-agents/prediction-markets subpaths. `fetch` was replaced with a throwing function before import, and the staged tree contains no credential files. This confirms the source-only limit after the final build.
- Logs: `final-harness-check.log`, `final-tarball.log`, `final-consumer.log`. The remaining TypeScript diagnostics are reproduced prior failures; no clean compiler exit is claimed.
