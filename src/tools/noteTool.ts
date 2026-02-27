import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { BaseTool, type ToolResult } from "./base.js";

interface NoteItem {
  timestamp: string;
  category: string;
  content: string;
}

async function loadNotes(memoryFile: string): Promise<NoteItem[]> {
  try {
    const raw = await readFile(memoryFile, "utf-8");
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? (data as NoteItem[]) : [];
  } catch {
    return [];
  }
}

export class RecordNoteTool extends BaseTool {
  readonly name = "record_note";
  readonly description = "Record important context as session notes.";
  readonly parameters = {
    type: "object",
    properties: {
      content: { type: "string" },
      category: { type: "string" }
    },
    required: ["content"]
  };

  private readonly schema = z.object({
    content: z.string().min(1),
    category: z.string().optional()
  });

  constructor(private readonly memoryFile: string) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { content, category } = this.schema.parse(args);
      const notes = await loadNotes(this.memoryFile);
      notes.push({
        timestamp: new Date().toISOString(),
        category: category ?? "general",
        content
      });
      await mkdir(dirname(this.memoryFile), { recursive: true });
      await writeFile(this.memoryFile, JSON.stringify(notes, null, 2), "utf-8");
      return { success: true, content: `Recorded note: ${content}` };
    } catch (error) {
      return { success: false, content: "", error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export class RecallNotesTool extends BaseTool {
  readonly name = "recall_notes";
  readonly description = "Recall recorded session notes.";
  readonly parameters = {
    type: "object",
    properties: {
      category: { type: "string" }
    }
  };

  private readonly schema = z.object({
    category: z.string().optional()
  });

  constructor(private readonly memoryFile: string) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { category } = this.schema.parse(args);
      const notes = await loadNotes(this.memoryFile);
      const filtered = category ? notes.filter((n) => n.category === category) : notes;
      if (filtered.length === 0) {
        return { success: true, content: "No notes recorded yet." };
      }
      const content = filtered
        .map((n, i) => `${i + 1}. [${n.category}] ${n.content}\n   (${n.timestamp})`)
        .join("\n");
      return { success: true, content: `Recorded Notes:\n${content}` };
    } catch (error) {
      return { success: false, content: "", error: error instanceof Error ? error.message : String(error) };
    }
  }
}
