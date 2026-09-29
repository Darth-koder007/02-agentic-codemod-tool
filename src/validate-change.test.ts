import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateChange } from "./validate-change.js";

const filePath = fileURLToPath(new URL("../fixtures/tier2-target.ts", import.meta.url));

describe("validateChange", () => {
  it("reports typeChecks: true for a valid replacement, and restores the original file afterward", () => {
    const original = readFileSync(filePath, "utf8");

    const result = validateChange({
      filePath,
      proposedText: `export function greet(name: string): string {\n  return \`Hi, \${name}\`;\n}\n`,
    });

    expect(result.typeChecks).toBe(true);
    expect(readFileSync(filePath, "utf8")).toBe(original);
  });

  it("reports typeChecks: false for a replacement with a real type error, and still restores the file", () => {
    const original = readFileSync(filePath, "utf8");

    const result = validateChange({
      filePath,
      proposedText: `export function greet(name: string): string {\n  return name.thisMethodDoesNotExist();\n}\n`,
    });

    expect(result.typeChecks).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(readFileSync(filePath, "utf8")).toBe(original);
  });

  it("restores the original file even when the proposed text has a syntax error", () => {
    const original = readFileSync(filePath, "utf8");

    validateChange({ filePath, proposedText: "export function greet( {{{ broken" });

    expect(readFileSync(filePath, "utf8")).toBe(original);
  });
});
