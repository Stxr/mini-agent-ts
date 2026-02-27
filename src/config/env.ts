import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import type { LlmProvider } from "../schema.js";

export interface AppConfig {
  apiKey: string;
  apiBase: string;
  model: string;
  provider: LlmProvider;
}

let loaded = false;

export function loadDotEnv(): void {
  if (loaded) {
    return;
  }

  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  loaded = true;
}

export function getAppConfig(): AppConfig {
  loadDotEnv();

  const apiKey = process.env.MINI_AGENT_API_KEY ?? process.env.api_key ?? "";
  const apiBase = process.env.MINI_AGENT_API_BASE ?? process.env.api_base ?? "https://api.minimaxi.com";
  const model = process.env.MINI_AGENT_MODEL ?? process.env.model ?? "MiniMax-M2.5";
  const rawProvider = process.env.MINI_AGENT_PROVIDER ?? process.env.provider ?? "anthropic";
  const provider: LlmProvider = rawProvider === "openai" ? "openai" : "anthropic";

  if (!apiKey) {
    throw new Error("Missing API key in .env (MINI_AGENT_API_KEY or api_key)");
  }

  return { apiKey, apiBase, model, provider };
}
