import { BaseTool, type ToolResult } from "../src/tools/base.js";
import { LLMClient } from "../src/llm/llmClient.js";
import type { Message } from "../src/schema.js";
import { requireApiEnv } from "./shared.js";

class WeatherTool extends BaseTool {
  readonly name = "get_weather";
  readonly description = "Get weather information for a location.";
  readonly parameters = {
    type: "object",
    properties: {
      location: { type: "string", description: "City and country" },
      unit: { type: "string", enum: ["celsius", "fahrenheit"] }
    },
    required: ["location"]
  };

  async execute(): Promise<ToolResult> {
    return { success: true, content: "Weather data" };
  }
}

class SearchTool extends BaseTool {
  readonly name = "search_web";
  readonly description = "Search the web for a query.";
  readonly parameters = {
    type: "object",
    properties: {
      query: { type: "string" },
      max_results: { type: "integer" }
    },
    required: ["query"]
  };

  async execute(): Promise<ToolResult> {
    return { success: true, content: "Search results" };
  }
}

class CalculatorTool extends BaseTool {
  readonly name = "calculator";
  readonly description = "Perform arithmetic calculations.";
  readonly parameters = {
    type: "object",
    properties: {
      expression: { type: "string", description: "Expression such as '2 + 2'" }
    },
    required: ["expression"]
  };

  async execute(): Promise<ToolResult> {
    return { success: true, content: "Calculation result" };
  }
}

class TranslateTool extends BaseTool {
  readonly name = "translate";
  readonly description = "Translate text from one language to another.";
  readonly parameters = {
    type: "object",
    properties: {
      text: { type: "string" },
      target_language: { type: "string" }
    },
    required: ["text", "target_language"]
  };

  async execute(): Promise<ToolResult> {
    return { success: true, content: "Translation result" };
  }
}

async function demoToolObjectsWithLlm(): Promise<void> {
  const env = requireApiEnv();
  const client = new LLMClient({
    apiKey: env.apiKey,
    apiBase: env.apiBase,
    model: env.model,
    provider: env.provider
  });

  const weatherTool = new WeatherTool();
  const searchTool = new SearchTool();

  const messages: Message[] = [
    {
      role: "user",
      content: "What's the weather in Tokyo in celsius?"
    }
  ];

  const response = await client.generate(messages, [weatherTool, searchTool]);
  console.log("Response content:", response.content);

  if (response.toolCalls) {
    console.log("Tool calls:");
    for (const call of response.toolCalls) {
      console.log(`- ${call.function.name} ${JSON.stringify(call.function.arguments)}`);
    }
  }
}

async function demoMultipleTools(): Promise<void> {
  const env = requireApiEnv();
  const client = new LLMClient({
    apiKey: env.apiKey,
    apiBase: env.apiBase,
    model: env.model,
    provider: env.provider
  });

  const calculatorTool = new CalculatorTool();
  const translateTool = new TranslateTool();

  const messages: Message[] = [{ role: "user", content: "Calculate 15 * 23 for me" }];
  console.log("\nMethod 2: Using Multiple Tool Instances");
  const response = await client.generate(messages, [calculatorTool, translateTool]);
  console.log("Response content:", response.content);

  if (response.toolCalls) {
    console.log("Tool calls:");
    for (const call of response.toolCalls) {
      console.log(`- ${call.function.name} ${JSON.stringify(call.function.arguments)}`);
    }
  }
}

function demoSchemaMethods(): void {
  const weatherTool = new WeatherTool();
  console.log("\nAnthropic schema:");
  console.log(weatherTool.toAnthropicSchema());
  console.log("\nOpenAI schema:");
  console.log(weatherTool.toOpenAISchema());
}

async function main(): Promise<void> {
  console.log("Tool Schema Demo (TS)");
  await demoToolObjectsWithLlm();
  await demoMultipleTools();
  demoSchemaMethods();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
