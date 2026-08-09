export interface TickerItemProps {
  /** Whether to display the stock/index logo icon. @default true */
  showIcon?: boolean;
  /** Whether to display the ticker symbol (e.g., "AAPL"). @default false */
  showSymbol?: boolean;
  /** Whether to display the company/index name. @default true */
  showName?: boolean;
  /** Whether to display the price for stocks. @default false */
  showPriceStock?: boolean;
  /** Whether to display the price for indices. @default false */
  showPriceIndex?: boolean;
  /** Which time intervals to show change indicators for ('d', 'w', 'm', 'y'). @default ['d', 'w', 'm', 'y'] */
  enabledIntervals?: ChangeType[];
  /** The ticker data containing price, changes, and metadata. */
  data?: TickerData;
  /** Whether to order intervals from oldest to newest (y, m, w, d). @default true */
  orderHistorical?: boolean;
  /** Whether to show delta symbols (▲/▼) instead of triangle icons. @default true */
  showDeltaSymbols?: boolean;
  /** Whether to show the minus sign for negative changes. @default false */
  showMinusSign?: boolean;
  /** Threshold below which change percent is considered neutral and not displayed. @default 5 */
  setNeutralMagnitude?: number;

  fixed?: "top" | "bottom";
}

export interface TickerData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  weeklyChange?: number;
  weeklyChangePercent: number;
  monthlyChange: number;
  monthlyChangePercent: number;
  yearlyChange: number;
  yearlyChangePercent: number;
  high: number;
  low: number;
  volume: string;
  type: "index" | "stock";
  source?: string;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  type?: "index" | "stock";
}

export type ChangeType = "d" | "w" | "m" | "y" | "3m" | "6m" | "5y";
