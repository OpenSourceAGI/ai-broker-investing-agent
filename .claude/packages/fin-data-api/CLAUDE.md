# CLAUDE.md — `fin-data-api`

Private (not published). A TypeScript port of the OpenBB Finance APIs:
Congressional trading data, earnings calendars, CFTC reports, and friends,
behind a Zod-validated API with Scalar OpenAPI documentation.

## The one thing to remember

**This workspace runs on Jest, not Vitest.** It is the only one in the repo that
does. `bun run test` here is `jest`. Don't "standardize" it onto Vitest as a
drive-by — the port's test suite came with it.

## Layout

| Path | Owns |
| --- | --- |
| `src/api/` | Route definitions and the OpenAPI surface |
| `src/providers/` | One module per upstream data source (Congress.gov, Seeking Alpha, CFTC, …) |
| `src/types/` | Zod schemas and inferred types |
| `src/utils/` | Shared helpers |
| `src/__tests__/` | Jest suites |

## Rules

- Every provider response is validated with Zod at the boundary. Upstream
  financial APIs change shape without warning and return partial data — parse,
  don't cast.
- One provider per file. A new data source is a new module in `providers/`, not
  a branch inside an existing one.
- Keep the OpenAPI surface honest: it is what the generated
  `ai-broker-api-client` and `mcp-server` are built from.

## Commands

```bash
cd packages/fin-data-api
bun run test           # jest
bun run test:coverage
bun run type-check
bun run dev
```
