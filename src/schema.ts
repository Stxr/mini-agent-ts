export type MessageRole = "system" | "user" | "assistant" | "tool";

export type LlmProvider = "anthropic" | "openai";

export interface FunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: FunctionCall;
}

export interface Message {
  role: MessageRole;
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmResponse {
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  finishReason: string;
  usage?: TokenUsage;
}
