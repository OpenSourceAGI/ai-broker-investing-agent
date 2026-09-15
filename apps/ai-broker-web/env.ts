import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

/**
 * Typed, validated environment for the app (ported from the vinext template).
 *
 * Cloudflare is the only platform this app targets, so the data-layer variables
 * are Cloudflare's: D1 is reached through the `DB` binding on Workers and
 * through the D1 REST API elsewhere, and outbound mail goes through the
 * `SEND_EMAIL` Email Workers binding — neither needs a connection string.
 *
 * Everything is optional so that builds and preview environments never fail
 * validation; call sites keep their own runtime guards.
 */
export const env = createEnv({
    server: {
        // Cloudflare D1 (REST API, used outside Workers — scripts, drizzle-kit)
        CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
        CLOUDFLARE_DATABASE_ID: z.string().optional(),
        CLOUDFLARE_D1_TOKEN: z.string().optional(),
        CLOUDFLARE_API_TOKEN: z.string().optional(),

        // Auth
        BETTER_AUTH_SECRET: z.string().optional(),
        // Comma-separated allowlist for /admin. With neither set, nobody is an
        // admin — see lib/auth/admin.ts.
        ADMIN_EMAIL: z.string().optional(),
        ADMIN_EMAILS: z.string().optional(),
        GOOGLE_CLIENT_ID: z.string().optional(),
        GOOGLE_CLIENT_SECRET: z.string().optional(),

        // Billing
        STRIPE_SECRET_KEY: z.string().optional(),
        STRIPE_WEBHOOK_SECRET: z.string().optional(),

        // Cloudflare Email Workers sender (the binding itself carries delivery)
        EMAIL_FROM: z.string().optional(),

        // Scheduled Workers triggers
        CRON_SECRET: z.string().optional(),

        // Model providers
        GROQ_API_KEY: z.string().optional(),
        OPENAI_API_KEY: z.string().optional(),
        GOOGLE_API_KEY: z.string().optional(),

        NODE_ENV: z
            .enum(['development', 'test', 'production'])
            .default('development'),
    },
    client: {
        NEXT_PUBLIC_APP_URL: z.string().optional(),
        NEXT_PUBLIC_APP_DOMAIN: z.string().optional(),
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
    },
    runtimeEnv: {
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_DATABASE_ID: process.env.CLOUDFLARE_DATABASE_ID,
        CLOUDFLARE_D1_TOKEN: process.env.CLOUDFLARE_D1_TOKEN,
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        ADMIN_EMAIL: process.env.ADMIN_EMAIL,
        ADMIN_EMAILS: process.env.ADMIN_EMAILS,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
        EMAIL_FROM: process.env.EMAIL_FROM,
        CRON_SECRET: process.env.CRON_SECRET,
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_APP_DOMAIN: process.env.NEXT_PUBLIC_APP_DOMAIN,
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    },
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
})
