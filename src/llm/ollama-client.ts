import type { GenerateRequest, GenerateResult, LlmClient } from "./types.js";

export interface OllamaClientOptions {
  model: string;
  baseUrl?: string;
}

interface OllamaGenerateResponse {
  response: string;
}

export function createOllamaClient(options: OllamaClientOptions): LlmClient {
  const baseUrl = options.baseUrl ?? "http://localhost:11436";

  return {
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          prompt: request.prompt,
          system: request.system,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
      }

      const body = (await response.json()) as OllamaGenerateResponse;
      return { text: body.response, provider: "ollama", model: options.model };
    },
  };
}
