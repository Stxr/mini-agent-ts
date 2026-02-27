import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAppConfig } from "../src/config/env.js";
import { LLMClient } from "../src/llm/llmClient.js";
import type { LlmProvider } from "../src/schema.js";

export async function createTempWorkspace(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export function requireApiEnv(): {
  apiKey: string;
  apiBase: string;
  model: string;
  provider: LlmProvider;
} {
  return getAppConfig();
}

export function createLlmClient(provider?: LlmProvider): LLMClient {
  const env = requireApiEnv();
  return new LLMClient({
    apiKey: env.apiKey,
    apiBase: env.apiBase,
    model: env.model,
    provider: provider ?? env.provider
  });
}
