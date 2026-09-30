import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { convertClassToFunctionComponent } from "./convert-class-to-function-component.js";
import { extractMagicLiteral } from "./extract-magic-literal.js";
import { renameIdentifier } from "./rename-identifier.js";
import { renameImportPath } from "./rename-import-path.js";
import { renameJsxProp } from "./rename-jsx-prop.js";

function loadFixtureInMemory(name: string) {
  const path = fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
  const text = readFileSync(path, "utf8");
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile(name, text);
}

describe("renameIdentifier", () => {
  it("renames a top-level function and all its references", () => {
    const sourceFile = loadFixtureInMemory("rename-identifier-input.ts");
    const result = renameIdentifier(sourceFile, { oldName: "calculateTotal", newName: "sumItems" });

    expect(result.applied).toBe(true);
    expect(sourceFile.getFullText()).toContain("function sumItems(items: number[]): number {");
    expect(sourceFile.getFullText()).toContain("const result = sumItems([1, 2, 3]);");
    expect(sourceFile.getFullText()).toContain("console.log(sumItems, result);");
    expect(sourceFile.getFullText()).not.toContain("calculateTotal");
  });

  it("skips with a clear reason when the named declaration doesn't exist", () => {
    const sourceFile = loadFixtureInMemory("rename-identifier-input.ts");
    const result = renameIdentifier(sourceFile, { oldName: "doesNotExist", newName: "x" });

    expect(result.applied).toBe(false);
    expect(result.skipReason).toContain("doesNotExist");
  });
});

describe("renameImportPath", () => {
  it("replaces the module specifier of a matching import", () => {
    const sourceFile = loadFixtureInMemory("rename-import-path-input.ts");
    const result = renameImportPath(sourceFile, { oldModule: "lodash", newModule: "lodash-es" });

    expect(result.applied).toBe(true);
    expect(sourceFile.getFullText()).toContain('from "lodash-es"');
  });
});

describe("renameJsxProp", () => {
  it("renames the matching prop only on the matching tag, leaving other usages untouched", () => {
    const sourceFile = loadFixtureInMemory("rename-jsx-prop-input.tsx");
    const result = renameJsxProp(sourceFile, { tag: "Button", oldProp: "color", newProp: "tone" });

    expect(result.applied).toBe(true);
    expect(sourceFile.getFullText()).toContain('<Button tone="danger">Delete</Button>');
    expect(sourceFile.getFullText()).toContain('<Button tone="accent">Save</Button>');
  });
});

describe("extractMagicLiteral", () => {
  it("replaces every occurrence of the literal and declares one constant", () => {
    const sourceFile = loadFixtureInMemory("extract-magic-literal-input.ts");
    const result = extractMagicLiteral(sourceFile, { literal: "3", constantName: "MAX_RETRIES" });

    expect(result.applied).toBe(true);
    const text = sourceFile.getFullText();
    expect(text).toContain("const MAX_RETRIES = 3;");
    expect(text.match(/retry\(url, MAX_RETRIES\)/g)).toHaveLength(2);
    expect(text).not.toMatch(/retry\(url, 3\)/);
  });
});

describe("convertClassToFunctionComponent", () => {
  it("converts a simple class with one state field and no other methods", () => {
    const sourceFile = loadFixtureInMemory("convert-class-simple-input.tsx");
    const result = convertClassToFunctionComponent(sourceFile, {});

    expect(result.applied).toBe(true);
    const text = sourceFile.getFullText();
    expect(text).toContain("function Counter(props: CounterProps) {");
    expect(text).toContain("const [count, setCount] = useState(0);");
    expect(text).toContain("{props.label}: {count}");
    expect(text).toContain("setCount(count + 1)");
    // useState is merged into the existing react import rather than added as a second one —
    // the old Component import is left in place (unused-import cleanup is a known limitation,
    // see PLAN.md M2.2).
    expect(text).toContain('import { Component, useState } from "react"');
    expect(text).not.toContain("this.state");
    expect(text).not.toContain("this.props");
    expect(text).not.toContain("class Counter");
  });

  it("bails out with a specific reason for a class with lifecycle methods it doesn't support", () => {
    const sourceFile = loadFixtureInMemory("convert-class-complex-input.tsx");
    const result = convertClassToFunctionComponent(sourceFile, {});

    expect(result.applied).toBe(false);
    expect(result.skipReason).toContain("componentDidMount");
    expect(sourceFile.getFullText()).toContain("class Tracker extends Component");
  });
});
