import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent.js";
import type { LlmClient } from "../src/llm/base.js";
import type { LlmResponse, Message } from "../src/schema.js";
import { WriteFileTool } from "../src/tools/fileTools.js";

class MockLlm implements LlmClient {
  constructor(private readonly responses: LlmResponse[]) {}

  async generate(_messages: Message[]): Promise<LlmResponse> {
    const next = this.responses.shift();
    if (!next) {
      return { content: "done", finishReason: "stop" };
    }
    return next;
  }
}

describe("agent", () => {
  it("completes when no tool calls are returned", async () => {
    const llm = new MockLlm([{ content: "Task complete", finishReason: "stop" }]);
    const agent = new Agent({ llmClient: llm, systemPrompt: "You are helpful", tools: [], maxSteps: 3, verbose: false });

    agent.addUserMessage("hello");
    const result = await agent.run();

    expect(result).toBe("Task complete");
    expect(agent.getHistory().length).toBeGreaterThanOrEqual(3);
  });

  it("executes tool calls and stores tool output", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ma-ts-agent-"));
    const llm = new MockLlm([
      {
        content: "I will create the file",
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: "tool-1",
            type: "function",
            function: { name: "write_file", arguments: { path: "test.txt", content: "Hello from Agent!" } }
          }
        ]
      },
      { content: "Done", finishReason: "stop" }
    ]);

    const agent = new Agent({
      llmClient: llm,
      systemPrompt: "You are helpful",
      tools: [new WriteFileTool(workspace)],
      maxSteps: 5,
      verbose: false
    });

    agent.addUserMessage("create file");
    const result = await agent.run();

    expect(result).toBe("Done");
    expect(await readFile(join(workspace, "test.txt"), "utf-8")).toBe("Hello from Agent!");

    await rm(workspace, { recursive: true, force: true });
  });
});
