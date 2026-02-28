#!/usr/bin/env node
import { Readable, Writable } from "node:stream";
import {
  AgentSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type AgentCapabilities,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type CancelNotification,
  type InitializeRequest,
  type InitializeResponse,
  type McpServer,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type SessionId
} from "@agentclientprotocol/sdk";
import { loadDotEnv, getAppConfig } from "../config/env.js";
import { loadSystemPrompt } from "../config/systemPrompt.js";
import type { LlmClient } from "../llm/base.js";
import { LLMClient } from "../llm/llmClient.js";
import type { ToolCall } from "../schema.js";
import { createWorkspaceTools, loadSharedToolsFromEnv } from "../runtime/toolSetup.js";
import { cleanupMcpConnections, loadMcpToolsFromEntries, type MCPServerEntry } from "../tools/mcpLoader.js";
import type { Tool } from "../tools/base.js";
import {
  createAgentMessageNotification,
  createAgentThoughtNotification,
  createToolCallNotification,
  createToolCallUpdateNotification
} from "./messages.js";
import type { AcpAgentDependencies, AcpSessionRuntime, SessionState } from "./types.js";

function createRuntime(llm: LlmClient, systemPrompt: string, tools: Tool[], maxSteps: number): AcpSessionRuntime {
  return {
    llm,
    maxSteps,
    messages: [{ role: "system", content: systemPrompt }],
    tools: new Map(tools.map((tool) => [tool.name, tool]))
  };
}

