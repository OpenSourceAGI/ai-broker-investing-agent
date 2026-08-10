import type { WatchlistItem } from "./types";

export const showPercentSign = false;

export const BATCH_SIZE = 5; // Load 5 symbols at a time
export const BATCH_DELAY = 20000; // 20 seconds between batches

export const defaultWatchlist: WatchlistItem[] = [
  // Major Indexes
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^DJI", name: "Dow Jones" },
  { symbol: "^IXIC", name: "NASDAQ" },
  { symbol: "^VIX", name: "Volatility" },

  // Crypto
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "ETH-USD", name: "Ethereum" },

  // Tech Giants
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Google" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "META", name: "Meta" },
  { symbol: "TSLA", name: "Tesla" },

  // Financial
  { symbol: "JPM", name: "JPMorgan" },
  { symbol: "BAC", name: "Bank of America" },
  { symbol: "V", name: "Visa" },
  { symbol: "MA", name: "Mastercard" },
  { symbol: "WFC", name: "Wells Fargo" },
  { symbol: "GS", name: "Goldman Sachs" },

  // Consumer
  { symbol: "WMT", name: "Walmart" },
  { symbol: "HD", name: "Home Depot" },
  { symbol: "MCD", name: "McDonald's" },
  { symbol: "NKE", name: "Nike" },
  { symbol: "SBUX", name: "Starbucks" },
  { symbol: "SNDK", name: "Sandisk" },
  { symbol: "PEP", name: "Pepsi" },
  { symbol: "COST", name: "Costco" },

  // Healthcare
  { symbol: "UNH", name: "UnitedHealth" },
  { symbol: "JNJ", name: "Johnson & Johnson" },
  { symbol: "PFE", name: "Pfizer" },
  { symbol: "ABBV", name: "AbbVie" },
  { symbol: "LLY", name: "Eli Lilly" },

  // Energy
  { symbol: "XOM", name: "Exxon Mobil" },
  { symbol: "CVX", name: "Chevron" },

  // Entertainment & Media
  { symbol: "DIS", name: "Disney" },
  { symbol: "NFLX", name: "Netflix" },
  { symbol: "CMCSA", name: "Comcast" },

  // Industrial
  { symbol: "BA", name: "Boeing" },
  { symbol: "CAT", name: "Caterpillar" },
  { symbol: "GE", name: "General Electric" },

  // Semiconductor
  { symbol: "AMD", name: "AMD" },
  { symbol: "INTC", name: "Intel" },
  { symbol: "QCOM", name: "Qualcomm" },

  // Consumer Goods
  { symbol: "PG", name: "Procter & Gamble" },
  { symbol: "TGT", name: "Target" },

  // Commodities
  { symbol: "GC=F", name: "Gold" },
  { symbol: "SI=F", name: "Silver" },
  { symbol: "CL=F", name: "Crude Oil" },
];
