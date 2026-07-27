import { aiExplanationCases } from "../evals/ai-explanation-cases.mjs";
import { runAIEvaluationSuite } from "../lib/ai-evaluation.mjs";

const summary = runAIEvaluationSuite(aiExplanationCases);
console.log(JSON.stringify(summary, null, 2));
if (!summary.suitePassed) process.exitCode = 1;
