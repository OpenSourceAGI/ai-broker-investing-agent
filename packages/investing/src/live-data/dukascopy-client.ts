import {
  BufferFetcher,
  Instrument as DukascopyInstrument,
  Timeframe as DukascopyTimeframe,
  defaultConfig,
  formatOutput,
  generateUrls,
  normaliseDates,
  processData,
} from "dukascopy-node";

// Flexible instrument type that accepts any valid Dukascopy instrument
// Includes common instruments as suggestions but allows any string
export type InstrumentType = string;

// Asset type categories
export type AssetCategory =
  | "indices"
  | "forex"
  | "crypto"
  | "usstocks"
  | "etf"
  | "worldstocks"
  | "commodities"
  | "bonds";

export type TimeframeType =
  | "tick"
  | "s1"
  | "m1"
  | "m5"
  | "m15"
  | "m30"
  | "h1"
  | "h4"
  | "d1"
  | "mn1";
export type FormatType = "array" | "json" | "csv";
export type PriceType = "bid" | "ask";

export interface DukascopyConfig {
  instrument: any;
  dates: {
    from: Date | string | number;
    to?: Date | string | number;
  };
  timeframe?: TimeframeType;
  format?: FormatType;
  priceType?: PriceType;
  volumes?: boolean;
}

export interface RealTimeConfig {
  instrument: InstrumentType;
  timeframe?: TimeframeType;
  dates?: {
    from: Date | string | number;
    to?: Date | string | number;
  };
  last?: number;
  volumes?: boolean;
  format?: FormatType;
  priceType?: PriceType;
}

