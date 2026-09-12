<!-- template-git-repo:badges:start -->
<p align="center">
    <a href="https://docs.autoinvestment.broker/"><img src="https://img.shields.io/badge/Docs-blue?logo=ReadTheDocs&logoColor=white" alt="Documentation" /></a>
    <a href="https://stackblitz.com/github/OpenSourceAGI/ai-broker-investing-agent/tree/main/packages/mcp-server"><img height="20px" src="https://developer.stackblitz.com/img/open_in_stackblitz.svg" alt="Open in StackBlitz" /></a>
    <br />
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/stargazers"><img src="https://img.shields.io/github/stars/OpenSourceAGI/ai-broker-investing-agent" alt="GitHub Stars" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/issues"><img src="https://img.shields.io/github/issues/OpenSourceAGI/ai-broker-investing-agent?logo=github" alt="GitHub Issues" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/pulls"><img src="https://img.shields.io/github/issues-pr/OpenSourceAGI/ai-broker-investing-agent?logo=github&label=PRs" alt="Open Pull Requests" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/pulls?q=is%3Apr+is%3Aclosed"><img src="https://img.shields.io/github/issues-pr-closed/OpenSourceAGI/ai-broker-investing-agent?logo=github&label=PRs%20merged&color=8957e5" alt="Merged Pull Requests" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/discussions"><img src="https://img.shields.io/github/discussions/OpenSourceAGI/ai-broker-investing-agent" alt="GitHub Discussions" /></a>
    <a href="https://github.com/OpenSourceAGI/ai-broker-investing-agent/commits/main/"><img src="https://img.shields.io/github/last-commit/OpenSourceAGI/ai-broker-investing-agent.svg" alt="GitHub last commit" /></a>
    <br />
    <img src="https://img.shields.io/badge/Bun-14151A?logo=bun&logoColor=white" alt="Bun" /> <img src="https://img.shields.io/badge/Zod-3E67B1?logo=zod&logoColor=white" alt="Zod" />
</p>
<!-- template-git-repo:badges:end -->

# api-mcp-server

MCP server auto-generated from OpenAPI specification using the [mcp-use](https://mcp-use.com) framework.

## Features

- 🛠️ **33 API Tools** - All operations from the OpenAPI spec
- 🔍 **Built-in Inspector** - Test tools at `/inspector`
- 📡 **Streamable HTTP** - Modern MCP transport
- 🔐 **Authentication Support** - Bearer tokens & custom headers
- 🎨 **UI Widgets** - Compatible with ChatGPT and MCP-UI

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API credentials

# Start the server
npm start

# Or with hot reload
npm run dev
```

Then open http://localhost:3000/inspector to test your tools!

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment (development/production) | development |
| `API_BASE_URL` | Base URL for API requests | https://autoinvestment.broker/api |
| `API_KEY` | Bearer token for Authorization header | - |
| `API_AUTH_HEADER` | Custom auth header (format: `Header:value`) | - |
| `MCP_URL` | Public MCP server URL (for widgets) | http://localhost:3000 |
| `ALLOWED_ORIGINS` | Allowed origins in production (comma-separated) | - |

## Connect to Claude Desktop

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "api-mcp-server": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Connect to ChatGPT

This server supports the OpenAI Apps SDK. Configure your ChatGPT integration to use:

```
http://localhost:3000/mcp
```

## Available Tools

| Tool | Method | Path | Description |
|------|--------|------|-------------|
| `get_stocks_trending` | GET | /stocks/trending | Get trending stocks |
| `get_stocks_delisted` | GET | /stocks/delisted | Get delisted stocks |
| `get_user_settings` | GET | /user/settings | Get user settings |
| `post_user_settings` | POST | /user/settings | Save user settings |
| `get_strategies_algo_scripts` | GET | /strategies/algo-scripts | Get algo scripts |
| `post_zulu_sync` | POST | /zulu/sync | Sync Zulu Traders |
| `get_zulu_search` | GET | /zulu/search | Search Zulu traders |
| `get_zulu_top_rank` | GET | /zulu/top-rank | Get top ranked traders |
| `get_polymarket_markets` | GET | /polymarket/markets | Get prediction markets |
| `post_polymarket_positions` | POST | /polymarket/positions | Get trader positions |
| `get_stocks_autocomplete` | GET | /stocks/autocomplete | Autocomplete stock search |
| `get_stocks_sectors` | GET | /stocks/sectors | Get sector information |
| `get_stocks_gainers` | GET | /stocks/gainers | Get top gainers |
| `get_stocks_search` | GET | /stocks/search | Search stocks |
| `get_stocks_quote_symbol` | GET | /stocks/quote/{symbol} | Get stock quote |
| `get_stocks_historical_symbol` | GET | /stocks/historical/{symbol} | Get historical data |
| `post_stocks_screener` | POST | /stocks/screener | Screen stocks |
| `post_stocks_predict_statistics` | POST | /stocks/predict/statistics | Calculate stock statistics |
| `post_trading_agents` | POST | /trading-agents | Analyze stock with AI agents |
| `get_groq_debate` | GET | /groq-debate | Get debate analysis system info |
| `post_groq_debate` | POST | /groq-debate | Multi-agent debate analysis |
| `post_backtest` | POST | /backtest | Run strategy backtest |
| `post_backtest_technical` | POST | /backtest-technical | Run technical strategy backtest |
| `get_debate_agents` | GET | /debate-agents | Quick multi-agent debate analysis |
| `post_debate_agents` | POST | /debate-agents | Run multi-agent debate analysis |
| `get_sec_companies_tickerOrCik_filings` | GET | /sec/companies/{tickerOrCik}/filings | Get company SEC filings |
| `get_user_portfolio` | GET | /user/portfolio | Get user portfolio |
| `post_user_portfolio_initialize` | POST | /user/portfolio/initialize | Initialize portfolio |
| `get_user_strategies` | GET | /user/strategies | Get user strategies |
| `post_user_strategies` | POST | /user/strategies | Create strategy |
| `put_user_strategies_id` | PUT | /user/strategies/{id} | Update strategy |
| `delete_user_strategies_id` | DELETE | /user/strategies/{id} | Delete strategy |
| `get_user_signals` | GET | /user/signals | Get user signals |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /inspector` | Interactive tool testing UI |
| `POST /mcp` | MCP protocol endpoint |
| `GET /sse` | Server-Sent Events endpoint |
| `GET /health` | Health check endpoint |

## Project Structure

```
api-mcp-server/
├── .env              # Environment configuration
├── .env.example      # Example environment file
├── package.json      # Dependencies
├── README.md         # This file
└── src/
    ├── index.js      # Main server with tool registrations
    ├── http-client.js # HTTP utilities for API calls
    └── tools-config.js # Tool configurations from OpenAPI
```

## Production Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

### PM2

```bash
pm2 start src/index.js --name api-mcp-server
```

## Source

- **OpenAPI Spec**: `/mnt/data/Projects/autoinvestment-broker-agent/lib/openapi/investment-agent-openapi.json`
- **Generated**: 2025-12-31T21:19:00.877Z
- **Framework**: [mcp-use](https://mcp-use.com)

## License

MIT
