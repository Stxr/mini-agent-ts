import { resolve } from "node:path";
import type { Tool } from "../tools/base.js";
import { BashTool } from "../tools/bashTool.js";
import { EditFileTool, ReadFileTool, WriteFileTool } from "../tools/fileTools.js";
import { loadMcpToolsAsync } from "../tools/mcpLoader.js";
import { RecallNotesTool, RecordNoteTool } from "../tools/noteTool.js";
import { createSkillTools } from "../tools/skillTool.js";

export interface SharedToolSetup {
  mcpToolCount: number;
  tools: Tool[];
  skillsMetadata: string;
  loadedSkillNames: string[];
  skillsDir: string;
  skillsEnabled: boolean;
  skillToolCount: number;
}

export async function loadSharedToolsFromEnv(): Promise<SharedToolSetup> {
  const tools: Tool[] = [];
  let mcpToolCount = 0;

  const enableMcp = (process.env.MINI_AGENT_ENABLE_MCP ?? "").toLowerCase() === "true";
  if (enableMcp) {
    const mcpConfigPath = process.env.MINI_AGENT_MCP_CONFIG ?? "config/mcp.json";
    const mcpTools = await loadMcpToolsAsync(mcpConfigPath);
    tools.push(...mcpTools);
    mcpToolCount = mcpTools.length;
  }

  const skillsEnabled = (process.env.MINI_AGENT_ENABLE_SKILLS ?? "").toLowerCase() === "true";
  const skillsDir = process.env.MINI_AGENT_SKILLS_DIR ?? "./skills";
  let skillsMetadata = "";
  let loadedSkillNames: string[] = [];
  let skillToolCount = 0;

  if (skillsEnabled) {
    const { tools: skillTools, loader } = await createSkillTools(skillsDir);
    tools.push(...skillTools);
    skillToolCount = skillTools.length;
    loadedSkillNames = loader?.listSkills() ?? [];
    skillsMetadata = loader?.getSkillsMetadataPrompt() ?? "";
  }

  return {
    mcpToolCount,
    tools,
    skillsMetadata,
    loadedSkillNames,
    skillsDir,
    skillsEnabled,
    skillToolCount
  };
}

export function createWorkspaceTools(workspace: string): Tool[] {
  const memoryFile = resolve(workspace, ".agent_memory.json");
  return [
    new ReadFileTool(workspace),
    new WriteFileTool(workspace),
    new EditFileTool(workspace),
    new BashTool(workspace),
    new RecordNoteTool(memoryFile),
    new RecallNotesTool(memoryFile)
  ];
}
