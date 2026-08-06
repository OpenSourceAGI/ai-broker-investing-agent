/**
 * Arbitrage finder (ported/adapted from PredictOS `arbitrage-finder`).
 *
 * Finds arbitrage opportunities across Polymarket and Kalshi markets.
 *
 * Flow:
 * 1. Parse input URL to determine source platform (Polymarket or Kalshi)
 * 2. Fetch event data: title + markets (title + yes price only)
 * 3. Use AI agent to generate 1-2 word search query from event title
 * 4. Search the OTHER platform using the generated query
 * 5. If no results, return early
 * 6. Pass source markets + search results to arbitrage analysis agent
 * 7. Return results
 */

import { arbitrageAnalysisPrompt } from "../ai/prompts/arbitrageAnalysis";
import { searchQueryGeneratorPrompt } from "../ai/prompts/searchQueryGenerator";
import { callGrokResponses } from "../ai/callGrok";
import { callOpenAIResponses } from "../ai/callOpenAI";
import type { GrokMessage, GrokOutputText, OpenAIMessage, OpenAIOutputText } from "../ai/types";
import { request as dflowRequest } from "../clients/dflow/client";
import type {
  ArbitrageRequest,
  ArbitrageResponse,
  ArbitrageMarketData,
  ArbitrageAnalysis,
  ArbitrageMarketSource,
} from "./arbitrageFinder.types";

// API endpoints
const GAMMA_API_URL = "https://gamma-api.polymarket.com";
const DFLOW_API_BASE = "https://a.prediction-markets-api.dflow.net/api/v1";

// OpenAI model identifiers
const OPENAI_MODELS = ["gpt-5.2", "gpt-5.1", "gpt-5-nano", "gpt-4.1", "gpt-4.1-mini"];

function isOpenAIModel(model: string): boolean {
  return OPENAI_MODELS.includes(model) || model.startsWith("gpt-");
}

/** Simplified market data for arbitrage comparison */
interface SimplifiedMarket {
  title: string;
  yesPrice: number;
  /** Event identifier for URL building (slug for polymarket, event ticker for kalshi) */
  identifier?: string;
}

/** Source event data */
interface SourceEventData {
  eventTitle: string;
  markets: SimplifiedMarket[];
  source: ArbitrageMarketSource;
  /** Slug (polymarket) or ticker (kalshi) for building URLs */
  identifier: string;
}

// =============================================================================
// URL Building
// =============================================================================

/**
 * Build market URL for a platform
 * Polymarket: https://polymarket.com/event/{slug}
 * Kalshi: https://kalshi.com/events/{ticker}
 */
function buildMarketUrl(source: ArbitrageMarketSource, identifier: string): string {
  if (source === 'polymarket') {
    return `https://polymarket.com/event/${identifier}`;
  } else {
    return `https://kalshi.com/events/${identifier}`;
  }
}

// =============================================================================
// URL Parsing
// =============================================================================

/**
 * Detect which platform a URL is from
 */
function detectPlatform(url: string): ArbitrageMarketSource | null {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('polymarket.com')) return 'polymarket';
  if (lowerUrl.includes('kalshi.com')) return 'kalshi';
  return null;
}

/**
 * Extract event slug from Polymarket URL
 * The event name can be derived by replacing '-' with spaces
 */
