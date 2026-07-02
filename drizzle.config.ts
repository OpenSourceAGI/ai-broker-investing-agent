import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '.env' })

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const databaseId = process.env.CLOUDFLARE_DATABASE_ID || '37dbe79c-2687-4127-ad02-2372e15ac077' // ai-broker-db
const d1Token = process.env.CLOUDFLARE_D1_TOKEN

/**
 * Cloudflare D1 (remote, via d1-http) when Cloudflare credentials are set;
 * otherwise a local sqlite file for development.
 *
 * Migrations are applied with wrangler (uses migrations_dir from wrangler.jsonc):
 *   npm run db:migrate:local   # local miniflare D1 used by `next dev`/`preview`
 *   npm run db:migrate:remote  # production D1
 */
export default defineConfig(
  accountId && d1Token
    ? {
        schema: './lib/db/schema.ts',
        out: './migrations',
        dialect: 'sqlite',
        driver: 'd1-http',
        dbCredentials: {
          accountId,
          databaseId,
          token: d1Token,
        },
      }
    : {
        schema: './lib/db/schema.ts',
        out: './migrations',
        dialect: 'sqlite',
        dbCredentials: {
          url: process.env.DATABASE_URL || 'file:./local.db',
        },
      },
)
