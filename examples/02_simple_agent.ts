import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Agent } from "../src/agent.js";
import { loadSystemPrompt } from "../src/config/systemPrompt.js";
import { BashTool } from "../src/tools/bashTool.js";
import { EditFileTool, ReadFileTool, WriteFileTool } from "../src/tools/fileTools.js";
import { createLlmClient, createTempWorkspace } from "./shared.js";

async function demoFileCreation(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo: Agent-Driven File Creation");
  console.log("=".repeat(60));

  const workspace = await createTempWorkspace("mini-agent-ts-agent-");
  console.log(`Workspace: ${workspace}`);

  const llm = createLlmClient();
  const systemPrompt = await loadSystemPrompt(workspace);
  const agent = new Agent({
    llmClient: llm,
    systemPrompt,
    tools: [
      new ReadFileTool(workspace),
      new WriteFileTool(workspace),
      new EditFileTool(workspace),
      new BashTool(workspace)
    ],
    maxSteps: 10
  });

  const task = `
Create a TypeScript file named 'hello.ts' that:
1. Defines a function greet(name: string)
2. Prints "Hello, {name}!"
3. Calls greet("Mini Agent TS")
`;

  agent.addUserMessage(task);
  const result = await agent.run();
  console.log(`\nAgent response:\n${result}`);

  try {
    const content = await readFile(join(workspace, "hello.ts"), "utf-8");
    console.log("\nCreated file:\n" + content);
  } catch {
    console.log("hello.ts was not created.");
  }

  await rm(workspace, { recursive: true, force: true });
}

async function demoBashTask(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo: Agent-Driven Bash Commands");
  console.log("=".repeat(60));

  const workspace = await createTempWorkspace("mini-agent-ts-agent-");
  console.log(`Workspace: ${workspace}`);

  const llm = createLlmClient();
  const systemPrompt = await loadSystemPrompt(workspace);
  const agent = new Agent({
    llmClient: llm,
    systemPrompt,
    tools: [new ReadFileTool(workspace), new WriteFileTool(workspace), new BashTool(workspace)],
    maxSteps: 10
  });

  const task = `
Use bash commands to:
1. Show current date/time
2. List all TypeScript files in current directory
3. Count how many TypeScript files exist
`;

  agent.addUserMessage(task);
  const result = await agent.run();
  console.log(`\nAgent response:\n${result}`);

  await rm(workspace, { recursive: true, force: true });
}

async function main(): Promise<void> {
  console.log("Simple Agent Usage Examples (TS)");
  await demoFileCreation();
  await demoBashTask();
  console.log("\nAll demos completed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
