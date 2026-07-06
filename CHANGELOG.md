# Changelog

# MVP Phase (2026)

## July 2026

Infrastructure migration and homepage overhaul. Migrated the platform to **Cloudflare Workers** with **D1** database and **Email Workers**. Redesigned the homepage merging a new editorial layout with the platform UI while keeping the video hero, adding hero effects, an auto-scrolling broker row, and a zoomable research diagram lightbox. Reduced homepage text by moving descriptions into info tooltips. Added a **Settings page** for strategy configuration and **Kalshi** trade reconciliation. Updated the research paper link to its **Zenodo** record and refreshed diagrams and theme backgrounds.

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
