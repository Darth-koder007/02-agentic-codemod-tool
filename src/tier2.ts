import { readFileSync } from "node:fs";
import { createPatch } from "diff";
import { validateChange, type ValidationResult } from "./validate-change.js";
import type { LlmClient } from "./llm/types.js";

const SYSTEM_PROMPT = `You are an expert TypeScript/React refactoring tool. You will be given a
file's exact current content and a plain-English instruction. Output ONLY the complete new file
content: change what the instruction requires and leave everything else byte-for-byte identical.
Do not add explanation, do not wrap the output in markdown code fences, output raw file content
only.`;

export interface Tier2Result {
  status: "success" | "no-safe-transform";
  diff?: string;
  reason?: string;
}

function stripFences(text: string): string {
  const fenced = text.match(/```(?:\w*\n)?([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim() + "\n";
}

function buildPrompt(instruction: string, currentText: string, priorFailure?: string): string {
  const lines = [`Instruction: ${instruction}`, "", "Current file content:", currentText];
  if (priorFailure) {
    lines.push(
      "",
      "Your previous attempt did not pass validation. Fix it. Validation errors:",
      priorFailure
    );
  }
  return lines.join("\n");
}

function summarizeFailure(result: ValidationResult): string {
  const parts: string[] = [];
  if (!result.typeChecks) parts.push(`type errors: ${result.diagnostics.join("; ")}`);
  if (result.testsPassed === false) parts.push("existing tests failed");
  return parts.join("; ") || "validation failed for an unspecified reason";
}

/**
 * For an instruction with no canned (Tier 1) match. Never applies anything to disk itself —
 * `validateChange` sandboxes every attempt (write, check, always revert). One retry with the
 * failure fed back to the model; if that also fails, gives up honestly rather than presenting
 * something broken as safe.
 */
export async function runTier2(
  instruction: string,
  filePath: string,
  llmClient: LlmClient,
  testCommand?: string
): Promise<Tier2Result> {
  const originalText = readFileSync(filePath, "utf8");
  let lastFailureSummary = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const priorFailure = attempt === 0 ? undefined : lastFailureSummary;
    const prompt = buildPrompt(instruction, originalText, priorFailure);
    const response = await llmClient.generate({ system: SYSTEM_PROMPT, prompt });
    const proposedText = stripFences(response.text);

    const result = validateChange({
      filePath,
      proposedText,
      ...(testCommand ? { testCommand } : {}),
    });

    if (result.typeChecks && result.testsPassed !== false) {
      return { status: "success", diff: createPatch(filePath, originalText, proposedText) };
    }

    lastFailureSummary = summarizeFailure(result);
  }

  return {
    status: "no-safe-transform",
    reason: `No safe transform found after 2 attempts. Last validation failure: ${lastFailureSummary}`,
  };
}
