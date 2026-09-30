import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { Project } from "ts-morph";

export interface ValidateChangeOptions {
  filePath: string;
  proposedText: string;
  /** Shell command to run this file's test suite, e.g. "pnpm vitest run src/foo.test.ts". Omit to skip the test-run step (type-check alone still gates the result — see PLAN.md M2.4 for why this is an honest, scoped limitation rather than a universal test-runner auto-detector). */
  testCommand?: string;
}

export interface ValidationResult {
  typeChecks: boolean;
  testsPassed: boolean | "skipped";
  diagnostics: string[];
}

export function findNearestTsConfig(startDir: string): string | undefined {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Temporarily writes `proposedText` over the real file on disk, type-checks it (and runs its
 * test suite if `testCommand` is given), then ALWAYS restores the original content in a finally
 * block — this is the sandboxing the plan calls for: the file is genuinely validated in place
 * (so its real imports/types resolve), but the on-disk change never survives past this function
 * regardless of outcome. Only the caller's own `--apply` step (M2.5) makes a change durable.
 */
export function validateChange(options: ValidateChangeOptions): ValidationResult {
  const { filePath, proposedText, testCommand } = options;
  const originalText = readFileSync(filePath, "utf8");

  try {
    writeFileSync(filePath, proposedText);

    const tsConfigFilePath = findNearestTsConfig(dirname(filePath));
    const diagnostics: string[] = [];
    let typeChecks = true;

    if (tsConfigFilePath) {
      const project = new Project({ tsConfigFilePath, skipAddingFilesFromTsConfig: true });
      const sourceFile = project.addSourceFileAtPath(filePath);
      const fileDiagnostics = sourceFile.getPreEmitDiagnostics();
      typeChecks = fileDiagnostics.length === 0;
      diagnostics.push(...fileDiagnostics.map((d) => String(d.getMessageText())));
    } else {
      typeChecks = false;
      diagnostics.push(`No tsconfig.json found above ${filePath}; cannot type-check.`);
    }

    let testsPassed: boolean | "skipped" = "skipped";
    if (testCommand) {
      try {
        execFileSync(testCommand, { shell: true, stdio: "pipe" });
        testsPassed = true;
      } catch (error) {
        testsPassed = false;
        diagnostics.push(`Test command failed: ${(error as Error).message}`);
      }
    }

    return { typeChecks, testsPassed, diagnostics };
  } finally {
    writeFileSync(filePath, originalText);
  }
}
