/**
 * Polyfactual research agent (ported/adapted from PredictOS `polyfactual-research`).
 *
 * Provides deep research capabilities using the Polyfactual API.
 * Returns comprehensive answers with citations for any research query.
 */

import { generatePolyfactualAnswer } from "../clients/polyfactual/client";
import type { PolyfactualResearchRequest, PolyfactualResearchResponse } from "./polyfactualResearch.types";

/**
 * Run a deep-research query through the Polyfactual API.
 */
export async function polyfactualResearch(
  input: PolyfactualResearchRequest,
): Promise<PolyfactualResearchResponse> {
  const startTime = Date.now();

  // Extract and validate query
  const { query } = input;

  if (!query || typeof query !== "string") {
    console.log("Missing or invalid query parameter");
    return {
      success: false,
      error: "Missing required parameter: 'query'",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        query: "",
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    console.log("Empty query parameter");
    return {
      success: false,
      error: "Query cannot be empty",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        query: "",
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  try {
    console.log("Starting Polyfactual research for query:", trimmedQuery.substring(0, 100));

    // Call Polyfactual API
    const polyfactualResponse = await generatePolyfactualAnswer(trimmedQuery, true);

    // Extract answer and citations from response
    const answerData = polyfactualResponse.data;
    const answer = answerData?.answer || JSON.stringify(answerData);
    const citations = answerData?.citations || [];

    // Return success response
    const processingTimeMs = Date.now() - startTime;
    console.log("Request completed in", processingTimeMs, "ms");

    return {
      success: true,
      answer: typeof answer === "string" ? answer : JSON.stringify(answer),
      citations: Array.isArray(citations) ? citations : [],
      data: answerData,
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        query: trimmedQuery,
        processingTimeMs,
      },
    };
  } catch (error) {
    console.error("Error:", error);
    const processingTimeMs = Date.now() - startTime;

    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        query: "",
        processingTimeMs,
      },
    };
  }
}
