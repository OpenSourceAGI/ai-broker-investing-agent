// Alpaca API Client
// Simplified client for historical data fetching

const ALPACA_API_KEY = process.env.ALPACA_API_KEY || process.env.APCA_API_KEY_ID || "";
const ALPACA_SECRET = process.env.ALPACA_SECRET || process.env.APCA_API_SECRET_KEY || "";
const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || "https://data.alpaca.markets";

export interface AlpacaClient {
  getHistoricalBars: (options: {
    symbol: string;
    start: string;
    end: string;
    timeframe: string;
  }) => Promise<any>;
}

export function createAlpacaClient(): AlpacaClient {
  const headers: Record<string, string> = {
    "APCA-API-KEY-ID": ALPACA_API_KEY,
    "APCA-API-SECRET-KEY": ALPACA_SECRET,
  };

  return {
    async getHistoricalBars(options) {
      const { symbol, start, end, timeframe } = options;

      if (!ALPACA_API_KEY || !ALPACA_SECRET) {
        throw new Error("Alpaca API credentials not configured");
      }

      const url = `${ALPACA_BASE_URL}/v2/stocks/${symbol}/bars?start=${start}&end=${end}&timeframe=${timeframe}`;

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Alpaca API error: ${response.status} ${response.statusText} - ${text}`);
      }

      return response.json();
    },
  };
}
