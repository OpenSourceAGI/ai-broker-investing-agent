<p align="center">
    <img width="400px" src="https://i.imgur.com/dE5Rfck.jpeg" />
</p>
<p align="center">
    <a href="https://discord.gg/SJdBqBz3tV">
        <img src="https://img.shields.io/discord/1110227955554209923.svg?label=Chat&logo=Discord&colorB=7289da&style=flat"
            alt="Join Discord" />
    </a>
     <a href="https://github.com/vtempest/stock-prediction-agent/discussions">
     <img alt="GitHub Stars" src="https://img.shields.io/github/stars/vtempest/stock-prediction-agent" /></a>
    <a href="https://github.com/vtempest/stock-prediction-agent/discussions">
    <img alt="GitHub Discussions"
        src="https://img.shields.io/github/discussions/vtempest/stock-prediction-agent" />
    </a>
    <!-- <a href="https://npmjs.org/package/stock-prediction-agent"><img src="https://img.shields.io/npm/v/stock-prediction-agent"/></a>    -->
    <a href="https://github.com/vtempest/stock-prediction-agent/pulse" alt="Activity">
        <img src="https://img.shields.io/github/commit-activity/m/vtempest/stock-prediction-agent" />
    </a>
    <img src="https://img.shields.io/github/last-commit/vtempest/stock-prediction-agent.svg" alt="GitHub last commit" />
    <img src="https://img.shields.io/badge/Next.js-16.0-black" alt="Next.js" />

</p>
<p align="center">
    <a href="https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request">
        <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"
            alt="PRs Welcome" />
    </a>
    <a href="https://codespaces.new/vtempest/stock-prediction-agent">
    <img src="https://github.com/codespaces/badge.svg" width="150" height="20" />
    </a>
</p>
<h3 align="center">
    <a href="https://docs.autoinvestment.broker/"> 📑 Docs </a> <a href="https://autoinvestment.broker/api/docs"> 🎯 API </a>
 <a href="https://autoinvestment.broker"> 🚀 Website</a></h3>

<p align="center">
    <a href="https://play.google.com/store/apps/details?id=com.autoinvestment.broker.app">
        <img src="public/images/download-google-play.png" alt="Get it on Google Play" height="60" />
    </a>
</p>

# Investment Prediction Agent

> AI-powered multi-agent trading system for comprehensive stock & prediction markets analysis and automated trading decisions.

## 🚀 Overview

**Auto Investment Broker** combines specialized LLM agents to analyze markets, debate strategies, and execute trades. It features real-time data processing, a "Bull vs. Bear" debate engine, and a modern dashboard for visualization.

### ✨ Key Features

- **Multi-Agent Architecture**: LLM agents including Fundamentals, News, Technical, and Risk Managers.
- **Top Traders Leaderboard**: Real-time tracking of top performers from ZuluTrade and Polymarket.
- **Interactive Dashboard**: Modern UI with specific agent reports, history tracking, and technical charts.
- **"Bull vs. Bear" Debates**: Automated debates to assess risk and reward before every trade.

## 🤖 AI Agents & Strategies

| Agent/Team                  | Role                                                                        |
| :-------------------------- | :-------------------------------------------------------------------------- |
| **Analyst Team**      | Gathers data: Fundamentals, Sentiment (Social), News, & Technical Analysis. |
| **Researcher Team**   | Conducts "Bull vs. Bear" debates; assesses risk.                            |
| **Trader Agent**      | Synthesizes reports to propose trades.                                      |
| **Portfolio Manager** | Final decision maker; manages risk and position sizing.                     |

### Analysis Team

- **Market Analyst**: Technical analysis and liquidity assessment
- **Sentiment Analyst**: Social media sentiment and "undiscovered" status
- **News Analyst**: Recent events, catalysts, and jurisdiction risks
- **Fundamentals Analyst**: Financial scoring and valuation

### Research Team

- **Bull Researcher**: Advocates for BUY opportunities
- **Bear Researcher**: Identifies risks and thesis violations
- **Research Manager**: Synthesizes debate and enforces thesis compliance

### Execution Team

- **Trader**: Proposes execution parameters
- **Risk Team** (Risky/Safe/Neutral): Debates position sizing
- **Portfolio Manager**: Final authority on all trading decisions

## ☁️ Deploy to Cloudflare Workers

The app runs on Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare), with D1 as the database, better-auth for authentication, and Email Workers for transactional email (verification, password reset, invitations).

```bash
# Local dev (Next.js dev server; D1 & email bindings proxied via miniflare)
npm run dev

# Apply drizzle migrations to D1
npm run db:migrate:local    # local miniflare D1
npm run db:migrate:remote   # production D1 (ai-broker-db)

# Preview the production worker locally
npm run preview

# Deploy
npm run deploy
```

Setup notes:

- Bindings are declared in `wrangler.jsonc`: `DB` (D1 database `ai-broker-db`), `SEND_EMAIL` (Email Workers), cron triggers for the `/api/cron/*` routes.
- Secrets: `wrangler secret put BETTER_AUTH_SECRET` (likewise `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, and optionally `RESEND_API_KEY` as an email fallback).
- Email Workers requires [Email Routing](https://developers.cloudflare.com/email-routing/) to be enabled on the zone, with the `EMAIL_FROM` sender on a verified domain and recipient destination rules configured; without the binding, sending falls back to Resend (if configured) or console logging.

## 📂 Third Party APIs

- **[Alpaca](https://alpaca.markets/)**: Broker & trading as a service.
- **[TradingView](https://www.tradingview.com/ideas/)**: TradingView PineScript automated trading.
- **[Polymarket](https://polymarketanalytics.com/)**: Top event predictions leaderboard & correlation with stock market.
- **[Finnhub](https://finnhub.io/dashboard)**: Stock market data.
- **[Lightweight Charts](https://www.tradingview.com/lightweight-charts/)**: Candlestick UI widget from TradingView
- **[TradingAgents](https://github.com/TauricResearch/TradingAgents)**: Implementation of LLM research bots ([paper](https://arxiv.org/pdf/2412.20138))
