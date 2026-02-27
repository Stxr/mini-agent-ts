import { randomUUID } from "node:crypto";
import type { LlmResponse, Message, ToolCall } from "../schema.js";
import type { LlmClient } from "./base.js";

interface AnthropicClientOptions {
  apiKey: string;
  apiBase: string;
  model: string;
}

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

function normalizeBase(apiBase: string): string {
  return apiBase.replace(/\/$/, "");
}

function buildMessagesEndpoint(apiBase: string): string {
  const base = normalizeBase(apiBase);
  if (base.endsWith("/v1")) {
    return `${base}/messages`;
  }
  return `${base}/v1/messages`;
}

function convertTools(tools: unknown[] | undefined): Record<string, unknown>[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => {
    if (typeof tool === "object" && tool !== null) {
      if ("name" in tool && "description" in tool && "input_schema" in tool) {
        return tool as Record<string, unknown>;
      }

      if (
        "toAnthropicSchema" in tool &&
        typeof (tool as { toAnthropicSchema?: unknown }).toAnthropicSchema === "function"
      ) {
        return (tool as { toAnthropicSchema(): Record<string, unknown> }).toAnthropicSchema();
      }

      if ("type" in tool && (tool as Record<string, unknown>).type === "function" && "function" in tool) {
        const fn = (tool as { function: { name: string; description: string; parameters: Record<string, unknown> } }).function;
        return {
          name: fn.name,
          description: fn.description,
          input_schema: fn.parameters
        };
      }
    }

    throw new Error(`Unsupported tool type for Anthropic client: ${typeof tool}`);
  });
}

function convertMessages(messages: Message[]): { system?: string; messages: Array<Record<string, unknown>> } {
  const apiMessages: Array<Record<string, unknown>> = [];
  let system: string | undefined;

  for (const msg of messages) {
    if (msg.role === "system") {
      system = msg.content;
      continue;
    }

    if (msg.role === "user") {
      apiMessages.push({ role: "user", content: msg.content });
      continue;
    }

    if (msg.role === "assistant") {
      const blocks: AnthropicBlock[] = [];
      if (msg.thinking) {
        blocks.push({ type: "thinking", thinking: msg.thinking });
      }
      if (msg.content) {
        blocks.push({ type: "text", text: msg.content });
      }
      for (const toolCall of msg.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function.name,
          input: toolCall.function.arguments
        });
      }
      apiMessages.push({ role: "assistant", content: blocks.length > 0 ? blocks : "" });
      continue;
    }

    if (msg.role === "tool") {
      apiMessages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.toolCallId,
            content: msg.content
          }
        ]
      });
    }
  }

  return { system, messages: apiMessages };
}

function parseResponse(data: AnthropicResponse): LlmResponse {
  let content = "";
  let thinking = "";
  const toolCalls: ToolCall[] = [];

  for (const block of data.content ?? []) {
    if (block.type === "text") {
      content += block.text;
    } else if (block.type === "thinking") {
      thinking += block.thinking;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id || randomUUID(),
        type: "function",
        function: {
          name: block.name,
          arguments: block.input ?? {}
        }
      });
    }
  }

  const input = (data.usage?.input_tokens ?? 0) + (data.usage?.cache_read_input_tokens ?? 0) + (data.usage?.cache_creation_input_tokens ?? 0);
  const output = data.usage?.output_tokens ?? 0;

  return {
    content,
    thinking: thinking || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason: data.stop_reason ?? "stop",
    usage: {
      promptTokens: input,
      completionTokens: output,
      totalTokens: input + output
    }
  };
}

export class AnthropicCompatibleClient implements LlmClient {
  constructor(private readonly options: AnthropicClientOptions) {}

  async generate(messages: Message[], tools?: unknown[]): Promise<LlmResponse> {
    const endpoint = buildMessagesEndpoint(this.options.apiBase);
    const converted = convertMessages(messages);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.options.apiKey,
        authorization: `Bearer ${this.options.apiKey}`,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.options.model,
        max_tokens: 4096,
        system: converted.system,
        messages: converted.messages,
        tools: convertTools(tools)
      })
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    return parseResponse(data);
  }
}
