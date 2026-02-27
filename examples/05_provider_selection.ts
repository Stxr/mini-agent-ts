import { LLMClient } from "../src/llm/llmClient.js";
import type { LlmProvider, Message } from "../src/schema.js";
import { requireApiEnv } from "./shared.js";

async function runSingle(provider: LlmProvider, prompt: string, title: string): Promise<void> {
  const env = requireApiEnv();
  const client = new LLMClient({
    apiKey: env.apiKey,
    apiBase: env.apiBase,
    model: env.model,
    provider
  });

  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
  const messages: Message[] = [{ role: "user", content: prompt }];
  console.log(`\nProvider: ${provider}`);
  console.log(`API Base: ${client.apiBase}`);
  const response = await client.generate(messages);
  if (response.thinking) {
    console.log(`Thinking: ${response.thinking}`);
  }
  console.log(`Response: ${response.content}`);
}

async function demoDefaultProvider(): Promise<void> {
  const env = requireApiEnv();
  await runSingle(env.provider, "Say 'Hello with default provider!'", "DEMO: LLMClient with Default Provider");
}

async function demoAnthropicProvider(): Promise<void> {
  await runSingle("anthropic", "Say 'Hello from Anthropic protocol'.", "DEMO: LLMClient with Anthropic Provider");
}

async function demoOpenAIProvider(): Promise<void> {
  await runSingle("openai", "Say 'Hello from OpenAI protocol'.", "DEMO: LLMClient with OpenAI Provider");
}

async function demoProviderComparison(): Promise<void> {
  const env = requireApiEnv();
  const question = "What is 2+2?";

  const anthropicClient = new LLMClient({
    apiKey: env.apiKey,
    apiBase: env.apiBase,
    model: env.model,
    provider: "anthropic"
  });
  const openAIClient = new LLMClient({
    apiKey: env.apiKey,
    apiBase: env.apiBase,
    model: env.model,
    provider: "openai"
  });

  console.log("\n" + "=".repeat(60));
  console.log("DEMO: Provider Comparison");
  console.log("=".repeat(60));
  console.log(`\nQuestion: ${question}\n`);

  const messages: Message[] = [{ role: "user", content: question }];
  const anthropicResponse = await anthropicClient.generate(messages);
  const openAIResponse = await openAIClient.generate(messages);

  console.log(`Anthropic: ${anthropicResponse.content}`);
  console.log(`OpenAI: ${openAIResponse.content}`);
}

async function main(): Promise<void> {
  console.log("LLM Provider Selection Demo (TS)");

  await demoDefaultProvider();
  await demoAnthropicProvider();
  await demoOpenAIProvider();
  await demoProviderComparison();

  console.log("\nProvider comparison done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
