# Runbook: Google sign-in fails with `unable_to_create_user`

## Symptom

A new user signs in with Google, lands back on
`/api/auth/callback/google`, and does not get an account. Workers logs show:

```text
ERROR [Better Auth]: Unable to create OAuth user
    at Tt.queryWithCache (_next/static/db-*.js)
    at async Tt.values / Tt.all
    at async Object.create (auth-*.js)
    at async Object.createUser (auth-*.js)
ERROR [Better Auth]: unable_to_create_user
```

The stack ends in Drizzle's query runner, so the `INSERT INTO users` failed
in D1. Existing users can still sign in; only **new** accounts break.

## Cause

Production D1 is behind `apps/ai-broker-web/lib/db/schema.ts`.

Drizzle names every column of a table in its `INSERT`, so better-auth's
`createUser` writes `stripe_customer_id` and `trial_allowed` — the columns
migration `0017_greedy_jackal.sql` added for the Stripe plugin — whether or not
it has values for them. A database that never got 0017 answers
`no such column: stripe_customer_id`, and better-auth reports the generic
message above.

Migration 0017 was never applied because nothing that deploys production
applies migrations:

- **The GitHub deploy workflow** (`.github/workflows/cloudflare-workers-deploy.yml`)
  has failed on every run since it was added. It set up Node with
  `cache: npm` against `apps/ai-broker-web/package-lock.json`, a file this Bun
  repo does not commit, and died with *"Some specified paths were not
  resolved"* before reaching its `Apply D1 migrations` step. It now installs
  with Bun, so the step runs.
- **Cloudflare Workers Builds** runs `bun run build` and then
  `npx wrangler deploy` from the repository root. `wrangler deploy` uploads the
  Worker; it does not touch D1.

## Fix it now (production)

You need Wrangler logged in to the account that owns `ai-broker-db`
(`wrangler login`, or `CLOUDFLARE_API_TOKEN` with **D1 Edit** plus
`CLOUDFLARE_ACCOUNT_ID`).

### 1. See what D1 thinks is applied

```bash
cd apps/ai-broker-web
bunx wrangler d1 migrations list ai-broker-db --remote
```

### 2a. Normal case — apply the pending migrations

If the list shows only the newer migrations (e.g. `0017`, and maybe `0018`)
as pending:

```bash
bun run db:migrate:remote        # wrangler d1 migrations apply ai-broker-db --remote
```

