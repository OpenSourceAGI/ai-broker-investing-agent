import { formatDemoSummary, runAllStrategiesDemo } from "../src/strategy-signals/demo";

const result = await runAllStrategiesDemo();
console.log(formatDemoSummary(result));
console.log("Full trace (JSON):");
console.log(JSON.stringify(result, null, 2));
