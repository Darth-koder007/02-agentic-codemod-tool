#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyPatch } from "diff";
import { Command } from "commander";
import { createLlmClient } from "./llm/create-client.js";
import { runCodemodOnFile, type CodemodOutcome } from "./run-codemod.js";

const CODE_EXTENSIONS = new Set([".ts", ".tsx"]);

function listTargetFiles(pathArg: string): string[] {
  const stats = statSync(pathArg);
  if (stats.isFile()) return [pathArg];

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (CODE_EXTENSIONS.has(fullPath.slice(fullPath.lastIndexOf(".")))) {
        files.push(fullPath);
      }
    }
  };
  walk(pathArg);
  return files;
}

function printOutcome(outcome: CodemodOutcome): void {
  console.log(`\n${outcome.file} [tier ${outcome.tier}] — ${outcome.status}`);
  if (outcome.reason) console.log(`  ${outcome.reason}`);
  if (outcome.diff) console.log(`\n${outcome.diff}`);
}

const program = new Command();
program.name("codemod").description("Plain-English instruction -> reviewable code transform");

program
  .command("run")
  .argument("<instruction>", "plain-English description of the change")
  .option("--path <path>", "file or directory to target", ".")
  .option("--apply", "write the change to disk (default: dry-run)", false)
  .option("--yes", "skip the confirmation prompt when using --apply", false)
  .option("--test-command <command>", "shell command to validate the change against (optional)")
  .action(
    async (
      instruction: string,
      options: { path: string; apply: boolean; yes: boolean; testCommand?: string }
    ) => {
      const llmClient = createLlmClient();
      const files = listTargetFiles(options.path);
      const outcomes: CodemodOutcome[] = [];

      for (const file of files) {
        const outcome = await runCodemodOnFile(instruction, file, llmClient, options.testCommand);
        outcomes.push(outcome);
        printOutcome(outcome);
      }

      const successes = outcomes.filter((o) => o.status === "success" && o.diff);

      if (options.apply && successes.length > 0) {
        if (!options.yes) {
          console.log(
            `\n${successes.length} file(s) would be changed. Re-run with --yes to apply non-interactively, or without --apply to keep this a dry run.`
          );
        } else {
          for (const outcome of successes) {
            const currentText = readFileSync(outcome.file, "utf8");
            const patched = applyPatch(currentText, outcome.diff!);
            if (patched === false) {
              console.error(`Could not apply the diff for ${outcome.file} — skipped.`);
              continue;
            }
            writeFileSync(outcome.file, patched);
            console.log(`Applied: ${outcome.file}`);
          }
        }
      }

      const hasUnsafe = outcomes.some((o) => o.status === "unsafe");
      process.exitCode = hasUnsafe ? 1 : 0;
    }
  );

program.parse();
