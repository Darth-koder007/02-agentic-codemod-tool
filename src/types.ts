export type TransformKind =
  | "rename-identifier"
  | "rename-import-path"
  | "rename-jsx-prop"
  | "convert-class-to-function-component"
  | "extract-magic-literal"
  | "unknown";

export interface ParsedInstruction {
  kind: TransformKind;
  raw: string;
  params: Record<string, string>;
}

export interface TransformResult {
  applied: boolean;
  /** Human-readable reason a canned transform declined to run (still Tier 1 — a genuine "this doesn't match my pattern", not a validation failure). */
  skipReason?: string;
}
