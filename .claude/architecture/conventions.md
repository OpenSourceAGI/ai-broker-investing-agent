# Conventions and General Rules

## Language and style

- TypeScript throughout, ESM. A few older files in `packages/investing`
  (`debate-research/`, `llms.js`) are plain JS — leave them JS unless you are
  converting the whole directory.
- `tsconfig.base.json` at the root carries the shared compiler options; each
  workspace extends it.
- Match the surrounding file's style — naming, import order, comment density.
  There is no repo-wide formatter enforcing it in CI.
- **Comments explain why, not what.** The valuable comments in this codebase
  record a constraint and its cause: why `packages/investing` reads D1 off
  `globalThis` instead of importing `cloudflare:workers`, why every env var is
  optional, why the npm publish job strips `always-auth`. `worker/index.ts`,
  `wrangler.jsonc`, `env.ts` and `npm-publish.yml` are the house style — copy
  that register.
- Keep package boundaries clean: import a sibling from its public entry point,
  never from its internals or its `src/`.

## Generated code

Two workspaces are generated from the app's OpenAPI spec and must not be
hand-edited:

- `packages/ai-broker-api-client` — `@hey-api/openapi-ts`; `*.gen.ts` files.
- `packages/mcp-server` — `mcp-use`; 33 tools.

To change either, change the route in `apps/ai-broker-web/app/api/` (and the
spec at `app/api/openapi.json`), then regenerate.

## Commits

Gitmoji + conventional commits, lowercase subject, imperative mood:

```
✨ feat(admin): add an ADMIN_EMAILS-gated admin area with users and database controls
🐛 fix(stocks): correct API validation, caching, and chart zoom resolution
📝 docs(ai-broker): restructure docs into sections and adopt the shared Fumadocs template
👷 ci: add Codecov coverage reporting across the monorepo
🔒 docs: add SECURITY.md with private vulnerability reporting policy
```

Scope is the workspace or subsystem name. Version-bump commits are generated
(`chore: bump published package versions [skip ci]`) — do not write them by
hand.

## Pull requests

- Target `main`. One concern per PR; no drive-by refactors.
- Say what changed, why, which workspaces are affected, and whether a published
  package needs a version bump.
- **Call out every change to a risk guard, threshold, or default position size
  in its own line of the description.** See [trading.md](trading.md).
- Include test results; screenshots for UI changes.
- If you could not run a check, say so and why.

## Tests

- Add or update tests for every behaviour change and bug fix.
- Run the touched workspace's own suite first — it is far faster than the root
  run — then `bun run test` from the root.
- Vitest everywhere except `packages/fin-data-api`, which is Jest. See
  [monorepo.md](monorepo.md).
- Tests run under Node. Passing tests do **not** prove the code runs on a
  Cloudflare Worker; see [web-app.md](web-app.md).

## CI

| Workflow | Trigger | What it guards |
| --- | --- | --- |
| `test.yml` | push to `main`, PR, manual | `bun install` then `bun run test:coverage`, uploads the merged `coverage/lcov.info` to Codecov |
| `npm-publish.yml` | push to `main`, manual | Publishes changed public packages (`investing`, `predictos`) |
| `auto-merge-claude.yml` | PR | Enables auto-merge / auto-approve on Claude PRs, deletes the head branch on merge |
| `auto-merge-and-create-prs.yml` | every 12h | Merges eligible PRs and opens PRs for branches that lack one |

Codecov's project and patch checks are **informational** — a coverage dip never
blocks a merge on its own. Codecov being down does not fail the job
(`fail_ci_if_error: false`).

## Publishing

Only `investing` and `predictos` publish to npm. The other three workspaces are
`"private": true`. Publishing runs on push to `main` and prefers **trusted
publishing (OIDC)** — no secret at all — falling back to an `NPM_TOKEN` secret.
npm granular tokens expire after at most 90 days, so a red publish job is
usually an expired token, not a code problem; the workflow prints the exact
remedy.

## Documentation

| If it is… | It goes in… |
| --- | --- |
| A guide someone outside the team would read | `apps/ai-broker-web/content/docs` (published to docs.autoinvestment.broker) |
| How a workspace is used or built | That workspace's own `README.md` |
| How an agent should work in a workspace | That workspace's own `CLAUDE.md` |
| An implementation note, runbook, or decision record | `devdocs/` |

## Security

- Never commit secrets, API keys or broker credentials. Worker secrets go in
  with `wrangler secret put`.
- Vulnerability reporting policy is in [`SECURITY.md`](../../SECURITY.md) —
  private disclosure, not a public issue.
- Treat anything fetched from a venue, a scraped leaderboard, or an LLM as
  untrusted input: validate before it reaches an order path.
