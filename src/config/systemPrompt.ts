import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools.";

export async function loadSystemPrompt(workspace: string, skillsMetadata = "No skills metadata available."): Promise<string> {
  const promptPath = resolve(process.cwd(), "config/system_prompt.md");

  let prompt = DEFAULT_PROMPT;
  if (existsSync(promptPath)) {
    prompt = await readFile(promptPath, "utf-8");
  }

  prompt = prompt.replace("{SKILLS_METADATA}", skillsMetadata || "No skills metadata available.");

  if (!prompt.includes("Current Workspace") && !prompt.includes("Workspace:")) {
    prompt += `\n\n## Current Workspace\nYou are currently working in: \`${workspace}\`\nAll relative paths are resolved against this directory.`;
  }

  return prompt;
}
