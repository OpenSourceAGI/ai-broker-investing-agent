/**
 * Bookmaker agent (ported/adapted from PredictOS `bookmaker-agent`).
 *
 * Aggregates multiple agent analyses into a consolidated assessment.
 * Acts as a "judge" that weighs different agent opinions.
 */

import { bookmakerAnalysisPrompt } from "../ai/prompts/bookmakerAnalysis";
import { callGrokResponses } from "../ai/callGrok";
import { callOpenAIResponses } from "../ai/callOpenAI";
import type { GrokMessage, GrokOutputText, OpenAIMessage, OpenAIOutputText } from "../ai/types";
import type {
  AnalysisAggregatorRequest,
  AnalysisAggregatorResponse,
  AggregatedAnalysis,
} from "./bookmakerAgent.types";

// OpenAI model identifiers
const OPENAI_MODELS = ["gpt-5.2", "gpt-5.1", "gpt-5-nano", "gpt-4.1", "gpt-4.1-mini"];

/**
 * Determine if a model is an OpenAI model
 */
function isOpenAIModel(model: string): boolean {
  return OPENAI_MODELS.includes(model) || model.startsWith("gpt-");
}

/**
 * Aggregate multiple agent analyses (and optional PayAI data) into a single view.
 */
export async function bookmakerAgent(
  input: AnalysisAggregatorRequest,
): Promise<AnalysisAggregatorResponse> {
  const startTime = Date.now();

  const { analyses, x402Results, eventIdentifier, pmType, model } = input;

  // Validate required parameters
  const hasAnalyses = analyses && Array.isArray(analyses) && analyses.length > 0;
  const hasX402Results = x402Results && Array.isArray(x402Results) && x402Results.length > 0;

  if (!hasAnalyses && !hasX402Results) {
    return {
      success: false,
      error: "Missing or invalid 'analyses' or 'x402Results' parameter",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: model || "unknown",
        agentsAggregated: 0,
      },
    };
  }

  const totalResults = (analyses?.length || 0) + (x402Results?.length || 0);
  if (totalResults < 2) {
    return {
      success: false,
      error: "Need at least 2 data sources (analyses + PayAI results) to aggregate",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: model || "unknown",
        agentsAggregated: 0,
      },
    };
  }

  console.log(`Aggregating ${analyses?.length || 0} analyses + ${x402Results?.length || 0} PayAI results`);

  if (!eventIdentifier) {
    return {
      success: false,
      error: "Missing required parameter: 'eventIdentifier'",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        model: model || "unknown",
        agentsAggregated: 0,
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
        agentsAggregated: 0,
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
        agentsAggregated: 0,
      },
    };
  }

  try {
    const useOpenAI = isOpenAIModel(model);

    // Build prompt and call AI
    const agentAnalyses = (analyses || []).map(a => ({
      agentId: a.agentId,
      model: a.model,
      analysis: a.analysis,
    }));

    const { systemPrompt, userPrompt } = bookmakerAnalysisPrompt(agentAnalyses, x402Results || [], eventIdentifier, pmType);

    let aiResponseModel: string;
    let aiTokensUsed: number | undefined;
    let text: string;

    if (useOpenAI) {
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
      console.log("Calling Grok AI with model:", model);
      const grokResponse = await callGrokResponses(
        userPrompt,
        systemPrompt,
        "json_object",
        model,
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

    let aggregatedResult: AggregatedAnalysis;
    try {
      aggregatedResult = JSON.parse(text);
      console.log("Aggregated result:", aggregatedResult.recommendedAction, "consensus:", aggregatedResult.agentConsensus?.agreementLevel);
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
          agentsAggregated: analyses.length,
        },
      };
    }

    const processingTimeMs = Date.now() - startTime;
    console.log("Request completed in", processingTimeMs, "ms");

    return {
      success: true,
      data: aggregatedResult,
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTimeMs,
        model: aiResponseModel,
        tokensUsed: aiTokensUsed,
        agentsAggregated: totalResults,
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
        agentsAggregated: 0,
      },
    };
  }
}