function extractPolymarketSlug(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);

    // Format: /event/[event-slug] or /event/[event-slug]/[market-slug]
    if (pathParts[0] === 'event' && pathParts.length >= 2) {
      return pathParts[1]; // Return the event slug
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract Kalshi event ticker from URL
 * Format: /markets/[base-ticker]/[slug]/[full-ticker]
 * Returns the full ticker (last segment) uppercased
 */
function extractKalshiTicker(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);

    // Format: /markets/[base-ticker]/[slug]/[full-ticker] or /events/[event-ticker]
    if ((pathParts[0] === 'markets' || pathParts[0] === 'events') && pathParts.length >= 2) {
      // For markets URLs with full ticker at the end (4 segments), use the last segment
      // Otherwise fall back to the second segment
      const ticker = pathParts.length >= 4 ? pathParts[pathParts.length - 1] : pathParts[1];
      return ticker.toUpperCase();
    }

    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// Data Fetching
// =============================================================================

/**
 * Fetch Polymarket event data by slug
 * Returns event title + markets (title + yes price only)
 */
async function fetchPolymarketEvent(slug: string): Promise<SourceEventData | null> {
  try {
    // Fetch event by slug
    const eventUrl = `${GAMMA_API_URL}/events/slug/${slug}`;
    const response = await fetch(eventUrl);

    if (!response.ok) {
      console.error("Polymarket event fetch error:", response.status);
      return null;
    }

    const event = (await response.json()) as any;

    // Extract markets with title + yes price
    const markets: SimplifiedMarket[] = [];
    if (event.markets && Array.isArray(event.markets)) {
      for (const market of event.markets) {
        const title = market.question || market.title || '';
        let yesPrice = 50; // Default

        if (market.outcomePrices) {
          try {
            const prices = JSON.parse(market.outcomePrices);
            yesPrice = parseFloat(prices[0]) * 100; // Convert decimal to percentage
          } catch {
            // Keep default
          }
        }

        if (title) {
          markets.push({ title, yesPrice });
        }
      }
    }

    return {
      eventTitle: event.title || slug.replace(/-/g, ' '),
      markets,
      source: 'polymarket',
      identifier: event.slug || slug,
    };
  } catch (error) {
    console.error("Error fetching Polymarket event:", error);
    return null;
  }
}

/**
 * Fetch Kalshi event data by ticker via DFlow
 * Returns event title + markets (title + yes price only)
 */
async function fetchKalshiEvent(ticker: string): Promise<SourceEventData | null> {
  try {
    const response = await dflowRequest<{
      ticker: string;
      title?: string;
      markets: Array<{
        ticker: string;
        yesSubTitle: string;
        yesBid: string | null;
        yesAsk: string | null;
      }>;
    }>(`/event/${ticker}`, {
      params: { withNestedMarkets: true },
    });

    // Extract markets with title + yes price
    const markets: SimplifiedMarket[] = [];
    if (response.markets && Array.isArray(response.markets)) {
      for (const market of response.markets) {
        // Use yesSubTitle as the market name (e.g., "VR / Virtual Reality", "Trump", etc.)
        const title = market.yesSubTitle || '';

        // Parse yes price from yesBid/yesAsk (they're strings like "0.0100")
        let yesPrice = 50; // Default
        if (market.yesBid && market.yesAsk) {
          const bid = parseFloat(market.yesBid);
          const ask = parseFloat(market.yesAsk);
          yesPrice = ((bid + ask) / 2) * 100; // Convert to percentage
        } else if (market.yesBid) {
          yesPrice = parseFloat(market.yesBid) * 100;
        } else if (market.yesAsk) {
          yesPrice = parseFloat(market.yesAsk) * 100;
        }

        if (title) {
          markets.push({ title, yesPrice });
        }
      }
    }

    return {
      eventTitle: response.title || ticker,
      markets,
      source: 'kalshi',
      identifier: ticker, // Use original event ticker for URL
    };
  } catch (error) {
    console.error("Error fetching Kalshi event:", error);
    return null;
  }
}

// =============================================================================
// Search Functions
// =============================================================================

/**
 * Search Polymarket for events matching query
 * Uses public-search endpoint with events_status=open
 * Returns simplified market data (title + yes price)
 */
async function searchPolymarket(query: string): Promise<SimplifiedMarket[]> {
  try {
    const url = `${GAMMA_API_URL}/public-search?q=${encodeURIComponent(query)}&events_status=open`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error("Polymarket search error:", response.status);
      return [];
    }

    const data = (await response.json()) as any;
    const markets: SimplifiedMarket[] = [];

    // Response format: { events: [...], tags: [...], profiles: [...], pagination: {...} }
    if (data.events && Array.isArray(data.events)) {
      for (const event of data.events) {
        // Get event slug for URL building
        const eventSlug = event.slug;

        if (event.markets && Array.isArray(event.markets)) {
          for (const market of event.markets) {
            const title = market.question || market.title || '';
            let yesPrice = 50;

            if (market.outcomePrices) {
              try {
                // outcomePrices is a JSON string like "[\"0.205\", \"0.795\"]"
                const prices = JSON.parse(market.outcomePrices);
                yesPrice = parseFloat(prices[0]) * 100;
              } catch {
                // Keep default
              }
            }

            if (title) {
              markets.push({
                title,
                yesPrice,
                identifier: eventSlug, // Event slug for Polymarket URL
              });
            }
          }
        }
      }
    }

    return markets;
  } catch (error) {
    console.error("Error searching Polymarket:", error);
    return [];
  }
}

