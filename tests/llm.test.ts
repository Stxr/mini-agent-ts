import { describe, expect, it } from "vitest";
import { getAppConfig, loadDotEnv } from "../src/config/env.js";
import { LLMClient } from "../src/llm/llmClient.js";
import type { Message } from "../src/schema.js";

loadDotEnv();

function getRequiredConfig() {
  try {
    return getAppConfig();
  } catch (error) {
    throw new Error(
      `LLM integration tests require valid .env config (MINI_AGENT_API_KEY/api_key). Original error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function isOfflineEnvironment(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("fetch failed") || message.includes("enotfound") || message.includes("econnrefused");
}

async function runLiveAssertion(assertion: () => Promise<void>): Promise<void> {
  try {
    await assertion();
  } catch (error) {
    if (isOfflineEnvironment(error)) {
      console.warn(`Skipping live LLM assertion because outbound network is unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    throw error;
  }
}

describe("LLM wrapper client (live API)", () => {
  it("uses anthropic as default provider", () => {
    const config = getRequiredConfig();
    const client = new LLMClient({
      apiKey: config.apiKey,
      apiBase: config.apiBase,
      model: config.model
    });

    expect(client.provider).toBe("anthropic");
  });

  it(
    "works with anthropic provider",
    async () => {
      await runLiveAssertion(async () => {
        const config = getRequiredConfig();
        const client = new LLMClient({
          apiKey: config.apiKey,
          provider: "anthropic",
          apiBase: config.apiBase,
          model: config.model
        });

        const messages: Message[] = [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Say 'Hello, Mini Agent!' and nothing else." }
        ];

        const response = await client.generate(messages);
        expect(response.content).toBeTruthy();
        expect(response.content.toLowerCase()).toContain("hello");
        expect(response.finishReason).toBeTruthy();
      });
    },
    120_000
  );

  it(
    "works with openai provider",
    async () => {
      await runLiveAssertion(async () => {
        const config = getRequiredConfig();
        const client = new LLMClient({
          apiKey: config.apiKey,
          provider: "openai",
          apiBase: config.apiBase,
          model: config.model
        });

        const messages: Message[] = [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Say 'Hello, Mini Agent!' and nothing else." }
        ];

        const response = await client.generate(messages);
        expect(response.content).toBeTruthy();
        expect(response.content.toLowerCase()).toContain("hello");
        expect(response.finishReason).toBeTruthy();
      });
    },
    120_000
  );

  it(
    "supports tool-calling request",
    async () => {
      await runLiveAssertion(async () => {
        const config = getRequiredConfig();
        const client = new LLMClient({
          apiKey: config.apiKey,
          provider: "anthropic",
          apiBase: config.apiBase,
          model: config.model
        });

        const messages: Message[] = [
          { role: "system", content: "You are a helpful assistant with access to tools." },
          { role: "user", content: "Calculate 123 + 456 using the calculator tool." }
        ];

        const tools = [
          {
            name: "calculator",
            description: "Perform arithmetic operations",
            input_schema: {
              type: "object",
              properties: {
                operation: {
                  type: "string",
                  enum: ["add", "subtract", "multiply", "divide"],
                  description: "The operation to perform"
                },
                a: { type: "number", description: "First number" },
                b: { type: "number", description: "Second number" }
              },
              required: ["operation", "a", "b"]
            }
          }
        ];

        const response = await client.generate(messages, tools);

        expect(response.finishReason).toBeTruthy();
        if (response.toolCalls && response.toolCalls.length > 0) {
          expect(response.toolCalls[0]?.function.name).toBe("calculator");
        } else {
          expect(response.content).toBeTruthy();
        }
      });
    },
    120_000
  );
});
