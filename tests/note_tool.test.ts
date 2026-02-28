import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RecallNotesTool, RecordNoteTool } from "../src/tools/noteTool.js";

describe("session note tools", () => {
  it("records and recalls notes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ma-ts-note-"));
    const file = join(workspace, "notes.json");

    const record = new RecordNoteTool(file);
    const recall = new RecallNotesTool(file);

    await record.execute({ content: "User prefers concise responses", category: "user_preference" });
    await record.execute({ content: "Project uses TypeScript", category: "project_info" });

    const all = await recall.execute({});
    expect(all.success).toBe(true);
    expect(all.content).toContain("concise responses");
    expect(all.content).toContain("TypeScript");

    const filtered = await recall.execute({ category: "user_preference" });
    expect(filtered.success).toBe(true);
    expect(filtered.content).toContain("concise responses");
    expect(filtered.content).not.toContain("TypeScript");

    await rm(workspace, { recursive: true, force: true });
  });

  it("returns empty message when no notes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ma-ts-note-"));
    const file = join(workspace, "notes.json");

    const recall = new RecallNotesTool(file);
    const result = await recall.execute({});
    expect(result.success).toBe(true);
    expect(result.content).toContain("No notes recorded yet");

    await rm(workspace, { recursive: true, force: true });
  });
});
