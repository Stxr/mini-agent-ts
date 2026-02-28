#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { Agent } from "./agent.js";
import { getAppConfig } from "./config/env.js";
import { loadSystemPrompt } from "./config/systemPrompt.js";
import { LLMClient } from "./llm/llmClient.js";
import { createWorkspaceTools, loadSharedToolsFromEnv } from "./runtime/toolSetup.js";
import type { Tool } from "./tools/base.js";
import { cleanupMcpConnections } from "./tools/mcpLoader.js";

interface RuntimeContext {
  workspace: string;
  agent: Agent;
  sessionStart: Date;
  logFile: string;
  toolCount: number;
  model: string;
  startupLines: string[];
  skillsEnabled: boolean;
  skillsDir: string;
  loadedSkillNames: string[];
}

interface CliArgs {
  workspace: string;
  task?: string;
}

class Colors {
  static readonly RESET = "\x1b[0m";
  static readonly BOLD = "\x1b[1m";
  static readonly DIM = "\x1b[2m";
  static readonly GREEN = "\x1b[32m";
  static readonly CYAN = "\x1b[36m";
  static readonly BRIGHT_CYAN = "\x1b[96m";
  static readonly BRIGHT_YELLOW = "\x1b[93m";
}

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = { workspace: process.cwd() };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--workspace" && argv[i + 1]) {
      result.workspace = resolve(argv[i + 1]);
      i += 1;
    } else if (token === "--task" && argv[i + 1]) {
      result.task = argv[i + 1];
      i += 1;
    }
  }
  return result;
}

async function createAgent(workspace: string): Promise<{
  agent: Agent;
  toolCount: number;
  model: string;
  startupLines: string[];
  skillsEnabled: boolean;
  skillsDir: string;
  loadedSkillNames: string[];
}> {
  const { apiKey, apiBase, model, provider } = getAppConfig();
  const llm = new LLMClient({ apiKey, apiBase, model, provider });
  const startupLines: string[] = [];
  const shared = await loadSharedToolsFromEnv();
  const tools: Tool[] = [...createWorkspaceTools(workspace), ...shared.tools];
  startupLines.push(`${Colors.GREEN}✅ Loaded file operation tools${Colors.RESET} (workspace: ${workspace})`);
  startupLines.push(`${Colors.GREEN}✅ Loaded session note tool${Colors.RESET}`);
  const enableMcp = (process.env.MINI_AGENT_ENABLE_MCP ?? "").toLowerCase() === "true";
  if (enableMcp) {
    startupLines.push(
      shared.mcpToolCount > 0
        ? `${Colors.GREEN}✅ Loaded ${shared.mcpToolCount} MCP tools${Colors.RESET}`
        : `${Colors.DIM}⚠️  MCP enabled but no MCP tools loaded${Colors.RESET}`
    );
  }

  const loadedSkillNames = shared.loadedSkillNames;
  const skillsCount = loadedSkillNames.length;
  if (skillsCount > 0) {
    startupLines.push(`${Colors.GREEN}✅ Loaded skill tool${Colors.RESET} (get_skill)`);
  }

  const systemPrompt = await loadSystemPrompt(workspace, shared.skillsMetadata);
  const systemPromptPath = resolve(process.cwd(), "config/system_prompt.md");
  startupLines.push(`${Colors.GREEN}✅ Loaded system prompt${Colors.RESET} (from: ${systemPromptPath})`);
  if (skillsCount > 0) {
    startupLines.push(`${Colors.GREEN}✅ Injected ${skillsCount} skills metadata${Colors.RESET} into system prompt`);
  }

  const agent = new Agent({
    llmClient: llm,
    systemPrompt,
    tools
  });

  return {
    agent,
    toolCount: tools.length,
    model,
    startupLines,
    skillsEnabled: shared.skillsEnabled,
    skillsDir: shared.skillsDir,
    loadedSkillNames
  };
}

function logDir(): string {
  return join(homedir(), ".mini-agent-ts", "log");
}

function newLogFilePath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(logDir(), `agent_run_${stamp}.log`);
}

async function initContext(workspace: string): Promise<RuntimeContext> {
  await mkdir(logDir(), { recursive: true });
  const built = await createAgent(workspace);
  return {
    workspace,
    agent: built.agent,
    sessionStart: new Date(),
    logFile: newLogFilePath(),
    toolCount: built.toolCount,
    model: built.model,
    startupLines: built.startupLines,
    skillsEnabled: built.skillsEnabled,
    skillsDir: built.skillsDir,
    loadedSkillNames: built.loadedSkillNames
  };
}

