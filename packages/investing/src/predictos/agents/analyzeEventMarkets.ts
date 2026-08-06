/**
 * Analyze event markets agent (ported/adapted from PredictOS `analyze-event-markets`).
 *
 * Analyzes all markets for a specific event to find alpha opportunities and predict outcomes.
 * Supports Kalshi and Polymarket prediction markets via Dome unified API (or DFlow for Kalshi).
 */

import {
  getKalshiMarketsByEvent as getDomeKalshiMarketsByEvent,
  getPolymarketMarkets,
  buildKalshiMarketUrl as buildDomeKalshiMarketUrl,
  buildPolymarketUrl,
} from "../clients/dome/endpoints";
import {
  getKalshiMarketsByEvent as getDFlowKalshiMarketsByEvent,
  buildKalshiMarketUrl as buildDFlowKalshiMarketUrl,
} from "../clients/dflow/endpoints";
import { analyzeEventMarketsPrompt } from "../ai/prompts/analyzeEventMarkets";
import { callGrokResponses } from "../ai/callGrok";
import { callOpenAIResponses } from "../ai/callOpenAI";
import type { GrokMessage, GrokOutputText, OpenAIMessage, OpenAIOutputText } from "../ai/types";
import type {
  AnalyzeMarketRequest,
  MarketAnalysis,
  AnalyzeMarketResponse,
} from "./analyzeEventMarkets.types";

// OpenAI model identifiers
const OPENAI_MODELS = ["gpt-5.2", "gpt-5.1", "gpt-5-nano", "gpt-4.1", "gpt-4.1-mini"];

/**
 * Determine if a model is an OpenAI model
 */
function isOpenAIModel(model: string): boolean {
  return OPENAI_MODELS.includes(model) || model.startsWith("gpt-");
}

/**
 * Extracts event slug from a Polymarket URL
 * Handles URLs like:
 * - https://polymarket.com/event/fed-decision-in-december?tid=1765299517368
 * - https://polymarket.com/event/will-netflix-close-warner-brothers-acquisition-by-end-of-2026
 */
function extractPolymarketEventSlug(url: string): string | null {
  // Remove query parameters
  const urlWithoutParams = url.split('?')[0];
  // Split by '/' and take the last element
  const parts = urlWithoutParams.split('/');
  return parts[parts.length - 1] || null;
}

/**
 * Analyze all markets for a single event and return the best alpha opportunity.
 */
