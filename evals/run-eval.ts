import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createLlmClient } from "../src/llm/create-client.js";
import { runCodemodOnFile, type CodemodOutcome } from "../src/run-codemod.js";
import { EVAL_CASES, type EvalCase } from "./cases.js";
import type { LlmClient } from "../src/llm/types.js";

interface CaseRun {
  case: EvalCase;
  outcome: CodemodOutcome;
  matched: boolean;
}

interface Summary {
  date: string;
  providerModel: string;
  caseCount: number;
  tier1SuccessRate: number;
  tier2SuccessRate: number;
  correctRefusalRate: number;
  tier2RetryRate: number;
}

function targetPath(name: string): string {
  return fileURLToPath(new URL(`./targets/${name}`, import.meta.url));
}

async function runOnce(llmClient: LlmClient): Promise<{ runs: CaseRun[]; summary: Summary }> {
  const runs: CaseRun[] = [];

  for (const evalCase of EVAL_CASES) {
    const outcome = await runCodemodOnFile(
      evalCase.instruction,
      targetPath(evalCase.target),
      llmClient
    );
    runs.push({ case: evalCase, outcome, matched: outcome.status === evalCase.expectedStatus });
  }

  const byTier = (tier: 1 | 2) => runs.filter((r) => r.case.tier === tier);
  const rate = (rs: CaseRun[]) => (rs.length ? rs.filter((r) => r.matched).length / rs.length : 1);

  const tier1Runs = byTier(1);
  const tier2Runs = byTier(2);
  const adversarialRuns = runs.filter((r) => r.case.adversarial);
  const tier2RetriedCount = tier2Runs.filter((r) => r.outcome.attempts === 2).length;

  const summary: Summary = {
    date: process.env.EVAL_DATE ?? new Date(0).toISOString().slice(0, 10),
    providerModel: `${process.env.LLM_PROVIDER ?? "ollama"}:${process.env.LLM_MODEL ?? "(default)"}`,
    caseCount: EVAL_CASES.length,
    tier1SuccessRate: Number(rate(tier1Runs).toFixed(3)),
    tier2SuccessRate: Number(rate(tier2Runs).toFixed(3)),
    correctRefusalRate: Number(rate(adversarialRuns).toFixed(3)),
    tier2RetryRate: tier2Runs.length
      ? Number((tier2RetriedCount / tier2Runs.length).toFixed(3))
      : 0,
  };

  return { runs, summary };
}

function average(values: number[]): number {
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3));
}

// Tier 1 is deterministic (no LLM call), so one run is exact. Tier 2's success and
// correct-refusal rates are genuinely noisy — repeated live runs during development showed
// swings of 25-33 points on the exact same 24 cases (see PLAN.md's M2.8 entry). A baseline
// written from a single run can land anywhere in that range, including the range's ceiling,
// which then makes every honest future run look like a regression even with no code change.
// Averaging N runs — for BOTH writing the baseline and checking against it — keeps the two
// comparable and shrinks the sampling noise enough for a fixed tolerance to mean something.
const EVAL_RUNS = 3;

async function runManyAndAverage(
  llmClient: LlmClient
): Promise<{ allRuns: CaseRun[][]; averaged: Summary }> {
  // Sequential, not concurrent: each run's validateChange writes over the same on-disk target
  // files and restores them afterward (see PLAN.md's M2.6 race-condition writeup) — running
  // these in parallel would race on those same files exactly like that bug did.
  const allRuns: CaseRun[][] = [];
  const summaries: Summary[] = [];
  for (let i = 0; i < EVAL_RUNS; i++) {
    const { runs, summary } = await runOnce(llmClient);
    allRuns.push(runs);
    summaries.push(summary);
  }

  const averaged: Summary = {
    ...summaries[0]!,
    tier1SuccessRate: average(summaries.map((s) => s.tier1SuccessRate)),
    tier2SuccessRate: average(summaries.map((s) => s.tier2SuccessRate)),
    correctRefusalRate: average(summaries.map((s) => s.correctRefusalRate)),
    tier2RetryRate: average(summaries.map((s) => s.tier2RetryRate)),
  };

  return { allRuns, averaged };
}