/**
 * Search Kalshi for events matching query via DFlow
 * Returns simplified market data (title + yes price)
 */
async function searchKalshi(query: string): Promise<SimplifiedMarket[]> {
  try {
    const response = await dflowRequest<{
      cursor?: number;
      events: Array<{
        ticker: string;
        title: string;
        markets?: Array<{
          ticker: string;
          title: string;
          yesSubTitle?: string;
          yesAsk?: string;
          yesBid?: string;
        }>;
      }>;
    }>('/search', {
      params: {
        q: query,
        event_status: 'open',
        withNestedMarkets: true,
      },
    });

    const markets: SimplifiedMarket[] = [];

    if (response.events && Array.isArray(response.events)) {
      for (const event of response.events) {
        // Get event ticker for URL building (e.g., KXMNDAYCARECHARGE)
        const eventTicker = event.ticker;

        if (event.markets && Array.isArray(event.markets)) {
          for (const market of event.markets) {
            // Use yesSubTitle if available (specific outcome), otherwise use title
            const title = market.yesSubTitle || market.title || '';

            // Calculate yes price from yesAsk/yesBid (strings like "0.0100")
            // Multiply by 100 to convert to percentage
            let yesPrice = 50;
            if (market.yesAsk && market.yesBid) {
              const ask = parseFloat(market.yesAsk);
              const bid = parseFloat(market.yesBid);
              yesPrice = ((ask + bid) / 2) * 100;
            } else if (market.yesAsk) {
              yesPrice = parseFloat(market.yesAsk) * 100;
            } else if (market.yesBid) {
              yesPrice = parseFloat(market.yesBid) * 100;
            }

            if (title) {
              markets.push({
                title,
                yesPrice,
                identifier: eventTicker, // Event ticker for Kalshi URL
              });
            }
          }
        }
      }
    }

    return markets;
  } catch (error) {
    console.error("Error searching Kalshi:", error);
    return [];
  }
}

// =============================================================================
// AI Functions
// =============================================================================

/**
 * Generate a 1-2 word search query using AI
 */