export async function analyzeEventMarkets(
  input: AnalyzeMarketRequest,
): Promise<AnalyzeMarketResponse> {
  const startTime = Date.now();

  // Extract parameters
  const { url, question, pmType, model, dataProvider } = input;

  // Use provided model or default to grok-4-1-fast-reasoning
  const selectedModel = model || "grok-4-1-fast-reasoning";
  const useOpenAI = isOpenAIModel(selectedModel);

  // Enforce data provider based on market type: Kalshi → dflow, Polymarket → dome
  // (ignore any passed dataProvider value - enforce server-side)
  const selectedDataProvider = pmType === "Kalshi" ? "dflow" : "dome";

  // Validate required parameters
  if (!url) {
    console.log("Missing url parameter");
    return {
      success: false,
      error: "Missing required parameter: 'url'",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventTicker: "",
        marketsCount: 0,
        question: question || "",
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  // Check if market type is supported
  if (pmType !== "Kalshi" && pmType !== "Polymarket") {
    console.log("Unsupported market type:", pmType);
    return {
      success: false,
      error: "Market type not supported. Use 'Kalshi' or 'Polymarket'",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventTicker: "",
        marketsCount: 0,
        question: question || "",
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  if (!question) {
    console.log("Missing question parameter");
    return {
      success: false,
      error: "Missing required parameter: 'question'",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventTicker: "",
        marketsCount: 0,
        question: "",
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  try {
    let eventIdentifier: string;
    let markets: unknown[];

    if (pmType === "Kalshi") {
      // Extract event ticker from Kalshi URL (last segment, capitalized)
      // e.g., https://kalshi.com/markets/kxcabout/next-cabinet-memeber-out/kxcabout-29 -> KXCABOUT-29
      const urlParts = url.split('/');
      const eventTicker = urlParts[urlParts.length - 1]?.toUpperCase();

      if (!eventTicker) {
        console.log("Could not extract event ticker from URL:", url);
        return {
          success: false,
          error: "Could not extract event ticker from 'url'",
          metadata: {
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            eventTicker: "",
            marketsCount: 0,
            question,
            processingTimeMs: Date.now() - startTime,
          },
        };
      }

      eventIdentifier = eventTicker;
      const providerName = selectedDataProvider === 'dflow' ? 'DFlow' : 'Dome';
      console.log(`Starting Kalshi analysis via ${providerName} API:`, { eventTicker, question, dataProvider: selectedDataProvider });

      // Fetch all markets for the event via selected API (Dome or DFlow)
      try {
        if (selectedDataProvider === 'dflow') {
          markets = await getDFlowKalshiMarketsByEvent(eventTicker);
        } else {
          markets = await getDomeKalshiMarketsByEvent(eventTicker);
        }
        console.log(`Found ${markets.length} markets for Kalshi event via ${providerName}:`, eventTicker);
      } catch (error) {
        console.error(`Failed to fetch Kalshi markets via ${providerName}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const isNotFound = errorMessage.includes("404") || errorMessage.toLowerCase().includes("not found");
        return {
          success: false,
          error: isNotFound
            ? `Event '${eventTicker}' not found on Kalshi (via ${providerName}). Please verify the URL is correct.`
            : `Failed to fetch markets from Kalshi for event '${eventTicker}' via ${providerName}: ${errorMessage}`,
          metadata: {
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            eventTicker,
            marketsCount: 0,
            question,
            processingTimeMs: Date.now() - startTime,
            platform: "Kalshi",
            dataProvider: selectedDataProvider,
          },
        };
      }
    } else {
      // Polymarket via Dome API
      // Extract event slug from URL (remove query params, take last segment)
      // e.g., https://polymarket.com/event/fed-decision-in-december?tid=1765299517368 -> fed-decision-in-december
      const eventSlug = extractPolymarketEventSlug(url);

      if (!eventSlug) {
        console.log("Could not extract event slug from URL:", url);
        return {
          success: false,
          error: "Could not extract event slug from 'url'",
          metadata: {
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            eventTicker: "",
            marketsCount: 0,
            question,
            processingTimeMs: Date.now() - startTime,
          },
        };
      }

      eventIdentifier = eventSlug;
      console.log("Starting Polymarket analysis via Dome API:", { eventSlug, question });

      // Fetch markets via Dome API
      try {
        const response = await getPolymarketMarkets({ slug: eventSlug });
        markets = response.markets;
        console.log(`Found ${markets.length} markets for Polymarket event:`, eventSlug);
        console.log("Markets:", markets);
      } catch (error) {
        console.error("Failed to fetch Polymarket markets:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const isNotFound = errorMessage.includes("404") || errorMessage.toLowerCase().includes("not found");
        return {
          success: false,
          error: isNotFound
            ? `Event '${eventSlug}' not found on Polymarket. Please verify the URL is correct.`
            : `Failed to fetch markets from Polymarket for event '${eventSlug}': ${errorMessage}`,
          metadata: {
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            eventTicker: eventSlug,
            marketsCount: 0,
            question,
            processingTimeMs: Date.now() - startTime,
            platform: "Polymarket",
          },
        };
      }
    }

    // Check if any markets were found
    if (markets.length === 0) {
      const platformName = pmType === "Kalshi" ? "Kalshi" : "Polymarket";
      const identifierType = pmType === "Kalshi" ? "event ticker" : "event slug";
      return {
        success: false,
        error: `No markets found for ${identifierType} '${eventIdentifier}' on ${platformName}. Please verify the URL is correct and the event exists.`,
        metadata: {
          requestId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          eventTicker: eventIdentifier,
          marketsCount: 0,
          question,
          processingTimeMs: Date.now() - startTime,
          platform: platformName,
        },
      };
    }

    // Build prompt and call AI
    const { systemPrompt, userPrompt } = analyzeEventMarketsPrompt(markets, eventIdentifier, question, pmType);

    let aiResponseModel: string;
    let aiTokensUsed: number | undefined;
    let text: string;

    if (useOpenAI) {
      console.log("Calling OpenAI with model:", selectedModel);
      const openaiResponse = await callOpenAIResponses(
        userPrompt,
        systemPrompt,
        "json_object",
        selectedModel,
        3
      );
      console.log("OpenAI response received, tokens:", openaiResponse.usage?.total_tokens);

      aiResponseModel = openaiResponse.model;
      aiTokensUsed = openaiResponse.usage?.total_tokens;

      // Parse OpenAI response
      const content: OpenAIOutputText[] = [];
      for (const item of openaiResponse.output) {
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
      console.log("Calling Grok AI with model:", selectedModel);
      const grokResponse = await callGrokResponses(
        userPrompt,
        systemPrompt,
        "json_object",
        selectedModel,
        3
      );
      console.log("Grok response received, tokens:", grokResponse.usage?.total_tokens);

      aiResponseModel = grokResponse.model;
      aiTokensUsed = grokResponse.usage?.total_tokens;

      // Parse Grok response
      const content: GrokOutputText[] = [];
      for (const item of grokResponse.output) {
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

    let analysisResult: MarketAnalysis;
    try {
      analysisResult = JSON.parse(text);
      console.log("Analysis result:", analysisResult.ticker, analysisResult.recommendedAction);
    } catch (parseError) {
      console.error("Failed to parse Grok response:", text.substring(0, 500));
      return {
        success: false,
        error: `Failed to parse Grok response as JSON: ${text.substring(0, 200)}`,
        metadata: {
          requestId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          eventTicker: eventIdentifier,
          marketsCount: markets.length,
          question,
          processingTimeMs: Date.now() - startTime,
        },
      };
    }

    // Return success response
    const processingTimeMs = Date.now() - startTime;
    console.log("Request completed in", processingTimeMs, "ms");

    // Build market URL based on platform
    let pmMarketUrl: string | undefined;
    if (analysisResult.ticker) {
      if (pmType === "Kalshi") {
        // Use the appropriate URL builder based on data provider
        const kalshiUrl = selectedDataProvider === 'dflow'
          ? buildDFlowKalshiMarketUrl(analysisResult.ticker)
          : buildDomeKalshiMarketUrl(analysisResult.ticker);
        pmMarketUrl = `Market on @Kalshi: ${kalshiUrl}`;
      } else {
        // For Polymarket, use the event slug
        pmMarketUrl = `Market on @Polymarket: ${buildPolymarketUrl(eventIdentifier)}`;
      }
    }

    return {
      success: true,
      data: analysisResult,
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventTicker: eventIdentifier,
        marketsCount: markets.length,
        question,
        processingTimeMs,
        grokModel: aiResponseModel,
        grokTokensUsed: aiTokensUsed,
      },
      "pm-market-url": pmMarketUrl,
    };
  } catch (error) {
    console.error("Unhandled error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventTicker: "",
        marketsCount: 0,
        question: question || "",
        processingTimeMs: Date.now() - startTime,
      },
    };
  }
}
