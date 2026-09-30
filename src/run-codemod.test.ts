import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { runCodemodOnFile } from "./run-codemod.js";
import type { LlmClient } from "./llm/types.js";

function fixture(name: string): string {
  return fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
}

const unusedLlmClient: LlmClient = {
  generate: vi.fn(async () => ({ text: "should not be called", provider: "fake", model: "fake" })),
};

describe("runCodemodOnFile", () => {
  it("routes a canned instruction to Tier 1 and succeeds, never touching the LLM client", async () => {
    // rename-identifier-input.ts has no external module imports, so it's a clean fixture for
    // exercising the *real* type-check gate — unlike rename-import-path-input.ts, which imports
    // "lodash" and would correctly (not a bug) come back "unsafe" here, since neither lodash nor
    // lodash-es is actually installed in this repo. That's real, accurate safety-gate behavior,
    // just not what this particular test is checking.
    const filePath = fixture("rename-identifier-input.ts");
    const original = readFileSync(filePath, "utf8");

    const result = await runCodemodOnFile(
      "rename function `calculateTotal` to `sumItems`",
      filePath,
      unusedLlmClient
    );

    expect(result.status).toBe("success");
    expect(result.tier).toBe(1);
    expect(result.diff).toContain("sumItems");
    expect(unusedLlmClient.generate).not.toHaveBeenCalled();
    expect(readFileSync(filePath, "utf8")).toBe(original); // dry-run: never written
  });

  it("reports not-applicable when a canned instruction matches no known declaration in this file", async () => {
    const filePath = fixture("rename-identifier-input.ts");

    const result = await runCodemodOnFile(
      "rename identifier `doesNotExist` to `x`",
      filePath,
      unusedLlmClient
    );

    expect(result.status).toBe("not-applicable");
    expect(result.tier).toBe(1);
    expect(result.reason).toContain("doesNotExist");
  });

  it("reports unsafe when a canned transform matches but the result doesn't type-check in this repo", async () => {
    const filePath = fixture("rename-import-path-input.ts");

    const result = await runCodemodOnFile(
      "Replace imports of 'lodash' with 'lodash-es'",
      filePath,
      unusedLlmClient
    );

    expect(result.status).toBe("unsafe");
    expect(result.tier).toBe(1);
    expect(result.reason).toContain("lodash-es");
  });

  it("routes an uncanned instruction to Tier 2", async () => {
    // Dedicated fixture (not tier2-target.ts) — that file is also used by validate-change.test.ts,
    // and vitest runs different test files concurrently, so two tests independently reading
    // "original" content and writing/restoring the same file race each other. That's exactly
    // what caused real, observed corruption during this project's development (see PLAN.md
    // M2.5/M2.6) — every test that exercises the write-then-restore sandbox needs its own file.
    const filePath = fixture("tier2-target-3.ts");
    const client: LlmClient = {
      generate: vi.fn(async () => ({
        text: "export function greet(name: string): string {\n  return `Hi, ${name}`;\n}\n",
        provider: "fake",
        model: "fake",
      })),
    };

    const result = await runCodemodOnFile("Make the greeting casual", filePath, client);

    expect(result.status).toBe("success");
    expect(result.tier).toBe(2);
    expect(client.generate).toHaveBeenCalledOnce();
  });
});