Done — go to [Verify](#3-verify).

### 2b. The database was built outside wrangler

If the list shows `0000_worthless_saracen.sql` (or other long-applied
migrations) as pending, the tables were created some other way — `db:push`,
or before `migrations/` was restored in #186 — and D1's `d1_migrations`
table does not know about them. Applying would fail on
`table users already exists` and stop.

Do **not** delete tables. Instead:

1. Check which of 0017's changes the database already has:

   ```bash
   bunx wrangler d1 execute ai-broker-db --remote \
     --command "SELECT name FROM pragma_table_info('users') WHERE name IN ('stripe_customer_id','trial_allowed');"
   bunx wrangler d1 execute ai-broker-db --remote \
     --command "SELECT name FROM pragma_table_info('accounts') WHERE name IN ('issuer','refresh_token_expires_at');"
   bunx wrangler d1 execute ai-broker-db --remote \
     --command "SELECT name FROM sqlite_master WHERE name IN ('subscriptions','accounts_issuer_account_id_idx','stock_quote_cache');"
   ```

2. Run only the statements of `migrations/0017_greedy_jackal.sql` (and
   `0018_quote_cache_updated_at.sql`) whose column/table/index is missing,
   one at a time with `wrangler d1 execute --remote --command "…"`. For the
   sign-up failure specifically, the two that matter are:

   ```sql
   ALTER TABLE `users` ADD `stripe_customer_id` text;
   ALTER TABLE `users` ADD `trial_allowed` integer DEFAULT true;
   ```

   Run 0017's `accounts` changes in their file order — the `issuer` column,
   then the `UPDATE`s that backfill it, then the unique index — or the index
   fails on duplicate empty issuers.

3. Record every migration in `migrations/` as applied, so the next deploy
   does not try to re-run them:

   ```bash
   for f in migrations/*.sql; do
     name=$(basename "$f")
     bunx wrangler d1 execute ai-broker-db --remote --command \
       "INSERT INTO d1_migrations (name) SELECT '$name' WHERE NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name = '$name');"
   done
   bunx wrangler d1 migrations list ai-broker-db --remote   # expect: No migrations to apply
   ```

   Only do this once the schema really matches — a migration marked applied
   is never run again.

### 3. Verify

```bash
bunx wrangler d1 execute ai-broker-db --remote \
  --command "SELECT name FROM pragma_table_info('users');"
```

The output must include every column of `users` in `lib/db/schema.ts`,
`stripe_customer_id` and `trial_allowed` among them. Then sign in with a
Google account that has never used the site, and tail the Worker while you
do:

```bash
bunx wrangler tail ai-broker-investing-agent --format pretty
```

No `[Better Auth]` error, and a row appears in `users` and `accounts`.

No redeploy is needed: the Worker already runs code that expects these
columns.

## Keep it fixed

Pick **one** of these so every deploy migrates first.

- **Cloudflare Workers Builds** (dashboard → Workers & Pages →
  `ai-broker-investing-agent` → Settings → Build). Change the deploy command
  from `npx wrangler deploy` to:

  ```bash
  bun run deploy:cloudflare
  ```

  That runs `db:migrate:remote` for `ai-broker-web` and then
  `wrangler deploy`. The build's API token must have **D1 Edit** on the
  account; the token Workers Builds creates by default may not, in which case
  add a token that does as the `CLOUDFLARE_API_TOKEN` build variable.
  `turbo.json` passes `CLOUDFLARE_*` credentials through to
  `db:migrate:remote` — turbo's strict env mode would otherwise strip them.
- **GitHub Actions** — `cloudflare-workers-deploy.yml` on every push to `main`
  that touches `apps/**`. Needs the `CLOUDFLARE_API_KEY`, `CLOUDFLARE_EMAIL`
  and `CLOUDFLARE_ACCOUNT_ID` repository secrets. If Workers Builds also
  deploys, both run; the migration step is a no-op once D1 is current.
- **By hand** — `bun run deploy` inside `apps/ai-broker-web` already migrates
  before deploying.

Order matters: migrate, then deploy. New code against an old database fails
its first insert; old code against a new database keeps working.

## If the error comes back with a different cause

`lib/auth/logger.ts` flattens the error better-auth passes to its logger, so
the log line after `Unable to create OAuth user` names the real failure
(`DrizzleQueryError: Failed query: … | caused by Error: D1_ERROR: …`). If you
only see a bare stack, the running Worker predates that logger — redeploy.

| Cause in the log | Meaning | Fix |
| --- | --- | --- |
| `no such column: …` | D1 behind the schema | This runbook |
| `no such table: users` | Migrations never applied at all | `bun run db:migrate:remote` |
| `UNIQUE constraint failed: users.email` | That email already has a `users` row (from email/password or SIWE) that better-auth did not link the Google account to | Not a schema problem; look at better-auth's `account.accountLinking` options, which `lib/auth/index.ts` does not set today |
| `NOT NULL constraint failed: users.name` | Provider returned no name | Handled by `databaseHooks.user.create.before` in `lib/auth/index.ts`; if seen, that hook is not deployed |

## Prevention already in the repo

- `apps/ai-broker-web/lib/db/__tests__/migrations.test.ts` fails when
  `schema.ts` declares a table or column that no migration creates.
- Change the schema only through `bun run db:generate`, and commit the whole
  of `migrations/`, `meta/` included.
