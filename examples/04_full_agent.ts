import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Agent } from "../src/agent.js";
import { loadSystemPrompt } from "../src/config/systemPrompt.js";
import type { Tool } from "../src/tools/base.js";
import { BashTool } from "../src/tools/bashTool.js";
import { EditFileTool, ReadFileTool, WriteFileTool } from "../src/tools/fileTools.js";
import { loadMcpToolsAsync, cleanupMcpConnections } from "../src/tools/mcpLoader.js";
import { RecallNotesTool, RecordNoteTool } from "../src/tools/noteTool.js";
import { createSkillTools } from "../src/tools/skillTool.js";
import { createLlmClient, createTempWorkspace } from "./shared.js";

async function demoFullAgent(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Full Mini-Agent-TS Example");
  console.log("=".repeat(60));

  const workspace = await createTempWorkspace("mini-agent-ts-full-");
  const memoryFile = `${workspace}/.agent_memory.json`;

  const tools: Tool[] = [
    new ReadFileTool(workspace),
    new WriteFileTool(workspace),
    new EditFileTool(workspace),
    new BashTool(workspace),
    new RecordNoteTool(memoryFile),
    new RecallNotesTool(memoryFile)
  ];
  console.log("Loaded 6 local tools");
  let skillsMetadata = "";

  try {
    const mcpTools = await loadMcpToolsAsync("config/mcp.json");
    if (mcpTools.length > 0) {
      tools.push(...mcpTools);
      console.log(`Loaded ${mcpTools.length} MCP tools`);
    } else {
      console.log("No MCP tools configured (mcp.json missing/empty/disabled).");
    }
  } catch (error) {
    console.log(`MCP tools not loaded: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const { tools: skillTools, loader } = await createSkillTools(process.env.MINI_AGENT_SKILLS_DIR ?? "./skills");
    tools.push(...skillTools);
    skillsMetadata = loader?.getSkillsMetadataPrompt() ?? "";
    console.log(`Loaded ${skillTools.length} skill tools`);
  } catch (error) {
    console.log(`Skill tools not loaded: ${error instanceof Error ? error.message : String(error)}`);
  }

  const agent = new Agent({
    llmClient: createLlmClient(),
    systemPrompt:
      (await loadSystemPrompt(workspace, skillsMetadata)) +
      "\n\nIMPORTANT - Session Memory:\nYou have record_note and recall_notes tools. Use them to save key facts and recall context across turns.",
    tools,
    maxSteps: 20
  });

  const task = `
Please help with these tasks:
1. Create calculator.ts with add/subtract/multiply/divide functions.
2. Create README.md explaining usage.
3. Run a bash command to validate files.
4. Record project info into session notes.
`;

  agent.addUserMessage(task);
  const result = await agent.run();
  console.log(result);

  const files = await readdir(workspace);
  console.log("\nCreated files:");
  for (const file of files) {
    if (!file.startsWith(".")) {
      const content = await readFile(join(workspace, file), "utf-8");
      console.log(`\n--- ${file} ---\n${content.split("\n").slice(0, 20).join("\n")}`);
    }
  }

  await rm(workspace, { recursive: true, force: true });
  await cleanupMcpConnections();
}

async function demoInteractiveTurns(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Multi-turn Agent Demo");
  console.log("=".repeat(60));

  const workspace = await createTempWorkspace("mini-agent-ts-full-");

  const agent = new Agent({
    llmClient: createLlmClient(),
    systemPrompt: await loadSystemPrompt(workspace),
    tools: [new WriteFileTool(workspace), new ReadFileTool(workspace), new BashTool(workspace)],
    maxSteps: 20
  });

  const turns = [
    "Create data.txt with numbers 1 to 5, one per line.",
    "Read the file and summarize its content.",
    "Use bash to count lines in data.txt."
  ];

  for (const [index, turn] of turns.entries()) {
    console.log(`\nTurn ${index + 1}: ${turn}`);
    agent.addUserMessage(turn);
    console.log(await agent.run());
  }

  await rm(workspace, { recursive: true, force: true });
}

async function main(): Promise<void> {
  try {
    await demoFullAgent();
    await demoInteractiveTurns();
  } finally {
    await cleanupMcpConnections();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
