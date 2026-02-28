import type { AgentSideConnection, McpServer, SessionId } from "@agentclientprotocol/sdk";
import type { LlmClient } from "../llm/base.js";
import type { Message, ToolCall } from "../schema.js";
import type { Tool } from "../tools/base.js";

export interface AcpSessionRuntime {
  llm: LlmClient;
  maxSteps: number;
  messages: Message[];
  tools: Map<string, Tool>;
}

export interface SessionState {
  runtime: AcpSessionRuntime;
  cancelled: boolean;
}

export interface AcpAgentDependencies {
  conn: AgentSideConnection;
  llm: LlmClient;
  baseTools: Tool[];
  maxSteps: number;
  systemPrompt: string;
  workspaceDir: string;
}

export interface ToolExecutionResult {
  name: string;
  call: ToolCall;
  text: string;
  success: boolean;
}

export interface AcpMcpConfig {
  name: string;
  config: {
    type?: "stdio" | "sse" | "http";
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  };
}

export interface AcpSessionInfo {
  sessionId: SessionId;
  tools: Tool[];
}

export type AcpMcpServer = McpServer;
