export interface GenerateRequest {
  prompt: string;
  system?: string;
}

export interface GenerateResult {
  text: string;
  provider: string;
  model: string;
}

export interface LlmClient {
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

export type LlmProvider = "ollama" | "anthropic";
