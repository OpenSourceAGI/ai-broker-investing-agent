import { describe, it, expect, vi } from "vitest";

// Export wiring does not require the unrelated native XGBoost runtime.
vi.mock("../src/correlate/predict-statistics", () => ({}));
import * as predictionMarkets from "../src/prediction-markets";
import * as investing from "../src/index";

describe("prediction-markets module", () => {
  const names = [
    "runEventAnalysisAgent",
    "runBookmakerAgent",
    "runMapperAgent",
    "runKalshiMomentumPaperAgent",
    "runKalshiMomentumPaperAgentWithResearch",
    "predictionMarketResearch",
    "reviewPredictionMarketIntent",
    "createKalshiMomentumState",
    "findArbitrage",
    "getEvents",
  ] as const;

  it.each(names)("exports %s from investing/prediction-markets", (name) => {
    expect(typeof (predictionMarkets as Record<string, unknown>)[name]).toBe("function");
  });

  it.each(names)("re-exports %s from the investing barrel", (name) => {
    expect((investing as Record<string, unknown>)[name]).toBe(
      (predictionMarkets as Record<string, unknown>)[name],
    );
  });
});
