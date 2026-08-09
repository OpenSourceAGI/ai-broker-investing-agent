import type { StockData } from "@/components/investing/shared/stock-list"
import type { MarketIndex } from "@/components/ui/financial-markets-table"

export const mockIndexes: StockData[] = [
  { symbol: "SPY", name: "S&P 500 ETF", price: 478.23, change: 2.45, changePercent: 0.51, volume: 82500000 },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", price: 412.34, change: -1.23, changePercent: -0.30, volume: 45200000 },
  { symbol: "DIA", name: "Dow Jones ETF", price: 387.65, change: 0.87, changePercent: 0.22, volume: 3800000 },
  { symbol: "IWM", name: "Russell 2000 ETF", price: 203.45, change: 1.56, changePercent: 0.77, volume: 28900000 },
  { symbol: "VTI", name: "Total Market ETF", price: 267.89, change: 2.12, changePercent: 0.80, volume: 4200000 },
]

export const mostTrending: StockData[] = [
  { symbol: "NVDA", name: "NVIDIA Corp", price: 875.28, change: 45.67, changePercent: 5.51, volume: 52800000, indicator: 95 },
  { symbol: "TSLA", name: "Tesla Inc", price: 248.42, change: 12.34, changePercent: 5.23, volume: 98500000, indicator: 89 },
  { symbol: "AMD", name: "Advanced Micro Devices", price: 178.56, change: 8.92, changePercent: 5.26, volume: 67200000, indicator: 87 },
  { symbol: "META", name: "Meta Platforms", price: 512.76, change: 18.45, changePercent: 3.73, volume: 15600000, indicator: 82 },
  { symbol: "AAPL", name: "Apple Inc", price: 195.89, change: 3.21, changePercent: 1.67, volume: 54300000, indicator: 78 },
  { symbol: "MSFT", name: "Microsoft Corp", price: 420.15, change: 5.67, changePercent: 1.37, volume: 28900000, indicator: 75 },
]

export const highestBreakout: StockData[] = [
  { symbol: "SMCI", name: "Super Micro Computer", price: 892.45, change: 89.23, changePercent: 11.12, volume: 23400000, indicator: 22.5 },
  { symbol: "PLTR", name: "Palantir Technologies", price: 28.67, change: 2.89, changePercent: 11.21, volume: 45200000, indicator: 20.8 },
  { symbol: "COIN", name: "Coinbase Global", price: 178.34, change: 15.67, changePercent: 9.63, volume: 12800000, indicator: 18.3 },
  { symbol: "RIOT", name: "Riot Platforms", price: 18.92, change: 1.45, changePercent: 8.30, volume: 34500000, indicator: 16.7 },
  { symbol: "MARA", name: "Marathon Digital", price: 24.56, change: 1.87, changePercent: 8.24, volume: 28900000, indicator: 15.2 },
]

export const highestMACD: StockData[] = [
  { symbol: "GOOGL", name: "Alphabet Inc", price: 156.78, change: 4.56, changePercent: 3.00, volume: 28900000, indicator: 4.8 },
  { symbol: "AMZN", name: "Amazon.com Inc", price: 178.45, change: 5.23, changePercent: 3.02, volume: 45600000, indicator: 4.2 },
  { symbol: "NFLX", name: "Netflix Inc", price: 567.89, change: 12.34, changePercent: 2.22, volume: 8900000, indicator: 3.9 },
  { symbol: "CRM", name: "Salesforce Inc", price: 298.45, change: 6.78, changePercent: 2.32, volume: 6700000, indicator: 3.5 },
]

export const fallbackGlobalMarketIndices: MarketIndex[] = [
  {
    id: "usa30idxusd",
    name: "Dow Jones",
    country: "USA",
    countryCode: "US",
    volume: 0,
    chartData: [],
    price: 0,
    dailyChange: 0,
    dailyChangePercent: 0,
    monthlyChangePercent: 0,
    yearlyChangePercent: 0
  }
]
