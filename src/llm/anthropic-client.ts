import Anthropic from "@anthropic-ai/sdk";
import type { GenerateRequest, GenerateResult, LlmClient } from "./types.js";

export interface AnthropicClientOptions {
  model: string;
  apiKey: string;
}

export function createAnthropicClient(options: AnthropicClientOptions): LlmClient {
  const client = new Anthropic({ apiKey: options.apiKey });

  return {
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const message = await client.messages.create({
        model: options.model,
        max_tokens: 1024,
        ...(request.system !== undefined ? { system: request.system } : {}),
        messages: [{ role: "user", content: request.prompt }],
      });

      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      return { text, provider: "anthropic", model: options.model };
    },
  };
}
