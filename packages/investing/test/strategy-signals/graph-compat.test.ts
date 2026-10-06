import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TradingAgentsGraph } from "../../src/trading-agents/graph/trading-graph";
import type { LLMClient } from "../../src/trading-agents/utils/llm-client";

it("retains all eight pre-edit legacy prompts byte for byte", async () => {
  const prompts: string[] = [];
  const llm: LLMClient = {
    async invoke(input) {
      const text = typeof input === "string" ? input : JSON.stringify(input, null, 2);
      prompts.push(text);
      return {
        content: text.includes("Bull Analyst advocating")
          ? "Recorded bull case."
          : text.includes("Bear Analyst advocating")
            ? "Recorded bear case."
            : text.includes("Investment Judge tasked")
              ? "FINAL DECISION: INVEST"
              : "FINAL TRANSACTION PROPOSAL: BUY",
      };
    },
  };
  const graph = new TradingAgentsGraph([], false, undefined, { llm: { deep: llm, quick: llm } });
  expect((await graph.propagate("FIXTURE", "2026-01-01")).signal.action).toBe("BUY");
  expect(prompts).toHaveLength(8);
  prompts.forEach((text, i) =>
    expect(text).toBe(
      readFileSync(
        new URL(`./fixtures/legacy-prompts/${String(i).padStart(2, "0")}.txt`, import.meta.url),
        "utf8",
      ),
    ),
  );
});
