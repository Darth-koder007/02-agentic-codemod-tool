import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { runTier2 } from "./tier2.js";
import type { LlmClient } from "./llm/types.js";

const filePath = fileURLToPath(new URL("../fixtures/tier2-target-2.ts", import.meta.url));

function fakeClient(responses: string[]): LlmClient {
  let call = 0;
  return {
    generate: vi.fn(async () => {
      const text = responses[Math.min(call, responses.length - 1)]!;
      call++;
      return { text, provider: "fake", model: "fake" };
    }),
  };
}

const VALID_REPLACEMENT =
  "export function greet(name: string): string {\n  return `Hi there, ${name}`;\n}\n";
const BROKEN_REPLACEMENT = "export function greet( {{{ broken";

describe("runTier2", () => {
  it("succeeds on the first attempt when the model's proposal type-checks", async () => {
    const original = readFileSync(filePath, "utf8");
    const client = fakeClient([VALID_REPLACEMENT]);

    const result = await runTier2("make the greeting more casual", filePath, client);

    expect(result.status).toBe("success");
    expect(result.diff).toContain("Hi there");
    expect(client.generate).toHaveBeenCalledTimes(1);
    expect(readFileSync(filePath, "utf8")).toBe(original); // never left applied
  });

  it("retries once with the failure fed back, and succeeds on the second attempt", async () => {
    const client = fakeClient([BROKEN_REPLACEMENT, VALID_REPLACEMENT]);

    const result = await runTier2("make the greeting more casual", filePath, client);

    expect(result.status).toBe("success");
    expect(client.generate).toHaveBeenCalledTimes(2);
    const secondPrompt = (client.generate as ReturnType<typeof vi.fn>).mock.calls[1]![0].prompt;
    expect(secondPrompt).toContain("previous attempt did not pass validation");
  });

  it("gives up honestly after two failed attempts, never presenting a broken diff as safe", async () => {
    const client = fakeClient([BROKEN_REPLACEMENT, BROKEN_REPLACEMENT]);

    const result = await runTier2("make the greeting more casual", filePath, client);

    expect(result.status).toBe("no-safe-transform");
    expect(result.diff).toBeUndefined();
    expect(result.reason).toContain("No safe transform found after 2 attempts");
    expect(client.generate).toHaveBeenCalledTimes(2);
  });

  it("strips markdown code fences from the model's response before validating", async () => {
    const client = fakeClient(["```typescript\n" + VALID_REPLACEMENT + "```"]);

    const result = await runTier2("make the greeting more casual", filePath, client);

    expect(result.status).toBe("success");
  });
});
