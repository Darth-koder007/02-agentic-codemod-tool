import { describe, expect, it } from "vitest";
import { parseInstruction } from "./instruction-parser.js";

describe("parseInstruction", () => {
  it("classifies a JSX prop rename with a target component", () => {
    expect(parseInstruction("Rename the `color` prop to `tone` on Button")).toEqual({
      kind: "rename-jsx-prop",
      raw: "Rename the `color` prop to `tone` on Button",
      params: { oldProp: "color", newProp: "tone", tag: "Button" },
    });
  });

  it("classifies the same intent with a different phrasing and angle brackets", () => {
    const result = parseInstruction("rename prop color to tone on <Button>");
    expect(result.kind).toBe("rename-jsx-prop");
    expect(result.params).toEqual({ oldProp: "color", newProp: "tone", tag: "Button" });
  });

  it("classifies a deprecated import path replacement", () => {
    const result = parseInstruction("Replace imports of 'lodash' with 'lodash-es'");
    expect(result.kind).toBe("rename-import-path");
    expect(result.params).toEqual({ oldModule: "lodash", newModule: "lodash-es" });
  });

  it("classifies the same intent phrased as 'change import path from X to Y'", () => {
    const result = parseInstruction("change import path from 'moment' to 'dayjs'");
    expect(result.kind).toBe("rename-import-path");
    expect(result.params).toEqual({ oldModule: "moment", newModule: "dayjs" });
  });

  it("classifies a variable rename", () => {
    const result = parseInstruction("Rename variable oldName to newName");
    expect(result.kind).toBe("rename-identifier");
    expect(result.params).toEqual({ oldName: "oldName", newName: "newName" });
  });

  it("classifies a bare rename with no keyword (identifier/variable/function/const all optional)", () => {
    const result = parseInstruction("rename the `foo` to `bar`");
    expect(result.kind).toBe("rename-identifier");
    expect(result.params).toEqual({ oldName: "foo", newName: "bar" });
  });

  it("classifies a magic-number extraction", () => {
    const result = parseInstruction("Extract the literal 42 into a constant named MAX_RETRIES");
    expect(result.kind).toBe("extract-magic-literal");
    expect(result.params).toEqual({ literal: "42", constantName: "MAX_RETRIES" });
  });

  it("classifies the same intent phrased as 'extract magic number'", () => {
    const result = parseInstruction("extract magic number 3 into a constant RETRY_COUNT");
    expect(result.kind).toBe("extract-magic-literal");
    expect(result.params).toEqual({ literal: "3", constantName: "RETRY_COUNT" });
  });

  it("classifies a blanket class-to-function-component conversion with no specific class named", () => {
    const result = parseInstruction("Convert class components to function components");
    expect(result.kind).toBe("convert-class-to-function-component");
    expect(result.params).toEqual({});
  });

  it("classifies a class-to-function-component conversion naming a specific class", () => {
    const result = parseInstruction("convert UserProfile to a function component");
    expect(result.kind).toBe("convert-class-to-function-component");
    expect(result.params).toEqual({ className: "UserProfile" });
  });

  it("routes an instruction matching no canned pattern to unknown (Tier 2)", () => {
    expect(
      parseInstruction("Please refactor this module to use a different architecture").kind
    ).toBe("unknown");
  });

  it("routes a vague, non-mechanical instruction to unknown (Tier 2)", () => {
    expect(parseInstruction("Make the failing tests pass").kind).toBe("unknown");
  });
});
