import type { LlmProvider, Message } from "../schema.js";
import type { LlmResponse } from "../schema.js";
import type { LlmClient as LlmClientContract } from "./base.js";
import { AnthropicCompatibleClient } from "./anthropicClient.js";
import { OpenAICompatibleClient } from "./openaiClient.js";

interface LlmClientOptions {
  apiKey: string;
  provider?: LlmProvider;
  apiBase?: string;
  model?: string;
}

const MINIMAX_DOMAINS = ["api.minimax.io", "api.minimaxi.com"];

function normalizeApiBase(apiBase: string, provider: LlmProvider): string {
  const base = apiBase.replace(/\/$/, "");
  const isMinimax = MINIMAX_DOMAINS.some((domain) => base.includes(domain));

  if (!isMinimax) {
    return base;
  }

  const stripped = base.replace(/\/anthropic$/, "").replace(/\/v1$/, "");
  return provider === "anthropic" ? `${stripped}/anthropic` : `${stripped}/v1`;
}

export class LLMClient implements LlmClientContract {
  readonly provider: LlmProvider;
  readonly apiBase: string;
  readonly model: string;

  private readonly client: LlmClientContract;

  constructor(options: LlmClientOptions) {
    this.provider = options.provider ?? "anthropic";
    this.model = options.model ?? "MiniMax-M2.5";
    this.apiBase = normalizeApiBase(options.apiBase ?? "https://api.minimaxi.com", this.provider);

    if (this.provider === "anthropic") {
      this.client = new AnthropicCompatibleClient({
        apiKey: options.apiKey,
        apiBase: this.apiBase,
        model: this.model
      });
    } else {
      this.client = new OpenAICompatibleClient({
        apiKey: options.apiKey,
        apiBase: this.apiBase,
        model: this.model
      });
    }
  }

  async generate(messages: Message[], tools?: unknown[]): Promise<LlmResponse> {
    return this.client.generate(messages, tools);
  }
}