export interface JsonItem {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface JsonItemTick {
  timestamp: number;
  askPrice: number;
  bidPrice: number;
  askVolume?: number;
  bidVolume?: number;
}

const TIMEFRAMES = new Set<string>(Object.keys(DukascopyTimeframe));
const INSTRUMENTS = new Set<string>(Object.keys(DukascopyInstrument));

interface FetchRatesInput {
  instrument: string;
  from: Date;
  to: Date;
  timeframe: TimeframeType;
  priceType: PriceType;
  volumes: boolean;
  format: FormatType;
}

function toValidDate(value: Date | string | number, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label} date: ${String(value)}`);
  }
  return date;
}

/**
 * Validate a request by hand instead of through dukascopy-node's
 * `getHistoricalRates`, whose config check (fastest-validator) compiles its
 * schema with `new Function`. Cloudflare Workers forbid code generation from
 * strings, so that call throws in production before any data is fetched.
 */
export function validateRatesInput(input: FetchRatesInput): void {
  if (!INSTRUMENTS.has(input.instrument)) {
    throw new Error(`Unknown Dukascopy instrument: ${input.instrument}`);
  }
  if (!TIMEFRAMES.has(input.timeframe)) {
    throw new Error(`Unknown Dukascopy timeframe: ${input.timeframe}`);
  }
  if (input.priceType !== "bid" && input.priceType !== "ask") {
    throw new Error(`Unknown Dukascopy price type: ${input.priceType}`);
  }
  if (input.format !== "array" && input.format !== "json" && input.format !== "csv") {
    throw new Error(`Unknown Dukascopy format: ${input.format}`);
  }
  if (input.from.getTime() >= input.to.getTime()) {
    throw new Error("Dukascopy date range must start before it ends");
  }
}

/**
 * Same pipeline as dukascopy-node's `getHistoricalRates` (urls → fetch →
 * decode → filter → format), built from the library's exported pieces so no
 * runtime code generation and no filesystem cache are involved.
 */
async function fetchRates(input: FetchRatesInput): Promise<any> {
  validateRatesInput(input);

  const instrument = input.instrument as any;
  const timeframe = input.timeframe as any;
  const [startDate, endDate] = normaliseDates({
    instrument,
    startDate: input.from,
    endDate: input.to,
    timeframe,
    utcOffset: defaultConfig.utcOffset,
  });

  const urls = generateUrls({
    instrument,
    timeframe,
    priceType: input.priceType as any,
    startDate,
    endDate,
  });

  const fetcher = new BufferFetcher({
    batchSize: defaultConfig.batchSize,
    pauseBetweenBatchesMs: defaultConfig.pauseBetweenBatchesMs,
    retryCount: defaultConfig.retryCount,
    pauseBetweenRetriesMs: defaultConfig.pauseBetweenRetriesMs,
    retryOnEmpty: defaultConfig.retryOnEmpty,
    failAfterRetryCount: defaultConfig.failAfterRetryCount,
  });
  const bufferObjects = await fetcher.fetch(urls);

  const processed = processData({
    instrument,
    requestedTimeframe: timeframe,
    bufferObjects,
    priceType: input.priceType as any,
    volumes: input.volumes,
    volumeUnits: defaultConfig.volumeUnits,
    ignoreFlats: defaultConfig.ignoreFlats,
  } as any);

  const [startMs, endMs] = [+startDate, +endDate];
  const filtered = processed.filter(
    ([timestamp]: number[]) => timestamp && timestamp >= startMs && timestamp < endMs,
  );

  return (formatOutput as any)({
    processedData: filtered,
    format: input.format,
    timeframe,
  });
}

/** Mirrors dukascopy-node's look-back window for `last` candles. */
function lookbackStart(timeframe: TimeframeType, now: Date, last: number): Date {
  const stepMs: Record<TimeframeType, number> = {
    tick: 1e3,
    s1: 1e3,
    m1: 60e3,
    m5: 5 * 60e3,
    m15: 15 * 60e3,
    m30: 30 * 60e3,
    h1: 60 * 60e3,
    h4: 4 * 60 * 60e3,
    d1: 24 * 60 * 60e3,
    mn1: 30 * 24 * 60 * 60e3,
  };
  return new Date(+now - last * 5 * (stepMs[timeframe] ?? stepMs.d1));
}

/**
 * Fetch historical market data from Dukascopy
 * Supports forex, stocks, crypto, ETFs, indices, commodities, and bonds
 */
export async function getHistoricalData(config: DukascopyConfig) {
  try {
    const data = await fetchRates({
      instrument: String(config.instrument),
      from: toValidDate(config.dates.from, "from"),
      to: config.dates.to ? toValidDate(config.dates.to, "to") : new Date(),
      timeframe: config.timeframe || "d1",
      format: config.format || "json",
      priceType: config.priceType || "bid",
      volumes: config.volumes !== false,
    });
    return { success: true, data };
  } catch (error: any) {
    console.error("Dukascopy historical data error:", error);
    return {
      success: false,
      error: error?.message || "Failed to fetch historical data",
    };
  }
}

/**
 * Fetch real-time market data from Dukascopy
 * Supports forex, stocks, crypto, ETFs, indices, commodities, and bonds
 */
export async function getRealTimeData(config: RealTimeConfig) {
  try {
    const timeframe = config.timeframe || "tick";
    const format = config.format || "json";
    const last = config.last || 10;
    const now = new Date();

    const rates = await fetchRates({
      instrument: String(config.instrument),
      from: config.dates
        ? toValidDate(config.dates.from, "from")
        : lookbackStart(timeframe, now, last),
      to: config.dates?.to ? toValidDate(config.dates.to, "to") : now,
      timeframe,
      format: "array",
      priceType: config.priceType || "bid",
      volumes: config.volumes !== false,
    });

    const sliced = config.dates ? rates : rates.slice(-last);
    const data = (formatOutput as any)({ processedData: sliced, format, timeframe });

    return { success: true, data };
  } catch (error: any) {
    console.error("Dukascopy real-time data error:", error);
    return {
      success: false,
      error: error?.message || "Failed to fetch real-time data",
    };
  }
}

/**
 * Convert Dukascopy JSON data to chart format
 */
export function convertToChartData(data: JsonItem[] | JsonItemTick[]): any[] {
  if (!data || data.length === 0) return [];

  // Check if tick data
  if ("askPrice" in data[0]) {
    // Convert tick data to OHLC using bid price
    return (data as JsonItemTick[]).map((tick) => ({
      time: tick.timestamp / 1000, // Convert to seconds
      value: tick.bidPrice,
      askPrice: tick.askPrice,
      bidPrice: tick.bidPrice,
      askVolume: tick.askVolume,
      bidVolume: tick.bidVolume,
    }));
  }

  // Convert OHLC data
  return (data as JsonItem[]).map((candle) => ({
    time: candle.timestamp / 1000, // Convert to seconds
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
}

/**
 * Comprehensive list of supported instruments across all asset classes
 * Dukascopy supports 1,600+ instruments including Forex, Stocks, Crypto, ETFs, Indices, Commodities, and Bonds
 */

export interface Instrument {
  symbol: string;
  name: string;
  category: AssetCategory;
}

// Import all instruments from the comprehensive JSON file
// New format: { category: [[symbol, name], ...] }
import dukascopySymbolsData from "./dukascopy-symbols.json";

type SymbolsData = Record<AssetCategory, [string, string][]>;

const symbolsData = dukascopySymbolsData as SymbolsData;

// Convert grouped data to flat instrument list
function parseInstruments(): Instrument[] {
  const instruments: Instrument[] = [];
  for (const category of Object.keys(symbolsData) as AssetCategory[]) {
    for (const [symbol, name] of symbolsData[category]) {
      instruments.push({ symbol, name, category });
    }
  }
  return instruments;
}

// Combined list of all instruments (1,607 total)
export const ALL_INSTRUMENTS: Instrument[] = parseInstruments();

// Direct access to instruments by category
export const FOREX_INSTRUMENTS: Instrument[] = (symbolsData.forex || []).map(
  ([symbol, name]) => ({ symbol, name, category: "forex" as const }),
);
export const CRYPTO_INSTRUMENTS: Instrument[] = (symbolsData.crypto || []).map(
  ([symbol, name]) => ({ symbol, name, category: "crypto" as const }),
);
export const STOCK_INSTRUMENTS: Instrument[] = (symbolsData.usstocks || []).map(
  ([symbol, name]) => ({ symbol, name, category: "usstocks" as const }),
);
export const ETF_INSTRUMENTS: Instrument[] = (symbolsData.etf || []).map(
  ([symbol, name]) => ({ symbol, name, category: "etf" as const }),
);
export const INDEX_INSTRUMENTS: Instrument[] = (symbolsData.indices || []).map(
  ([symbol, name]) => ({ symbol, name, category: "indices" as const }),
);
export const COMMODITY_INSTRUMENTS: Instrument[] = (
  symbolsData.commodities || []
).map(([symbol, name]) => ({ symbol, name, category: "commodities" as const }));
export const BOND_INSTRUMENTS: Instrument[] = (symbolsData.bonds || []).map(
  ([symbol, name]) => ({ symbol, name, category: "bonds" as const }),
);

/**
 * Helper functions to filter instruments by category
 */
export function getInstrumentsByCategory(
  category: AssetCategory,
): Instrument[] {
  return (symbolsData[category] || []).map(([symbol, name]) => ({
    symbol,
    name,
    category,
  }));
}

export function getInstrumentBySymbol(symbol: string): Instrument | undefined {
  return ALL_INSTRUMENTS.find(
    (inst) => inst.symbol.toLowerCase() === symbol.toLowerCase(),
  );
}

export function searchInstruments(query: string): Instrument[] {
  const lowerQuery = query.toLowerCase();
  return ALL_INSTRUMENTS.filter(
    (inst) =>
      inst.symbol.toLowerCase().includes(lowerQuery) ||
      inst.name.toLowerCase().includes(lowerQuery),
  );
}

/**
 * Legacy exports for backwards compatibility
 */
export const getForexHistoricalData = getHistoricalData;
export const getForexRealTimeData = getRealTimeData;
