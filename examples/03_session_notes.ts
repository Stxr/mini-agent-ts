import { readFile, rm } from "node:fs/promises";
import { Agent } from "../src/agent.js";
import { loadSystemPrompt } from "../src/config/systemPrompt.js";
import { BashTool } from "../src/tools/bashTool.js";
import { ReadFileTool, WriteFileTool } from "../src/tools/fileTools.js";
import { RecallNotesTool, RecordNoteTool } from "../src/tools/noteTool.js";
import { createLlmClient, createTempWorkspace } from "./shared.js";

async function demoDirectNoteUsage(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 1: Direct Session Note Tool Usage");
  console.log("=".repeat(60));

  const workspace = await createTempWorkspace("mini-agent-ts-notes-");
  const memoryFile = `${workspace}/.agent_memory.json`;

  const recordTool = new RecordNoteTool(memoryFile);
  const recallTool = new RecallNotesTool(memoryFile);

  await recordTool.execute({ content: "User is a TypeScript developer", category: "user_info" });
  await recordTool.execute({ content: "Project uses Node.js + TypeScript", category: "project_info" });
  await recordTool.execute({ content: "User prefers concise code", category: "user_preference" });

  const allNotes = await recallTool.execute({});
  console.log(allNotes.content);

  const prefNotes = await recallTool.execute({ category: "user_preference" });
  console.log("\nFiltered notes:\n" + prefNotes.content);

  console.log("\nMemory file:");
  console.log(await readFile(memoryFile, "utf-8"));

  await rm(workspace, { recursive: true, force: true });
}

async function demoAgentWithNotes(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 2: Agent with Session Memory");
  console.log("=".repeat(60));

  const workspace = await createTempWorkspace("mini-agent-ts-notes-");
  const memoryFile = `${workspace}/.agent_memory.json`;
  const llm = createLlmClient();

  const tools = [
    new ReadFileTool(workspace),
    new WriteFileTool(workspace),
    new BashTool(workspace),
    new RecordNoteTool(memoryFile),
    new RecallNotesTool(memoryFile)
  ];

  const basePrompt = await loadSystemPrompt(workspace);
  const noteInstructions = `\n\nIMPORTANT - Session Note Management:
Use record_note to store durable user/project facts.
Use recall_notes at the start of a new conversation to restore context.
Categories: user_info, user_preference, project_info, decision.`;
  const systemPrompt = basePrompt + noteInstructions;

  const agent1 = new Agent({ llmClient: llm, systemPrompt, tools, maxSteps: 15 });
  agent1.addUserMessage(`
I am Alex, a senior TypeScript engineer.
I am building a project named mini-agent-ts.
I prefer strict typing and clear docs.
Please remember this and create README.md to confirm.
`);

  console.log("Session 1 running...");
  console.log(await agent1.run());

  const agent2 = new Agent({ llmClient: llm, systemPrompt, tools, maxSteps: 10 });
  agent2.addUserMessage("Do you remember who I am and my coding preferences?");

  console.log("\nSession 2 running...");
  console.log(await agent2.run());

  await rm(workspace, { recursive: true, force: true });
}

async function main(): Promise<void> {
  console.log("Session Note Tool Examples (TS)");
  await demoDirectNoteUsage();
  await demoAgentWithNotes();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