function extractPromptText(prompt: PromptRequest["prompt"]): string {
  return prompt
    .map((block) => {
      if (block.type === "text") {
        return block.text;
      }
      if (block.type === "resource_link") {
        return block.uri;
      }
      if (block.type === "resource" && "text" in block.resource) {
        return block.resource.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function toolTitle(name: string, args: Record<string, unknown>): string {
  const preview = Object.entries(args)
    .slice(0, 2)
    .map(([key, value]) => `${key}=${JSON.stringify(value).slice(0, 50)}`)
    .join(", ");
  return preview ? `Tool: ${name}(${preview})` : `Tool: ${name}()`;
}

function toMcpEntries(servers: McpServer[]): MCPServerEntry[] {
  return servers.map((server) => {
    if ("command" in server) {
      return {
        name: server.name,
        config: {
          type: "stdio",
          command: server.command,
          args: server.args,
          env: Object.fromEntries((server.env ?? []).map((entry: { name: string; value: string }) => [entry.name, entry.value]))
        }
      };
    }

    return {
      name: server.name,
      config: {
        type: "type" in server ? server.type : "sse",
        url: server.url,
        headers: Object.fromEntries(
          (server.headers ?? []).map((header: { name: string; value: string }) => [header.name, header.value])
        )
      }
    };
  });
}

export class MiniAgentAcpAgent {
  private readonly sessions = new Map<SessionId, SessionState>();
  private sessionCounter = 0;

  constructor(private readonly deps: AcpAgentDependencies) {}

  async initialize(_params: InitializeRequest): Promise<InitializeResponse> {
    const agentCapabilities: AgentCapabilities = {
      loadSession: false,
      mcpCapabilities: {
        http: true,
        sse: true
      }
    };

    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities,
      agentInfo: {
        name: "mini-agent-ts",
        title: "Mini-Agent TS",
        version: "0.1.0"
      }
    };
  }

  async authenticate(_params: AuthenticateRequest): Promise<AuthenticateResponse> {
    return {};
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const workspace = params.cwd || this.deps.workspaceDir;
    const tools = [...this.deps.baseTools, ...createWorkspaceTools(workspace)];

    if ((params.mcpServers ?? []).length > 0) {
      tools.push(...(await loadMcpToolsFromEntries(toMcpEntries(params.mcpServers ?? []))));
    }

    const sessionId = `sess-${this.sessionCounter}-${crypto.randomUUID().slice(0, 8)}`;
    this.sessionCounter += 1;
    this.sessions.set(sessionId, {
      runtime: createRuntime(this.deps.llm, this.deps.systemPrompt, tools, this.deps.maxSteps),
      cancelled: false
    });

    return { sessionId };
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    let state = this.sessions.get(params.sessionId);
    let sessionId = params.sessionId;
    if (!state) {
      const autoCreated = await this.newSession({
        cwd: this.deps.workspaceDir,
        mcpServers: []
      });
      state = this.sessions.get(autoCreated.sessionId);
      sessionId = autoCreated.sessionId;
      if (!state) {
        return { stopReason: "refusal" };
      }
    }

    state.cancelled = false;
    state.runtime.messages.push({
      role: "user",
      content: extractPromptText(params.prompt)
    });

    const stopReason = await this.runTurn(state, sessionId);
    return { stopReason };
  }

  async cancel(params: CancelNotification): Promise<void> {
    const state = this.sessions.get(params.sessionId);
    if (state) {
      state.cancelled = true;
    }
  }

  private async runTurn(state: SessionState, sessionId: SessionId): Promise<PromptResponse["stopReason"]> {
    for (let step = 0; step < state.runtime.maxSteps; step += 1) {
      if (state.cancelled) {
        return "cancelled";
      }

      let response;
      try {
        response = await state.runtime.llm.generate(
          state.runtime.messages,
          Array.from(state.runtime.tools.values()).map((tool) => tool.toOpenAISchema())
        );
      } catch (error) {
        const message = `Error: ${error instanceof Error ? error.message : String(error)}`;
        await this.deps.conn.sessionUpdate(createAgentMessageNotification(sessionId, message));
        return "refusal";
      }

      state.runtime.messages.push({
        role: "assistant",
        content: response.content,
        thinking: response.thinking,
        toolCalls: response.toolCalls
      });

      if (response.thinking) {
        await this.deps.conn.sessionUpdate(createAgentThoughtNotification(sessionId, response.thinking));
      }
      if (response.content) {
        await this.deps.conn.sessionUpdate(createAgentMessageNotification(sessionId, response.content));
      }

      if (!response.toolCalls || response.toolCalls.length === 0) {
        return "end_turn";
      }

      for (const call of response.toolCalls) {
        await this.executeToolCall(state, sessionId, call);
      }
    }

    return "max_turn_requests";
  }

  private async executeToolCall(state: SessionState, sessionId: SessionId, call: ToolCall): Promise<void> {
    const args = call.function.arguments ?? {};
    await this.deps.conn.sessionUpdate(
      createToolCallNotification(sessionId, call.id, toolTitle(call.function.name, args), args)
    );

    const tool = state.runtime.tools.get(call.function.name);
    let success = false;
    let text: string;

    if (!tool) {
      text = `[ERROR] Unknown tool: ${call.function.name}`;
    } else {
      try {
        const result = await tool.execute(args);
        success = result.success;
        text = result.success ? `[OK] ${result.content}` : `[ERROR] ${result.error ?? "Tool execution failed"}`;
      } catch (error) {
        text = `[ERROR] Tool error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    await this.deps.conn.sessionUpdate(
      createToolCallUpdateNotification(sessionId, call.id, success ? "completed" : "failed", text)
    );

    state.runtime.messages.push({
      role: "tool",
      content: text,
      toolCallId: call.id,
      name: call.function.name
    });
  }
}

export async function createAcpAgentConnection(conn: AgentSideConnection): Promise<MiniAgentAcpAgent> {
  loadDotEnv();
  const { apiKey, apiBase, model, provider } = getAppConfig();
  const shared = await loadSharedToolsFromEnv();
  const workspaceDir = process.cwd();
  const systemPrompt = await loadSystemPrompt(workspaceDir, shared.skillsMetadata);
  const llm = new LLMClient({ apiKey, apiBase, model, provider });

  return new MiniAgentAcpAgent({
    conn,
    llm,
    baseTools: shared.tools,
    maxSteps: 50,
    systemPrompt,
    workspaceDir
  });
}

export async function runAcpServer(): Promise<void> {
  const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin));
  const connection = new AgentSideConnection((conn) => {
    let instancePromise: Promise<MiniAgentAcpAgent> | null = null;
    const getInstance = (): Promise<MiniAgentAcpAgent> => {
      instancePromise ??= createAcpAgentConnection(conn);
      return instancePromise;
    };

    return {
      initialize(params) {
        return getInstance().then((instance) => instance.initialize(params));
      },
      authenticate(params) {
        return getInstance().then((instance) => instance.authenticate(params));
      },
      newSession(params) {
        return getInstance().then((instance) => instance.newSession(params));
      },
      prompt(params) {
        return getInstance().then((instance) => instance.prompt(params));
      },
      cancel(params) {
        return getInstance().then((instance) => instance.cancel(params));
      }
    };
  }, stream);

  try {
    await connection.closed;
  } finally {
    await cleanupMcpConnections();
  }
}

export async function main(): Promise<void> {
  await runAcpServer();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
