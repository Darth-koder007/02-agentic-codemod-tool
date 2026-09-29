import { createAnthropicClient } from "./anthropic-client.js";
import { createOllamaClient } from "./ollama-client.js";
import type { LlmClient, LlmProvider } from "./types.js";

const DEFAULT_MODEL: Record<LlmProvider, string> = {
  // Same choice as Project 1 (see its PLAN.md M1.4): 1b hallucinated in manual testing there, 3b
  // did not, while staying small enough (~2GB) to be a reasonable default local pull.
  ollama: "llama3.2:3b",
  anthropic: "claude-haiku-4-5-20251001",
};

export interface CreateClientOptions {
  provider?: LlmProvider;
  model?: string;
  env?: Record<string, string | undefined>;
}

/**
 * Provider is env-selected (`LLM_PROVIDER`), not hardcoded, so the same CLI command works
 * against either provider with no code change.
 */
export function createLlmClient(options: CreateClientOptions = {}): LlmClient {
  const env = options.env ?? process.env;
  const provider = options.provider ?? (env.LLM_PROVIDER as LlmProvider | undefined) ?? "ollama";
  const model = options.model ?? env.LLM_MODEL ?? DEFAULT_MODEL[provider];

  if (provider === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set. Use LLM_PROVIDER=ollama (the default) for local development without an API key."
      );
    }
    return createAnthropicClient({ model, apiKey });
  }

  return createOllamaClient({
    model,
    ...(env.OLLAMA_BASE_URL ? { baseUrl: env.OLLAMA_BASE_URL } : {}),
  });
}
