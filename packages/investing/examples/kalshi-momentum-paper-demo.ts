import { runKalshiMomentumResearchDemo } from "./fixtures/kalshi-momentum-research.js";

const result = await runKalshiMomentumResearchDemo();

console.log("Paper only; recorded ticks and model responses; no credentials or network.");
console.log("PyKalshi momentum → investing research/debate/judge/trader → FundManager approval → paper portfolio checks");
for (const step of result.steps.filter((step) => step.researchSignal)) {
  console.log(`\nStrategy: ${step.intent.action} ${step.intent.outcome} ${step.intent.quantity} at ${step.intent.priceCents}c`);
  console.log(step.researchSignal!.reasoning);
  console.log(`Paper executor: ${step.execution.status}`);
}
console.log(result.report);
console.log("\nStructured result:");
console.log(JSON.stringify(result, null, 2));
