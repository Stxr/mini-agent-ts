import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { BaseTool, type ToolResult } from "./base.js";

const execAsync = promisify(exec);

export class BashTool extends BaseTool {
  readonly name = "bash";
  readonly description = "Execute shell commands for git/npm/docker and other terminal operations.";
  readonly parameters = {
    type: "object",
    properties: {
      command: { type: "string" },
      timeout: { type: "integer", default: 120 }
    },
    required: ["command"]
  };

  private readonly schema = z.object({
    command: z.string().min(1),
    timeout: z.number().int().positive().max(600).optional()
  });

  constructor(private readonly workspaceDir: string) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { command, timeout } = this.schema.parse(args);
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workspaceDir,
        timeout: (timeout ?? 120) * 1000,
        maxBuffer: 1024 * 1024
      });
      const output = [stdout.trim(), stderr.trim() ? `[stderr]\n${stderr.trim()}` : ""].filter(Boolean).join("\n");
      return { success: true, content: output || "(no output)" };
    } catch (error) {
      return { success: false, content: "", error: error instanceof Error ? error.message : String(error) };
    }
  }
}
