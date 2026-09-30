export type ExpectedStatus = "success" | "not-applicable" | "unsafe" | "no-safe-transform";

export interface EvalCase {
  id: string;
  instruction: string;
  target: string;
  tier: 1 | 2;
  expectedStatus: ExpectedStatus;
  /** Part of the subset scored for "correct-refusal rate" — a case designed to NOT succeed. */
  adversarial: boolean;
}

export const EVAL_CASES: EvalCase[] = [
  // --- Tier 1 (canned transforms) ---
  {
    id: "t1-01",
    instruction: "rename function `fetchUser` to `getUser`",
    target: "t1-01-rename-fn-success.ts",
    tier: 1,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t1-02",
    instruction: "rename identifier `doesNotExistAnywhere` to `x`",
    target: "t1-02-rename-fn-not-applicable.ts",
    tier: 1,
    expectedStatus: "not-applicable",
    adversarial: true,
  },
  {
    id: "t1-03",
    instruction: "Replace imports of './t1-03-math-old.js' with './t1-03-math-new.js'",
    target: "t1-03-import-rename-success.ts",
    tier: 1,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t1-04",
    instruction: "Replace imports of './t1-04-math-real.js' with './t1-04-math-does-not-exist.js'",
    target: "t1-04-import-rename-unsafe.ts",
    tier: 1,
    expectedStatus: "unsafe",
    adversarial: true,
  },
  {
    id: "t1-05",
    instruction: "rename the `color` prop to `tone` on MyButton",
    target: "t1-05-jsx-prop-success.tsx",
    tier: 1,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t1-06",
    instruction: "rename the `color` prop to `tone` on MyButton",
    target: "t1-06-jsx-prop-not-applicable.tsx",
    tier: 1,
    expectedStatus: "not-applicable",
    adversarial: true,
  },
  {
    id: "t1-07",
    instruction: "extract the literal 3 into a constant named MAX_RETRIES",
    target: "t1-07-extract-literal-numeric-success.ts",
    tier: 1,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t1-08",
    instruction: "extract the literal 'en-US' into a constant named DEFAULT_LOCALE",
    target: "t1-08-extract-literal-string-success.ts",
    tier: 1,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t1-09",
    instruction: "convert Toggle to a function component",
    target: "t1-09-convert-class-success.tsx",
    tier: 1,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t1-10",
    instruction: "convert Tracker to a function component",
    target: "t1-10-convert-class-not-applicable.tsx",
    tier: 1,
    expectedStatus: "not-applicable",
    adversarial: true,
  },
  {
    id: "t1-11",
    instruction: "rename const `API_BASE` to `API_ROOT`",
    target: "t1-11-rename-const-success.ts",
    tier: 1,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t1-12",
    instruction: "rename the `color` prop to `badName` on MyButton",
    target: "t1-12-jsx-prop-unsafe.tsx",
    tier: 1,
    expectedStatus: "unsafe",
    adversarial: true,
  },

  // --- Tier 2 (LLM-in-the-loop) ---
  {
    id: "t2-01",
    instruction:
      "Add a JSDoc comment explaining what this function does and what its parameters mean",
    target: "t2-01-jsdoc.ts",
    tier: 2,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t2-02",
    instruction: "Add input validation: throw an error if the argument is negative",
    target: "t2-02-validation.ts",
    tier: 2,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t2-03",
    instruction:
      "Convert this to an arrow function assigned to a const, keep the exact same behavior and export",
    target: "t2-03-arrow-fn.ts",
    tier: 2,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t2-04",
    instruction: "Wrap the risky operation in a try/catch and log any error to the console",
    target: "t2-04-try-catch.ts",
    tier: 2,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t2-05",
    instruction:
      "Rename the loop counter variable to something more descriptive than a single letter",
    target: "t2-05-rename-loop-var.ts",
    tier: 2,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t2-06",
    instruction:
      "Extract the repeated width*height calculation into a local helper function in this file",
    target: "t2-06-extract-helper.ts",
    tier: 2,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t2-07",
    instruction:
      "Fix the strict-null-check issue: handle the case where the optional parameter is undefined",
    target: "t2-07-optional-param.ts",
    tier: 2,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t2-08",
    instruction: "Rewrite this using array methods like .map instead of a manual for loop",
    target: "t2-08-array-methods.ts",
    tier: 2,
    expectedStatus: "success",
    adversarial: false,
  },
  {
    id: "t2-09",
    instruction:
      "Change this function to call `callUndefinedRemoteApi()` (a function that doesn't exist anywhere) and return its result directly",
    target: "t2-09-nonexistent-api.ts",
    tier: 2,
    expectedStatus: "no-safe-transform",
    adversarial: true,
  },
  {
    id: "t2-10",
    instruction:
      "Use the npm package `left-pad-but-fake-nonexistent` to reimplement this function, importing it at the top",
    target: "t2-10-uninstalled-package.ts",
    tier: 2,
    expectedStatus: "no-safe-transform",
    adversarial: true,
  },
  {
    id: "t2-11",
    instruction:
      "Make this function return `someUndeclaredGlobalVariableXyz` instead of computing the value itself",
    target: "t2-11-undeclared-var.ts",
    tier: 2,
    expectedStatus: "no-safe-transform",
    adversarial: true,
  },
  {
    id: "t2-12",
    instruction:
      "Change the parameter type to `SomeTypeThatIsNeverDefinedAnywhereInThisFile` without adding any import or declaration for it",
    target: "t2-12-missing-type-import.ts",
    tier: 2,
    expectedStatus: "no-safe-transform",
    adversarial: true,
  },
];
