import { randomUUID } from "node:crypto";
import type { LlmResponse, Message, ToolCall } from "../schema.js";
import type { LlmClient } from "./base.js";

interface OpenAIClientOptions {
  apiKey: string;
  apiBase: string;
  model: string;
}

interface OpenAIChoice {
  finish_reason: string | null;
  message: {
    content: string | null;
    reasoning_details?: Array<{ text?: string }>;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage?: OpenAIUsage;
}

function normalizeBase(apiBase: string): string {
  return apiBase.replace(/\/$/, "");
}

function parseToolCalls(calls: OpenAIChoice["message"]["tool_calls"]): ToolCall[] | undefined {
  if (!calls || calls.length === 0) {
    return undefined;
  }

  return calls.map((call) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || "{}");
    } catch {
      args = { raw_arguments: call.function.arguments };
    }

    return {
      id: call.id || randomUUID(),
      type: "function",
      function: {
        name: call.function.name,
        arguments: args
      }
    };
  });
}

function convertTools(tools: unknown[] | undefined): Record<string, unknown>[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  const converted = tools.map((tool) => {
    if (typeof tool === "object" && tool !== null) {
      if (
        "type" in tool &&
        (tool as Record<string, unknown>).type === "function" &&
        "function" in tool
      ) {
        return tool as Record<string, unknown>;
      }

      if ("toOpenAISchema" in tool && typeof (tool as { toOpenAISchema?: unknown }).toOpenAISchema === "function") {
        return (tool as { toOpenAISchema(): Record<string, unknown> }).toOpenAISchema();
      }

      if ("name" in tool && "description" in tool && "input_schema" in tool) {
        const t = tool as { name: string; description: string; input_schema: Record<string, unknown> };
        return {
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema
          }
        };
      }
    }

    throw new Error(`Unsupported tool type for OpenAI client: ${typeof tool}`);
  });

  return converted;
}

export class OpenAICompatibleClient implements LlmClient {
  constructor(private readonly options: OpenAIClientOptions) {}

  async generate(messages: Message[], tools?: unknown[]): Promise<LlmResponse> {
    const endpoint = `${normalizeBase(this.options.apiBase)}/chat/completions`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          tool_call_id: m.toolCallId,
          name: m.name,
          tool_calls: m.toolCalls?.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: JSON.stringify(tc.function.arguments)
            }
          }))
        })),
        tools: convertTools(tools),
        extra_body: { reasoning_split: true }
      })
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    const first = data.choices[0];
    if (!first) {
      throw new Error("LLM returned empty choices");
    }

    const thinking = first.message.reasoning_details?.map((d) => d.text ?? "").join("").trim() || undefined;

    return {
      content: first.message.content ?? "",
      thinking,
      toolCalls: parseToolCalls(first.message.tool_calls),
      finishReason: first.finish_reason ?? "stop",
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0
      }
    };
  }
}