function printBanner(): void {
  const width = 58;
  const title = "🤖 Mini Agent TS - Multi-turn Interactive Session";
  const padding = Math.max(0, width - title.length);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  console.log("");
  console.log(`${Colors.BOLD}${Colors.BRIGHT_CYAN}╔${"═".repeat(width)}╗${Colors.RESET}`);
  console.log(`${Colors.BOLD}${Colors.BRIGHT_CYAN}║${Colors.RESET}${" ".repeat(left)}${Colors.BOLD}${title}${Colors.RESET}${" ".repeat(right)}${Colors.BOLD}${Colors.BRIGHT_CYAN}║${Colors.RESET}`);
  console.log(`${Colors.BOLD}${Colors.BRIGHT_CYAN}╚${"═".repeat(width)}╝${Colors.RESET}`);
  console.log("");
}

function printSessionInfo(ctx: RuntimeContext): void {
  const width = 58;
  const messages = ctx.agent.getHistory().length;
  const fit = (text: string): string => {
    const maxLen = width - 4;
    if (text.length <= maxLen) {
      return text;
    }
    return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
  };
  const lines = [
    fit(`Model: ${ctx.model}`),
    fit(`Workspace: ${ctx.workspace}`),
    fit(`Message History: ${messages} messages`),
    fit(`Available Tools: ${ctx.toolCount} tools`)
  ];

  console.log(`${Colors.DIM}┌${"─".repeat(width)}┐${Colors.RESET}`);
  const header = "Session Info";
  const pad = Math.max(0, width - header.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  console.log(`${Colors.DIM}│${Colors.RESET}${" ".repeat(left)}${Colors.BRIGHT_CYAN}${header}${Colors.RESET}${" ".repeat(right)}${Colors.DIM}│${Colors.RESET}`);
  console.log(`${Colors.DIM}├${"─".repeat(width)}┤${Colors.RESET}`);
  for (const line of lines) {
    const linePad = Math.max(0, width - line.length);
    console.log(`${Colors.DIM}│${Colors.RESET} ${line}${" ".repeat(linePad - 1)}${Colors.DIM}│${Colors.RESET}`);
  }
  console.log(`${Colors.DIM}└${"─".repeat(width)}┘${Colors.RESET}`);
  console.log("");
}

async function writeLog(ctx: RuntimeContext, title: string, body: string): Promise<void> {
  const chunk = `\n[${new Date().toISOString()}] ${title}\n${body}\n`;
  await appendFile(ctx.logFile, chunk, "utf-8");
}

function formatDuration(start: Date): string {
  const totalSeconds = Math.floor((Date.now() - start.getTime()) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function printHelp(): void {
  console.log(`\nAvailable Commands:
  /help         - Show this help message
  /clear        - Clear session history (keep system prompt)
  /history      - Show current session message count
  /stats        - Show session statistics
  /skills       - Show loaded skills and status
  /log          - Show log directory and recent files
  /log <file>   - Read a specific log file
  /exit         - Exit program (also: /quit, /q, exit, quit, q)\n`);
}

function printHistory(ctx: RuntimeContext): void {
  console.log(`\nCurrent session message count: ${ctx.agent.getHistory().length}\n`);
}

function printStats(ctx: RuntimeContext): void {
  const messages = ctx.agent.getHistory();
  const user = messages.filter((m) => m.role === "user").length;
  const assistant = messages.filter((m) => m.role === "assistant").length;
  const tool = messages.filter((m) => m.role === "tool").length;

  console.log(`\nSession Statistics:
────────────────────────────────────────
  Session Duration: ${formatDuration(ctx.sessionStart)}
  Total Messages: ${messages.length}
    - User Messages: ${user}
    - Assistant Replies: ${assistant}
    - Tool Calls: ${tool}
  Available Tools: ${ctx.toolCount}
────────────────────────────────────────\n`);
}

function printSkills(ctx: RuntimeContext): void {
  console.log("\nSkills Status:");
  console.log("────────────────────────────────────────");
  console.log(`  Skills Enabled: ${ctx.skillsEnabled ? "yes" : "no"}`);
  console.log(`  Skills Directory: ${ctx.skillsDir}`);
  if (!ctx.skillsEnabled) {
    console.log("  Loaded Skills: 0");
    console.log("────────────────────────────────────────\n");
    return;
  }

  console.log(`  Loaded Skills: ${ctx.loadedSkillNames.length}`);
  for (const name of ctx.loadedSkillNames) {
    console.log(`    - ${name} [loaded]`);
  }
  console.log("────────────────────────────────────────\n");
}

async function showLogDirectory(): Promise<void> {
  await mkdir(logDir(), { recursive: true });
  const files = (await readdir(logDir())).filter((f) => f.endsWith(".log"));

  console.log(`\nLog Directory: ${logDir()}`);
  if (files.length === 0) {
    console.log("No log files found.\n");
    return;
  }

  const enriched = await Promise.all(
    files.map(async (name) => {
      const full = join(logDir(), name);
      const s = await stat(full);
      return { name, full, mtime: s.mtimeMs, size: s.size };
    })
  );

  enriched.sort((a, b) => b.mtime - a.mtime);

  console.log("Recent log files:");
  for (const [i, file] of enriched.slice(0, 10).entries()) {
    console.log(`  ${i + 1}. ${file.name} (${file.size} bytes)`);
  }
  console.log();
}

async function showLogFile(filename: string): Promise<void> {
  const filePath = join(logDir(), basename(filename));
  const content = await readFile(filePath, "utf-8");
  console.log(`\n${filePath}\n${"-".repeat(80)}\n${content}\n${"-".repeat(80)}\n`);
}

async function handleSlashCommand(rawInput: string, ctx: RuntimeContext): Promise<"continue" | "exit"> {
  const input = rawInput.trim();
  const command = input.toLowerCase();

  if (["/exit", "/quit", "/q"].includes(command)) {
    console.log("\n👋 Interrupt signal detected, exiting...\n");
    printStats(ctx);
    return "exit";
  }

  if (command === "/help") {
    printHelp();
    return "continue";
  }

  if (command === "/clear") {
    const oldCount = ctx.agent.getHistory().length;
    await cleanupMcpConnections();
    const rebuilt = await createAgent(ctx.workspace);
    ctx.agent = rebuilt.agent;
    ctx.toolCount = rebuilt.toolCount;
    ctx.skillsEnabled = rebuilt.skillsEnabled;
    ctx.skillsDir = rebuilt.skillsDir;
    ctx.loadedSkillNames = rebuilt.loadedSkillNames;
    console.log(`\nCleared ${Math.max(0, oldCount - 1)} messages, started new session.\n`);
    return "continue";
  }

  if (command === "/history") {
    printHistory(ctx);
    return "continue";
  }

  if (command === "/stats") {
    printStats(ctx);
    return "continue";
  }

  if (command === "/skills") {
    printSkills(ctx);
    return "continue";
  }

  if (command === "/log" || command.startsWith("/log ")) {
    const part = input.split(/\s+/, 2)[1];
    if (!part) {
      await showLogDirectory();
    } else {
      try {
        await showLogFile(part.trim().replace(/^['"]|['"]$/g, ""));
      } catch (error) {
        console.log(`\nFailed to read log file: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    return "continue";
  }

  console.log(`\nUnknown command: ${input}`);
  console.log("Type /help to see available commands.\n");
  return "continue";
}

async function runInteractive(ctx: RuntimeContext): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  for (const line of ctx.startupLines) {
    console.log(line);
  }
  printBanner();
  printSessionInfo(ctx);
  console.log(`${Colors.DIM}Log file: ${ctx.logFile}${Colors.RESET}`);
  console.log(`${Colors.DIM}Type /help for commands, /exit to quit.${Colors.RESET}`);

  while (true) {
    const task = (await rl.question("\n> ")).trim();
    if (!task) {
      continue;
    }

    if (task.startsWith("/")) {
      const outcome = await handleSlashCommand(task, ctx);
      if (outcome === "exit") {
        break;
      }
      continue;
    }

    if (["exit", "quit", "q"].includes(task.toLowerCase())) {
      console.log("\n👋 Interrupt signal detected, exiting...\n");
      printStats(ctx);
      break;
    }

    await writeLog(ctx, "USER", task);
    ctx.agent.addUserMessage(task);

    try {
      const result = await ctx.agent.run();
      await writeLog(ctx, "ASSISTANT", result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeLog(ctx, "ERROR", message);
      console.error(message);
    }
  }

  rl.close();
}

async function main(): Promise<void> {
  const { workspace, task } = parseArgs(process.argv);
  let ctx: RuntimeContext | null = null;
  let interrupted = false;

  const handleInterrupt = async (): Promise<void> => {
    if (interrupted) {
      return;
    }
    interrupted = true;
    console.log("\n👋 Interrupt signal detected, exiting...\n");
    if (ctx) {
      printStats(ctx);
    }
    await cleanupMcpConnections();
    process.exit(130);
  };

  process.once("SIGINT", () => {
    void handleInterrupt();
  });
  process.once("SIGTERM", () => {
    void handleInterrupt();
  });

  try {
    ctx = await initContext(workspace);

    if (task) {
      await writeLog(ctx, "USER", task);
      ctx.agent.addUserMessage(task);
      const result = await ctx.agent.run();
      await writeLog(ctx, "ASSISTANT", result);
      printStats(ctx);
      return;
    }

    await runInteractive(ctx);
  } finally {
    await cleanupMcpConnections();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
