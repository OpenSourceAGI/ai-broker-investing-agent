# Changelog

# MVP Phase (2026)

## September 2026

Cloudflare-only consolidation and market data reliability. Adopted the **template-vinext** starter as the structural base for `apps/ai-broker-web`, adding the missing `/dashboard` route shell that wires up the previously orphaned agents, trading, unified orders, and leaders tabs, splitting `lib/auth` into server/client/session modules, and introducing typed environment validation with **@t3-oss/env-nextjs** plus a documented `.env.example`. Narrowed the platform surface to Cloudflare only: **D1** for every environment (via the binding on Workers and the D1 REST API for scripts and CI), dropping the **libsql**/**Turso** client and local SQLite fallback, and **Email Workers** as the sole mail path, dropping the **Resend** fallback. Fixed the Workers Build deploy by declaring **wrangler** at the workspace root. On the data side, added **Yahoo Finance** as a keyless final fallback tier for historical prices so charts still load without Finnhub or Alpaca keys, stopped hardcoding a `localhost:3000` auth base URL that broke `get-session`, and rewrote `getHistorical()` to call Yahoo's `chart()` API directly so partial-null rows are backfilled instead of failing the whole request and silently zeroing weekly/monthly/yearly changes.

## August 2026

Monorepo restructure and the Cloudflare Workers runtime migration. Reorganized the repository into a **Turborepo** with the Next.js app moved to `apps/ai-broker-web` and a shared task graph and build cache at the root. Replaced the **OpenNext** build pipeline with **vinext**, building the Worker directly through the Cloudflare Vite plugin, moving MDX to `fumadocs-mdx/vite`, backing page-level ISR with the Cloudflare edge cache, and reading bindings through `cloudflare:workers` instead of a Node context shim. Made the deployed Worker actually work end to end on **workerd**: synced the Drizzle schema with **better-auth 1.7** (account `issuer` keying, subscription and Stripe columns), replaced the eager libsql client in the quote cache with the shared D1 connection, and bundled the strategies and sectors datasets that were being read from the filesystem at request time. Completed the teams feature against **D1** and **Email Workers** with real team listing, invitations, and user search endpoints. Added the new **predictos** package, porting the reusable core of **PredictOS** (MIT) from Deno to Node/TypeScript — Grok, OpenAI, and BlockRun clients, **Kalshi**/DFlow, **Polymarket**/Dome, Polyfactual and **x402** market clients, event-analysis, bookmaker, mapper, and arbitrage agents, and Polymarket order and position-tracking bots — and wired it into the `investing` package. Cleared several build blockers: externalized `yahoo-finance2` and `node-fetch` in the investing Vite build, pinned **zod** to resolve a `tsc` heap OOM in `fin-data-api` (surfacing two real provider bugs), and removed a stale gitlink that broke clones.

## July 2026

Infrastructure migration and homepage overhaul. Migrated the platform to **Cloudflare Workers** with **D1** database and **Email Workers**. Redesigned the homepage merging a new editorial layout with the platform UI while keeping the video hero, adding hero effects, an auto-scrolling broker row, and a zoomable research diagram lightbox. Reduced homepage text by moving descriptions into info tooltips. Added a **Settings page** for strategy configuration and **Kalshi** trade reconciliation. Updated the research paper link to its **Zenodo** record and refreshed diagrams and theme backgrounds. Reworked **Didit** KYC to handle v3 webhooks at `/api/kyc/webhook` with HMAC signature verification, replay rejection, and support for resubmission after a failed attempt. Licensed the project under **PROSPER 1.0.0**.

## May 2026

Onboarding flow refinement. Redirected the login flow through the investor survey before landing on the homepage.

## April 2026

Mobile experience fixes. Restored hamburger menu visibility on the landing page and stacked the prediction markets header vertically on small screens.

## March 2026

Documentation and AI accessibility. Introduced **"Open in LLM"** functionality and a refined **Copy Markdown** button for documentation pages, and integrated the docs with the main app sidebar.

## February 2026

Market Watch and trading bots. Introduced **Market Watch** features including watchlists, market stats, and trade history sync with schema updates. Added a new **kalshi-bot-api** Python client and the **poly-bot-openclaw** bot framework. Restructured documentation with new research papers and guides. Enhanced the stock ticker with delta display, added an external stock links dropdown to the quote view, holders info, and **Polymarket** broker integration. Tested the **Kimi** LLM model and relocated data import and sync scripts into the investing package.

## January 2026

Market data infrastructure overhaul. Replaced **Yahoo Finance** with **Finnhub** plus a layered **Alpaca** fallback for historical data. Created the reusable **investing** npm package and translated all **33 financial data providers** from Python to TypeScript with full **OpenAPI** specification and **Jest** unit test coverage. Built a unified quote service with caching and source priority, plus new stock, markets, leaders, and predict pages. Added **Polymarket** analytics and public search APIs, prediction market categorization with cron-based sync, and expanded **Dukascopy** support to all asset classes. Shipped a mobile bottom app dock, cinematic theme switcher, and scrolling stock ticker banner. Resolved extensive ESM/module-resolution build failures.

# Prototype Phase (2025)

## December 2025

**Project founding and rapid prototyping.** Initialized as TimeTravel.investments, then rebranded to **AI Broker** (autoinvestment.broker). Built the core trading dashboard with paper trading, AI bots, and **25 algorithmic trading strategies** with functional backtesting. Ported the **TradingAgents** multi-agent debate system from Python to TypeScript with **Groq** (Llama 3.3 70B) and **LangChain** integration, and added an AI options strategy advisor. Implemented a unified LLM Agent API with multi-provider support and **Alpaca MCP** trading integration with AI chat and strategy builder. Established authentication with **Better Auth**, **SIWE**/MetaMask wallet login, and OAuth, backed by **Turso**/**Drizzle** with a later switch to **libsql**. Added organizations, teams, sharing, subscription plans, and **Didit.me** KYC verification. Launched **Fumadocs** documentation with **Scalar OpenAPI** reference. Integrated **ZuluTrade** and **Polymarket** data sync plus an **NVSTLY** leaders dashboard with copy trading.
