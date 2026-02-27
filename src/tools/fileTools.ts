import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, isAbsolute } from "node:path";
import { z } from "zod";
import { BaseTool, type ToolResult } from "./base.js";

function absPath(workspaceDir: string, path: string): string {
  return isAbsolute(path) ? path : resolve(workspaceDir, path);
}

export class ReadFileTool extends BaseTool {
  readonly name = "read_file";
  readonly description = "Read file content with line numbers.";
  readonly parameters = {
    type: "object",
    properties: {
      path: { type: "string" },
      offset: { type: "integer" },
      limit: { type: "integer" }
    },
    required: ["path"]
  };

  private readonly schema = z.object({
    path: z.string(),
    offset: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional()
  });

  constructor(private readonly workspaceDir: string) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { path, offset, limit } = this.schema.parse(args);
      const fullPath = absPath(this.workspaceDir, path);
      const text = await readFile(fullPath, "utf-8");
      const lines = text.split(/\r?\n/);
      const start = offset ? offset - 1 : 0;
      const end = limit ? start + limit : lines.length;
      const numbered = lines.slice(start, end).map((line, i) => `${String(start + i + 1).padStart(6, " ")}|${line}`);
      return { success: true, content: numbered.join("\n") };
    } catch (error) {
      return { success: false, content: "", error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export class WriteFileTool extends BaseTool {
  readonly name = "write_file";
  readonly description = "Write full content to a file.";
  readonly parameters = {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" }
    },
    required: ["path", "content"]
  };

  private readonly schema = z.object({
    path: z.string(),
    content: z.string()
  });

  constructor(private readonly workspaceDir: string) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { path, content } = this.schema.parse(args);
      const fullPath = absPath(this.workspaceDir, path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf-8");
      return { success: true, content: `Successfully wrote to ${fullPath}` };
    } catch (error) {
      return { success: false, content: "", error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export class EditFileTool extends BaseTool {
  readonly name = "edit_file";
  readonly description = "Replace exact old_str with new_str in a file.";
  readonly parameters = {
    type: "object",
    properties: {
      path: { type: "string" },
      old_str: { type: "string" },
      new_str: { type: "string" }
    },
    required: ["path", "old_str", "new_str"]
  };

  private readonly schema = z.object({
    path: z.string(),
    old_str: z.string(),
    new_str: z.string()
  });

  constructor(private readonly workspaceDir: string) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { path, old_str, new_str } = this.schema.parse(args);
      const fullPath = absPath(this.workspaceDir, path);
      const content = await readFile(fullPath, "utf-8");
      const count = content.split(old_str).length - 1;
      if (count !== 1) {
        return { success: false, content: "", error: `old_str must match exactly once, found ${count}` };
      }
      await writeFile(fullPath, content.replace(old_str, new_str), "utf-8");
      return { success: true, content: `Successfully edited ${fullPath}` };
    } catch (error) {
      return { success: false, content: "", error: error instanceof Error ? error.message : String(error) };
    }
  }
}
