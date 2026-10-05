import { expect, it } from "vitest";
import { graphRun } from "./helpers";
import { EVENT_STANCE_TEXT } from "../../src/trading-agents/utils/strategy-prompt";
import type { PromptRole } from "../../src/trading-agents/utils/strategy-prompt";

// Recorded scripted-client rule name → the role whose mandate its prompt must carry.
const RULE_ROLES: Record<string, PromptRole> = {
  bull: "a Bull Analyst",
  bear: "a Bear Analyst",
  "research-manager": "an Investment Judge",
  trader: "a trading agent",
  risky: "a Risk-Seeking Analyst",
  safe: "a Risk-Conservative Analyst",
  neutral: "a Neutral Risk Analyst",
  "risk-judge": "a Risk Judge",
  "fund-manager": "the **Fund Manager**",
};

it("keeps each agent's own stance in event prompts, and only its own", async () => {
  const run = await graphRun();
  const seen = new Set(run.llm.calls.map((call) => call.rule));
  expect([...seen].sort()).toEqual(Object.keys(RULE_ROLES).sort());

  for (const { rule, prompt } of run.llm.calls) {
    const role = RULE_ROLES[rule];
    expect(prompt).toContain(`Your stance: ${EVENT_STANCE_TEXT[role]}`);
    for (const [other, stance] of Object.entries(EVENT_STANCE_TEXT)) {
      if (other !== role) expect(prompt).not.toContain(stance);
    }
  }
});

it("gives the two debaters opposite mandates", () => {
  expect(EVENT_STANCE_TEXT["a Bull Analyst"]).toMatch(/case FOR taking/);
  expect(EVENT_STANCE_TEXT["a Bear Analyst"]).toMatch(/case AGAINST taking/);
});
