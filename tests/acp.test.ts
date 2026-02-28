import { AgentSideConnection, ClientSideConnection, PROTOCOL_VERSION, ndJsonStream, type SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { MiniAgentAcpAgent } from "../src/acp/server.js";
import type { LlmClient } from "../src/llm/base.js";
import type { LlmResponse, Message } from "../src/schema.js";
import { BaseTool, type ToolResult } from "../src/tools/base.js";

class MockLlm implements LlmClient {
  private calls = 0;

  async generate(_messages: Message[]): Promise<LlmResponse> {
    this.calls += 1;
    if (this.calls === 1) {
      return {
        content: "",
        thinking: "calling echo",
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "echo",
              arguments: { text: "ping" }
            }
          }
        ]
      };
    }

    return {
      content: "done",
      finishReason: "stop"
    };
  }
}

class EchoTool extends BaseTool {
  readonly name = "echo";
  readonly description = "Echo helper";
  readonly parameters = {
    type: "object",
    properties: {
      text: { type: "string" }
    },
    required: ["text"]
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    return {
      success: true,
      content: `tool:${String(args.text ?? "")}`
    };
  }
}

function createAcpPair() {
  const clientToAgent = new TransformStream<Uint8Array, Uint8Array>();
  const agentToClient = new TransformStream<Uint8Array, Uint8Array>();
  const updates: SessionNotification[] = [];

  const agentStream = ndJsonStream(agentToClient.writable, clientToAgent.readable);
  const clientStream = ndJsonStream(clientToAgent.writable, agentToClient.readable);

  new AgentSideConnection(
    (conn) =>
      new MiniAgentAcpAgent({
        conn,
        llm: new MockLlm(),
        baseTools: [new EchoTool()],
        maxSteps: 3,
        systemPrompt: "system",
        workspaceDir: process.cwd()
      }),
    agentStream
  );

  const client = new ClientSideConnection(
    () =>
      ({
        async sessionUpdate(params: SessionNotification) {
          updates.push(params);
        }
      }) as never,
    clientStream
  );

  return { client, updates };
}

describe("acp adapter", () => {
  it("handles initialize, session creation, and prompt execution over ACP transport", async () => {
    const { client, updates } = createAcpPair();

    const initialized = await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "vitest", version: "0.1.0" }
    });
    expect(initialized.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(initialized.agentCapabilities?.mcpCapabilities?.http).toBe(true);

    const session = await client.newSession({
      cwd: process.cwd(),
      mcpServers: []
    });

    const response = await client.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "hello" }]
    });

    expect(response.stopReason).toBe("end_turn");
    expect(updates.some((update) => update.update.sessionUpdate === "agent_thought_chunk")).toBe(true);
    expect(
      updates.some(
        (update) =>
          update.update.sessionUpdate === "tool_call_update" &&
          String(update.update.rawOutput).includes("tool:ping")
      )
    ).toBe(true);
  });

  it("ignores invalid ACP-provided MCP servers and still completes the turn", async () => {
    const { client, updates } = createAcpPair();

    await client.initialize({
      protocolVersion: PROTOCOL_VERSION
    });

    const session = await client.newSession({
      cwd: process.cwd(),
      mcpServers: [
        {
          name: "broken",
          command: "definitely-not-a-real-command",
          args: [],
          env: []
        }
      ]
    });

    const response = await client.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "hello" }]
    });

    expect(response.stopReason).toBe("end_turn");
    expect(
      updates.some(
        (update) =>
          update.update.sessionUpdate === "tool_call_update" &&
          String(update.update.rawOutput).includes("tool:ping")
      )
    ).toBe(true);
  });
});