async function generateSearchQuery(
  title: string,
  sourcePlatform: ArbitrageMarketSource,
  targetPlatform: ArbitrageMarketSource,
  model: string
): Promise<string> {
  const { systemPrompt, userPrompt } = searchQueryGeneratorPrompt({
    title,
    sourcePlatform,
    targetPlatform,
  });

  const useOpenAI = isOpenAIModel(model);
  let text: string;

  if (useOpenAI) {
    const response = await callOpenAIResponses(
      userPrompt,
      systemPrompt,
      "text",
      model,
      1 // Low max_tokens since we only want 1-2 words
    );

    const content: OpenAIOutputText[] = [];
    for (const item of response.output) {
      if (item.type === "message") {
        const messageItem = item as OpenAIMessage;
        content.push(...messageItem.content);
      }
    }

    text = content
      .map((item) => item.text)
      .filter((t) => t !== undefined)
      .join("")
      .trim();
  } else {
    const response = await callGrokResponses(
      userPrompt,
      systemPrompt,
      "text",
      model,
      1
    );

    const content: GrokOutputText[] = [];
    for (const item of response.output) {
      if (item.type === "message") {
        const messageItem = item as GrokMessage;
        content.push(...messageItem.content);
      }
    }

    text = content
      .map((item) => item.text)
      .filter((t) => t !== undefined)
      .join("")
      .trim();
  }

  // Clean up - remove quotes, limit to first 2 words
  const cleaned = text.replace(/['"]/g, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 2);
  return words.join(' ');
}

/**
 * Call the arbitrage analysis AI agent
 */
async function analyzeArbitrage(
  sourceEvent: SourceEventData,
  searchResults: SimplifiedMarket[],
  searchPlatform: ArbitrageMarketSource,
  model: string
): Promise<{
  analysis: ArbitrageAnalysis;
  modelUsed: string;
  tokensUsed?: number;
}> {
  // Log source markets (from pasted URL)
  const sourcePlatformName = sourceEvent.source === 'polymarket' ? 'Polymarket' : 'Kalshi';
  console.log(`\n=== Data going to Arbitrage Agent ===`);
  console.log(`\n[Source: ${sourcePlatformName}] Event: "${sourceEvent.eventTitle}"`);
  console.log(`Source Markets (${sourceEvent.markets.length}):`);
  sourceEvent.markets.forEach((m, i) => {
    console.log(`  ${i + 1}. "${m.title}" - YES: ${m.yesPrice.toFixed(1)}%`);
  });

  // Log search results (from other platform)
  const searchPlatformName = searchPlatform === 'polymarket' ? 'Polymarket' : 'Kalshi';
  console.log(`\n[Search Results: ${searchPlatformName}] (${searchResults.length} markets):`);
  searchResults.forEach((m, i) => {
    console.log(`  ${i + 1}. "${m.title}" - YES: ${m.yesPrice.toFixed(1)}%`);
  });
  console.log(`\n=====================================\n`);

  // Convert source event to ArbitrageMarketData format for the prompt
  const sourceMarket: ArbitrageMarketData = {
    source: sourceEvent.source,
    name: sourceEvent.eventTitle,
    identifier: sourceEvent.identifier,
    yesPrice: sourceEvent.markets[0]?.yesPrice || 50,
    noPrice: 100 - (sourceEvent.markets[0]?.yesPrice || 50),
    url: buildMarketUrl(sourceEvent.source, sourceEvent.identifier),
  };

  // Include all source markets in raw data
  const rawSourceData = {
    eventTitle: sourceEvent.eventTitle,
    markets: sourceEvent.markets,
  };

  sourceMarket.rawData = rawSourceData;

  const { systemPrompt, userPrompt } = arbitrageAnalysisPrompt({
    sourceMarket,
    searchResults,
    searchPlatform,
  });

  const useOpenAI = isOpenAIModel(model);
  let text: string;
  let modelUsed: string;
  let tokensUsed: number | undefined;

  if (useOpenAI) {
    const response = await callOpenAIResponses(
      userPrompt,
      systemPrompt,
      "json_object",
      model,
      3
    );

    modelUsed = response.model;
    tokensUsed = response.usage?.total_tokens;

    const content: OpenAIOutputText[] = [];
    for (const item of response.output) {
      if (item.type === "message") {
        const messageItem = item as OpenAIMessage;
        content.push(...messageItem.content);
      }
    }

    text = content
      .map((item) => item.text)
      .filter((t) => t !== undefined)
      .join("\n");
  } else {
    const response = await callGrokResponses(
      userPrompt,
      systemPrompt,
      "json_object",
      model,
      3
    );

    modelUsed = response.model;
    tokensUsed = response.usage?.total_tokens;

    const content: GrokOutputText[] = [];
    for (const item of response.output) {
      if (item.type === "message") {
        const messageItem = item as GrokMessage;
        content.push(...messageItem.content);
      }
    }

    text = content
      .map((item) => item.text)
      .filter((t) => t !== undefined)
      .join("\n");
  }

  const parsed = JSON.parse(text);

  // Build ArbitrageAnalysis from AI response
  const analysis: ArbitrageAnalysis = {
    isSameMarket: parsed.isSameMarket,
    sameMarketConfidence: parsed.sameMarketConfidence,
    marketComparisonReasoning: parsed.marketComparisonReasoning,
    polymarketData: sourceEvent.source === 'polymarket' ? sourceMarket : parsed.matchedMarket || undefined,
    kalshiData: sourceEvent.source === 'kalshi' ? sourceMarket : parsed.matchedMarket || undefined,
    arbitrage: parsed.arbitrage,
    summary: parsed.summary,
    risks: parsed.risks,
    recommendation: parsed.recommendation,
  };

  return { analysis, modelUsed, tokensUsed };
}

// =============================================================================
// Main entry point
// =============================================================================

/**
 * Find cross-platform arbitrage opportunities for a pasted Polymarket/Kalshi URL.
 */
export async function arbitrageFinder(
  input: ArbitrageRequest,
): Promise<ArbitrageResponse> {
  const startTime = Date.now();

  const { url, model } = input;

  // Validate required parameters
  if (!url) {
    return {
      success: false,
      error: "Missing required parameter: 'url'",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: model || "unknown",
        sourceMarket: "unknown" as ArbitrageMarketSource,
        searchedMarket: "unknown" as ArbitrageMarketSource,
      },
    };
  }

  if (!model) {
    return {
      success: false,
      error: "Missing required parameter: 'model'",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: "unknown",
        sourceMarket: "unknown" as ArbitrageMarketSource,
        searchedMarket: "unknown" as ArbitrageMarketSource,
      },
    };
  }

  try {
    // Step 1: Detect platform and fetch source event data
    const sourcePlatform = detectPlatform(url);
    if (!sourcePlatform) {
      return {
        success: false,
        error: "Invalid URL. Must be a Polymarket or Kalshi market URL.",
        metadata: {
          requestId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime,
          model,
          sourceMarket: "unknown" as ArbitrageMarketSource,
          searchedMarket: "unknown" as ArbitrageMarketSource,
        },
      };
    }

    console.log("Detected source platform:", sourcePlatform);

    let sourceEvent: SourceEventData | null = null;
    const searchPlatform: ArbitrageMarketSource = sourcePlatform === 'polymarket' ? 'kalshi' : 'polymarket';

    if (sourcePlatform === 'polymarket') {
      const slug = extractPolymarketSlug(url);
      if (!slug) {
        return {
          success: false,
          error: "Could not extract event slug from Polymarket URL",
          metadata: {
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            processingTimeMs: Date.now() - startTime,
            model,
            sourceMarket: sourcePlatform,
            searchedMarket: searchPlatform,
          },
        };
      }
      console.log("Extracted Polymarket slug:", slug);
      sourceEvent = await fetchPolymarketEvent(slug);
    } else {
      const ticker = extractKalshiTicker(url);
      if (!ticker) {
        return {
          success: false,
          error: "Could not extract ticker from Kalshi URL",
          metadata: {
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            processingTimeMs: Date.now() - startTime,
            model,
            sourceMarket: sourcePlatform,
            searchedMarket: searchPlatform,
          },
        };
      }
      console.log("Extracted Kalshi ticker:", ticker);
      sourceEvent = await fetchKalshiEvent(ticker);
    }

    if (!sourceEvent || sourceEvent.markets.length === 0) {
      return {
        success: false,
        error: `Could not fetch event data from ${sourcePlatform}. The event may not exist or have no markets.`,
        metadata: {
          requestId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime,
          model,
          sourceMarket: sourcePlatform,
          searchedMarket: searchPlatform,
        },
      };
    }

    console.log("Fetched source event:", sourceEvent.eventTitle, "with", sourceEvent.markets.length, "markets");

    // Step 2: Generate search query using AI agent
    console.log("Generating search query from title:", sourceEvent.eventTitle);
    const searchQuery = await generateSearchQuery(
      sourceEvent.eventTitle,
      sourcePlatform,
      searchPlatform,
      model
    );
    console.log("Generated search query:", searchQuery);

    // Step 3: Search the other platform
    console.log("Searching", searchPlatform, "for:", searchQuery);
    let searchResults: SimplifiedMarket[];

    if (searchPlatform === 'polymarket') {
      searchResults = await searchPolymarket(searchQuery);
    } else {
      searchResults = await searchKalshi(searchQuery);
    }

    console.log("Found", searchResults.length, "markets on", searchPlatform);

    // Step 4: Return early if no search results
    if (searchResults.length === 0) {
      const processingTimeMs = Date.now() - startTime;
      console.log("No search results found. Returning early.");

      return {
        success: true,
        data: {
          isSameMarket: false,
          sameMarketConfidence: 0,
          marketComparisonReasoning: `No matching markets found on ${searchPlatform} for query "${searchQuery}"`,
          polymarketData: sourcePlatform === 'polymarket' ? {
            source: 'polymarket',
            name: sourceEvent.eventTitle,
            identifier: sourceEvent.identifier,
            yesPrice: sourceEvent.markets[0]?.yesPrice || 50,
            noPrice: 100 - (sourceEvent.markets[0]?.yesPrice || 50),
            url: buildMarketUrl('polymarket', sourceEvent.identifier),
            rawData: { eventTitle: sourceEvent.eventTitle, markets: sourceEvent.markets },
          } : undefined,
          kalshiData: sourcePlatform === 'kalshi' ? {
            source: 'kalshi',
            name: sourceEvent.eventTitle,
            identifier: sourceEvent.identifier,
            yesPrice: sourceEvent.markets[0]?.yesPrice || 50,
            noPrice: 100 - (sourceEvent.markets[0]?.yesPrice || 50),
            url: buildMarketUrl('kalshi', sourceEvent.identifier),
            rawData: { eventTitle: sourceEvent.eventTitle, markets: sourceEvent.markets },
          } : undefined,
          arbitrage: {
            hasArbitrage: false,
          },
          summary: `No matching markets found on ${searchPlatform}. Cannot determine arbitrage opportunity.`,
          risks: ["No matching market found on the other platform"],
          recommendation: "Try a different event or check if the market exists on both platforms.",
        },
        metadata: {
          requestId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          processingTimeMs,
          model,
          sourceMarket: sourcePlatform,
          searchedMarket: searchPlatform,
        },
      };
    }

    // Step 5: Analyze arbitrage using AI agent
    console.log("Analyzing arbitrage opportunity...");
    const { analysis, modelUsed, tokensUsed } = await analyzeArbitrage(
      sourceEvent,
      searchResults,
      searchPlatform,
      model
    );

    console.log("AI analysis complete, isSameMarket:", analysis.isSameMarket);

    const processingTimeMs = Date.now() - startTime;
    console.log("Request completed in", processingTimeMs, "ms");

    return {
      success: true,
      data: analysis,
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs,
        model: modelUsed,
        tokensUsed,
        sourceMarket: sourcePlatform,
        searchedMarket: searchPlatform,
      },
    };
  } catch (error) {
    console.error("Unhandled error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: "unknown",
        sourceMarket: "unknown" as ArbitrageMarketSource,
        searchedMarket: "unknown" as ArbitrageMarketSource,
      },
    };
  }
}