async function main() {
  const llmClient = createLlmClient();
  const isCheckMode = process.argv.includes("--check");
  const baselinePath = fileURLToPath(new URL("./baseline.json", import.meta.url));
  const REGRESSION_TOLERANCE = 0.1;

  const { allRuns, averaged } = await runManyAndAverage(llmClient);

  if (isCheckMode) {
    const previous = JSON.parse(readFileSync(baselinePath, "utf8"));
    console.log(JSON.stringify(averaged, null, 2));
    const drops = [
      previous.tier1SuccessRate - averaged.tier1SuccessRate,
      previous.tier2SuccessRate - averaged.tier2SuccessRate,
      previous.correctRefusalRate - averaged.correctRefusalRate,
    ];
    if (drops.some((d) => d > REGRESSION_TOLERANCE)) {
      console.error(
        `Eval scores regressed beyond the ${REGRESSION_TOLERANCE * 100}% noise tolerance.`
      );
      process.exit(1);
    }
    return;
  }

  writeFileSync(baselinePath, JSON.stringify(averaged, null, 2) + "\n");

  const lastRun = allRuns[allRuns.length - 1]!;
  const mismatches = lastRun.filter((r) => !r.matched);
  const recurring = lastRun.filter(
    (r) =>
      !r.matched &&
      allRuns.every((run) => run.some((rr) => rr.case.id === r.case.id && !rr.matched))
  );

  const lines = [
    "# Eval results",
    "",
    "Regenerated by `evals/run-eval.ts` — do not hand-edit. Run `pnpm eval` to reproduce, `pnpm eval:check` to gate a PR against the last recorded baseline.",
    "",
    `- **Date:** ${averaged.date}`,
    `- **Provider/model:** ${averaged.providerModel}`,
    `- **Cases:** ${averaged.caseCount} (12 Tier 1, 12 Tier 2; 8 of the 24 are adversarial — designed to correctly fail)`,
    `- **Methodology:** mean of ${EVAL_RUNS} consecutive live runs — see the variance note below for why a single run isn't trustworthy for the Tier 2 numbers.`,
    "",
    "## Tier 1 (canned transforms) success rate",
    "",
    `**${(averaged.tier1SuccessRate * 100).toFixed(1)}%** — fraction of the 12 Tier 1 cases where the actual outcome (success / not-applicable / unsafe) matched what was expected. Deterministic (no LLM call), so this is exact, not an average in practice.`,
    "",
    "## Tier 2 (LLM-in-the-loop) success rate",
    "",
    `**${(averaged.tier2SuccessRate * 100).toFixed(1)}%** — same metric, over the 12 Tier 2 cases. Retry rate: **${(averaged.tier2RetryRate * 100).toFixed(1)}%** of Tier 2 cases needed the one retry before succeeding or giving up.`,
    "",
    "## Correct-refusal rate (adversarial subset)",
    "",
    `**${(averaged.correctRefusalRate * 100).toFixed(1)}%** — of the 8 cases deliberately designed to NOT succeed (a nonexistent target, an unresolvable import, an undeclared reference...), the fraction where the tool correctly reported \`not-applicable\`, \`unsafe\`, or \`no-safe-transform\` rather than incorrectly claiming success.`,
    "",
    "## A note on Tier 2 variance",
    "",
    "Tier 1 is deterministic and reproduces exactly run to run. Tier 2's success and correct-refusal rates are genuine `llama3.2:3b` sampling noise: single live runs during development (same 24 cases, same code, no changes between runs) ranged 75-100% and 67-100% respectively. The model sometimes recognizes an instruction references something that doesn't exist (a fake npm package, an undeclared variable) and correctly refuses; other times it quietly substitutes a safe workaround that still type-checks and reports that as success. `validateChange`'s type-check-only gate judges the output, not fidelity to the instruction, so it can't tell those two cases apart — this is a real, current limitation of the design, not a bug fixed by a stricter heuristic. Averaging 3 runs (here and in `pnpm eval:check`) narrows the reported number's spread but doesn't eliminate the underlying non-determinism.",
    "",
    mismatches.length > 0
      ? `${mismatches.length} case(s) with an unexpected outcome in the final of the ${EVAL_RUNS} runs (${recurring.length} of which missed in all ${EVAL_RUNS} runs — the rest are one-off sampling noise):\n${mismatches
          .map(
            (m) =>
              `- \`${m.case.id}\`: expected \`${m.case.expectedStatus}\`, got \`${m.outcome.status}\`${m.outcome.reason ? ` (${m.outcome.reason})` : ""}${recurring.some((r) => r.case.id === m.case.id) ? " — recurring across all runs" : ""}`
          )
          .join("\n")}`
      : "No unexpected outcomes in the final run.",
  ];

  writeFileSync(fileURLToPath(new URL("./results.md", import.meta.url)), lines.join("\n") + "\n");
  console.log(JSON.stringify(averaged, null, 2));
}

main();
