import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BashTool } from "../src/tools/bashTool.js";
import { EditFileTool, ReadFileTool, WriteFileTool } from "../src/tools/fileTools.js";

async function demoWriteTool(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 1: WriteFileTool - Create a new file");
  console.log("=".repeat(60));

  const workspace = await mkdtemp(join(tmpdir(), "mini-agent-ts-tools-"));
  try {
    const filePath = join(workspace, "hello.txt");
    const tool = new WriteFileTool(workspace);
    const result = await tool.execute({
      path: "hello.txt",
      content: "Hello, Mini Agent TS!\nThis is a test file."
    });

    if (result.success) {
      console.log(`File created: ${filePath}`);
      console.log(await readFile(filePath, "utf-8"));
    } else {
      console.log(`Failed: ${result.error}`);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function demoReadTool(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 2: ReadFileTool - Read file contents");
  console.log("=".repeat(60));

  const workspace = await mkdtemp(join(tmpdir(), "mini-agent-ts-tools-"));
  try {
    const filePath = join(workspace, "sample.txt");
    await writeFile(filePath, "Line 1: Hello\nLine 2: World\nLine 3: Mini Agent TS", "utf-8");

    const tool = new ReadFileTool(workspace);
    const result = await tool.execute({ path: "sample.txt" });

    if (result.success) {
      console.log(result.content);
    } else {
      console.log(`Failed: ${result.error}`);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function demoEditTool(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 3: EditFileTool - Edit file content");
  console.log("=".repeat(60));

  const workspace = await mkdtemp(join(tmpdir(), "mini-agent-ts-tools-"));
  try {
    const filePath = join(workspace, "edit.txt");
    await writeFile(filePath, "Python is great!\nI love programming.", "utf-8");

    console.log("Original:");
    console.log(await readFile(filePath, "utf-8"));

    const tool = new EditFileTool(workspace);
    const result = await tool.execute({
      path: "edit.txt",
      old_str: "Python",
      new_str: "Agent"
    });

    if (result.success) {
      console.log("Updated:");
      console.log(await readFile(filePath, "utf-8"));
    } else {
      console.log(`Failed: ${result.error}`);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function demoBashTool(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Demo 4: BashTool - Execute shell commands");
  console.log("=".repeat(60));

  const tool = new BashTool(process.cwd());

  console.log("\nCommand: ls -la");
  const result1 = await tool.execute({ command: "ls -la" });
  if (result1.success) {
    console.log(`Output:\n${result1.content.slice(0, 240)}...`);
  } else {
    console.log(`Failed: ${result1.error}`);
  }

  console.log("\nCommand: pwd");
  const result2 = await tool.execute({ command: "pwd" });
  if (result2.success) {
    console.log(`Current directory: ${result2.content.trim()}`);
  } else {
    console.log(`Failed: ${result2.error}`);
  }

  console.log("\nCommand: echo 'Hello from BashTool!'");
  const result3 = await tool.execute({ command: "echo 'Hello from BashTool!'" });
  if (result3.success) {
    console.log(`Output: ${result3.content.trim()}`);
  } else {
    console.log(`Failed: ${result3.error}`);
  }
}

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Basic Tools Usage Examples (TS)");
  console.log("=".repeat(60));

  await demoWriteTool();
  await demoReadTool();
  await demoEditTool();
  await demoBashTool();

  console.log("\nAll demos completed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
