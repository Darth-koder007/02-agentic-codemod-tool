import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createPatch } from "diff";
import { Project } from "ts-morph";
import { parseInstruction } from "./instruction-parser.js";
import { runTier2 } from "./tier2.js";
import { findNearestTsConfig, validateChange } from "./validate-change.js";
import { convertClassToFunctionComponent } from "./transforms/convert-class-to-function-component.js";
import { extractMagicLiteral } from "./transforms/extract-magic-literal.js";
import { renameIdentifier } from "./transforms/rename-identifier.js";
import { renameImportPath } from "./transforms/rename-import-path.js";
import { renameJsxProp } from "./transforms/rename-jsx-prop.js";
import type { LlmClient } from "./llm/types.js";
import type { ParsedInstruction } from "./types.js";

export interface CodemodOutcome {
  file: string;
  status: "success" | "not-applicable" | "unsafe" | "no-safe-transform";
  tier: 1 | 2;
  diff?: string;
  reason?: string;
}

function applyTier1(
  sourceFile: ReturnType<Project["addSourceFileAtPath"]>,
  parsed: ParsedInstruction
) {
  switch (parsed.kind) {
    case "rename-identifier":
      return renameIdentifier(sourceFile, {
        oldName: parsed.params.oldName!,
        newName: parsed.params.newName!,
      });
    case "rename-import-path":
      return renameImportPath(sourceFile, {
        oldModule: parsed.params.oldModule!,
        newModule: parsed.params.newModule!,
      });
    case "rename-jsx-prop":
      return renameJsxProp(sourceFile, {
        tag: parsed.params.tag!,
        oldProp: parsed.params.oldProp!,
        newProp: parsed.params.newProp!,
      });
    case "extract-magic-literal":
      return extractMagicLiteral(sourceFile, {
        literal: parsed.params.literal!,
        constantName: parsed.params.constantName!,
      });
    case "convert-class-to-function-component":
      return convertClassToFunctionComponent(sourceFile, {
        ...(parsed.params.className ? { className: parsed.params.className } : {}),
      });
    default:
      throw new Error(`Unreachable: ${parsed.kind} is not a Tier 1 kind.`);
  }
}

/**
 * One entry point for both tiers, sharing the same validation gate (M2.6) — a canned (Tier 1)
 * transform is just as capable of producing something that doesn't type-check (see the Select/
 * Checkbox-style limitations found in Project 1) as an LLM-generated one, so it goes through the
 * exact same sandboxed check, not a shortcut.
 */
export async function runCodemodOnFile(
  instruction: string,
  filePath: string,
  llmClient: LlmClient,
  testCommand?: string
): Promise<CodemodOutcome> {
  const parsed = parseInstruction(instruction);

  if (parsed.kind === "unknown") {
    const result = await runTier2(instruction, filePath, llmClient, testCommand);
    return result.status === "success"
      ? {
          file: filePath,
          status: "success",
          tier: 2,
          ...(result.diff ? { diff: result.diff } : {}),
        }
      : {
          file: filePath,
          status: "no-safe-transform",
          tier: 2,
          ...(result.reason ? { reason: result.reason } : {}),
        };
  }

  const originalText = readFileSync(filePath, "utf8");
  const tsConfigFilePath = findNearestTsConfig(dirname(filePath));
  const project = new Project({
    ...(tsConfigFilePath ? { tsConfigFilePath } : {}),
    skipAddingFilesFromTsConfig: true,
  });
  const sourceFile = project.addSourceFileAtPath(filePath);

  const transformResult = applyTier1(sourceFile, parsed);
  if (!transformResult.applied) {
    return {
      file: filePath,
      status: "not-applicable",
      tier: 1,
      ...(transformResult.skipReason ? { reason: transformResult.skipReason } : {}),
    };
  }

  const proposedText = sourceFile.getFullText();
  const validation = validateChange({
    filePath,
    proposedText,
    ...(testCommand ? { testCommand } : {}),
  });

  if (!validation.typeChecks || validation.testsPassed === false) {
    return {
      file: filePath,
      status: "unsafe",
      tier: 1,
      reason: `Canned transform matched but the result doesn't pass validation: ${validation.diagnostics.join("; ")}`,
    };
  }

  return {
    file: filePath,
    status: "success",
    tier: 1,
    diff: createPatch(filePath, originalText, proposedText),
  };
}
