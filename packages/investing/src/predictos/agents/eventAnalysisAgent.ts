/**
 * Event analysis agent (ported/adapted from PredictOS `event-analysis-agent`).
 *
 * Individual analysis agent that takes market data and returns AI analysis.
 * Supports multiple AI providers:
 * - Grok (xAI) - via XAI_API_KEY
 * - OpenAI - via OPENAI_API_KEY
 * - BlockRun - via BLOCKRUN_WALLET_KEY (x402 micropayments, no API key required)
 *
 * BlockRun models (e.g., "blockrun/gpt-4o", "blockrun/claude-sonnet-4") use
 * wallet-based pay-per-request payments on Base chain instead of API keys.
 */

import { analyzeEventMarketsPrompt } from "../ai/prompts/analyzeEventMarkets";
import { callGrokResponses } from "../ai/callGrok";
import { callOpenAIResponses } from "../ai/callOpenAI";
import { callBlockRunResponses, isBlockRunModel } from "../ai/callBlockRun";
import type {
  GrokMessage,
  GrokOutputText,
  OpenAIMessage,
  OpenAIOutputText,
  BlockRunMessage,
  BlockRunOutputText,
} from "../ai/types";
import type {
  EventAnalysisAgentRequest,
  EventAnalysisAgentResponse,
  MarketAnalysis,
  GrokTool,
} from "./eventAnalysisAgent.types";

// OpenAI model identifiers
const OPENAI_MODELS = ["gpt-5.2", "gpt-5.1", "gpt-5-nano", "gpt-4.1", "gpt-4.1-mini"];

/**
 * Determine if a model is an OpenAI model
 */
function isOpenAIModel(model: string): boolean {
  return OPENAI_MODELS.includes(model) || model.startsWith("gpt-");
}

/**
 * Determine the AI provider for a given model
 * Priority: BlockRun > OpenAI > Grok (default)
 */
function getAIProvider(model: string): "blockrun" | "openai" | "grok" {
  if (isBlockRunModel(model)) {
    return "blockrun";
  }
  if (isOpenAIModel(model)) {
    return "openai";
  }
  return "grok";
}

/**
 * Run the event analysis agent against a set of markets for a single event.
 */
export async function eventAnalysisAgent(
  input: EventAnalysisAgentRequest,
): Promise<EventAnalysisAgentResponse> {
  const startTime = Date.now();

  const { markets, eventIdentifier, pmType, model, question, tools, userCommand } = input;

  // Validate required parameters
  if (!markets || !Array.isArray(markets) || markets.length === 0) {
    return {
      success: false,
      error: "Missing or invalid 'markets' parameter",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: model || "unknown",
      },
    };
  }

  if (!eventIdentifier) {
    return {
      success: false,
      error: "Missing required parameter: 'eventIdentifier'",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: model || "unknown",
      },
    };
  }

  if (!pmType || (pmType !== "Kalshi" && pmType !== "Polymarket")) {
    return {
      success: false,
      error: "Invalid 'pmType'. Must be 'Kalshi' or 'Polymarket'",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: model || "unknown",
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
      },
    };
  }

  try {
    const aiProvider = getAIProvider(model);
    const defaultQuestion = "What is the best trading opportunity in this market? Analyze the probability and provide a recommendation.";
    const analysisQuestion = question || defaultQuestion;

    // Build prompt and call AI (pass tools to include source requirements in prompt, and userCommand if provided)
    const { systemPrompt, userPrompt } = analyzeEventMarketsPrompt(markets, eventIdentifier, analysisQuestion, pmType, tools, userCommand);

    let aiResponseModel: string;
    let aiTokensUsed: number | undefined;
    let aiPaymentCost: string | undefined;
    let text: string;

    if (aiProvider === "blockrun") {
      // BlockRun: wallet-based x402 micropayments, no API key required
      console.log("Calling BlockRun with model:", model);
      const enableSearch = tools?.includes("x_search") || tools?.includes("web_search");
      const blockrunResponse = await callBlockRunResponses(
        userPrompt,
        systemPrompt,
        "json_object",
        model,
        3,
        enableSearch
      );
      console.log("BlockRun response received, tokens:", blockrunResponse.usage?.total_tokens, "cost:", blockrunResponse.blockrun?.paymentCost);

      aiResponseModel = blockrunResponse.model;
      aiTokensUsed = blockrunResponse.usage?.total_tokens;
      aiPaymentCost = blockrunResponse.blockrun?.paymentCost;

      // Parse BlockRun response (same structure as OpenAI/Grok)
      const content: BlockRunOutputText[] = [];
      for (const item of blockrunResponse.output) {
        if (item.type === "message") {
          const messageItem = item as BlockRunMessage;
          content.push(...messageItem.content);
        }
      }

      text = content
        .map((item) => item.text)
        .filter((t) => t !== undefined)
        .join("\n");
    } else if (aiProvider === "openai") {
      console.log("Calling OpenAI with model:", model);
      const openaiResponse = await callOpenAIResponses(
        userPrompt,
        systemPrompt,
        "json_object",
        model,
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
      console.log("Calling Grok AI with model:", model, "tools:", tools);
      const grokResponse = await callGrokResponses(
        userPrompt,
        systemPrompt,
        "json_object",
        model,
        3,
        tools as GrokTool[] | undefined
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
    } catch {
      console.error("Failed to parse AI response:", text.substring(0, 500));
      return {
        success: false,
        error: `Failed to parse AI response as JSON`,
        metadata: {
          requestId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime,
          model: aiResponseModel,
          tokensUsed: aiTokensUsed,
        },
      };
    }

    const processingTimeMs = Date.now() - startTime;
    console.log("Request completed in", processingTimeMs, "ms");

    return {
      success: true,
      data: analysisResult,
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs,
        model: aiResponseModel,
        tokensUsed: aiTokensUsed,
        // BlockRun-specific: include payment cost if available
        ...(aiPaymentCost && { paymentCost: aiPaymentCost }),
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
      },
    };
  }
}
