import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BashTool } from "../src/tools/bashTool.js";
import { EditFileTool, ReadFileTool, WriteFileTool } from "../src/tools/fileTools.js";

describe("basic tools", () => {
  it("ReadFileTool reads content with line numbers", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ma-ts-tools-"));
    const file = join(workspace, "a.txt");
    await writeFile(file, "Hello, World!", "utf-8");

    const tool = new ReadFileTool(workspace);
    const result = await tool.execute({ path: "a.txt" });

    expect(result.success).toBe(true);
    expect(result.content).toContain("Hello, World!");
    expect(result.content).toContain("|Hello, World!");

    await rm(workspace, { recursive: true, force: true });
  });

  it("WriteFileTool writes content", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ma-ts-tools-"));
    const tool = new WriteFileTool(workspace);
    const result = await tool.execute({ path: "b.txt", content: "Test content" });

    expect(result.success).toBe(true);
    expect(await readFile(join(workspace, "b.txt"), "utf-8")).toBe("Test content");

    await rm(workspace, { recursive: true, force: true });
  });

  it("EditFileTool replaces matched string", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ma-ts-tools-"));
    await writeFile(join(workspace, "c.txt"), "Hello, World!", "utf-8");

    const tool = new EditFileTool(workspace);
    const result = await tool.execute({ path: "c.txt", old_str: "World", new_str: "Agent" });

    expect(result.success).toBe(true);
    expect(await readFile(join(workspace, "c.txt"), "utf-8")).toBe("Hello, Agent!");

    await rm(workspace, { recursive: true, force: true });
  });

  it("BashTool executes command and handles failures", async () => {
    const tool = new BashTool(process.cwd());

    const ok = await tool.execute({ command: "echo 'Hello from bash'" });
    expect(ok.success).toBe(true);
    expect(ok.content).toContain("Hello from bash");

    const fail = await tool.execute({ command: "exit 1" });
    expect(fail.success).toBe(false);
    expect(fail.error).toBeTruthy();
  });
});
