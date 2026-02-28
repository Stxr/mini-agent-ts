import { describe, expect, it } from "vitest";
import { BaseTool, type ToolResult } from "../src/tools/base.js";

class MockWeatherTool extends BaseTool {
  readonly name = "get_weather";
  readonly description = "Get weather information";
  readonly parameters = {
    type: "object",
    properties: { location: { type: "string", description: "Location name" } },
    required: ["location"]
  };
  async execute(): Promise<ToolResult> {
    return { success: true, content: "Weather data" };
  }
}

class MockSearchTool extends BaseTool {
  readonly name = "search_database";
  readonly description = "Search the database";
  readonly parameters = {
    type: "object",
    properties: {
      query: { type: "string" },
      filters: { type: "object", properties: { category: { type: "string" } } },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 10 }
    },
    required: ["query"]
  };
  async execute(): Promise<ToolResult> {
    return { success: true, content: "Search results" };
  }
}

describe("tool schema methods", () => {
  it("converts to anthropic schema", () => {
    const tool = new MockWeatherTool();
    const schema = tool.toAnthropicSchema();
    expect(schema.name).toBe("get_weather");
    expect((schema as { input_schema: { required: string[] } }).input_schema.required).toEqual(["location"]);
  });

  it("converts to openai schema", () => {
    const tool = new MockWeatherTool();
    const schema = tool.toOpenAISchema();
    const fn = (schema as { function: { name: string; parameters: { required: string[] } } }).function;
    expect(fn.name).toBe("get_weather");
    expect(fn.parameters.required).toEqual(["location"]);
  });

  it("keeps schema consistency", () => {
    const tool = new MockSearchTool();
    const a = tool.toAnthropicSchema() as { input_schema: Record<string, unknown> };
    const o = tool.toOpenAISchema() as { function: { parameters: Record<string, unknown> } };
    expect(a.input_schema).toEqual(o.function.parameters);
  });
});
