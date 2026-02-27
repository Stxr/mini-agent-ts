import type { LlmClient } from "./llm/base.js";
import type { Message } from "./schema.js";
import type { Tool } from "./tools/base.js";

class Colors {
  static readonly RESET = "\x1b[0m";
  static readonly BOLD = "\x1b[1m";
  static readonly DIM = "\x1b[2m";
  static readonly RED = "\x1b[31m";
  static readonly GREEN = "\x1b[32m";
  static readonly YELLOW = "\x1b[33m";
  static readonly BLUE = "\x1b[34m";
  static readonly MAGENTA = "\x1b[35m";
  static readonly CYAN = "\x1b[36m";
  static readonly BRIGHT_RED = "\x1b[91m";
  static readonly BRIGHT_GREEN = "\x1b[92m";
  static readonly BRIGHT_YELLOW = "\x1b[93m";
  static readonly BRIGHT_BLUE = "\x1b[94m";
  static readonly BRIGHT_CYAN = "\x1b[96m";
}

export interface AgentOptions {
  llmClient: LlmClient;
  systemPrompt: string;
  tools: Tool[];
  maxSteps?: number;
  verbose?: boolean;
}

export class Agent {
  private readonly llm: LlmClient;
  private readonly tools: Map<string, Tool>;
  private readonly maxSteps: number;
  private readonly messages: Message[];
  private readonly verbose: boolean;
  private apiTotalTokens = 0;

  constructor(options: AgentOptions) {
    this.llm = options.llmClient;
    this.maxSteps = options.maxSteps ?? 50;
    this.tools = new Map(options.tools.map((t) => [t.name, t]));
    this.messages = [{ role: "system", content: options.systemPrompt }];
    this.verbose = options.verbose ?? true;
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
  }

  getHistory(): Message[] {
    return [...this.messages];
  }

  getApiTotalTokens(): number {
    return this.apiTotalTokens;
  }

  private print(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }

  private printStepHeader(step: number): void {
    const boxWidth = 58;
    const title = `${Colors.BOLD}${Colors.BRIGHT_CYAN}💭 Step ${step + 1}/${this.maxSteps}${Colors.RESET}`;
    const rawTitleLength = `💭 Step ${step + 1}/${this.maxSteps}`.length;
    const padding = Math.max(0, boxWidth - 1 - rawTitleLength);
    this.print(`\n${Colors.DIM}╭${"─".repeat(boxWidth)}╮${Colors.RESET}`);
    this.print(`${Colors.DIM}│${Colors.RESET} ${title}${" ".repeat(padding)}${Colors.DIM}│${Colors.RESET}`);
    this.print(`${Colors.DIM}╰${"─".repeat(boxWidth)}╯${Colors.RESET}`);
  }

  private formatArgs(argumentsObject: Record<string, unknown>): string {
    const truncated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(argumentsObject)) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      if (text.length > 200) {
        truncated[key] = `${text.slice(0, 200)}...`;
      } else {
        truncated[key] = value;
      }
    }
    return JSON.stringify(truncated, null, 2);
  }

  private truncateText(text: string, maxLen: number): string {
    if (text.length <= maxLen) {
      return text;
    }
    return `${text.slice(0, maxLen)}${Colors.DIM}...${Colors.RESET}`;
  }

  async run(): Promise<string> {
    const runStart = Date.now();
    for (let step = 0; step < this.maxSteps; step += 1) {
      const stepStart = Date.now();
      this.printStepHeader(step);

      const response = await this.llm.generate(this.messages, Array.from(this.tools.values()));
      if (response.usage) {
        this.apiTotalTokens = response.usage.totalTokens;
      }

      this.messages.push({
        role: "assistant",
        content: response.content,
        thinking: response.thinking,
        toolCalls: response.toolCalls
      });

      if (response.thinking) {
        this.print(`\n${Colors.BOLD}${Colors.MAGENTA}🧠 Thinking:${Colors.RESET}`);
        this.print(`${Colors.DIM}${response.thinking}${Colors.RESET}`);
      }

      if (response.content) {
        this.print(`\n${Colors.BOLD}${Colors.BRIGHT_BLUE}🤖 Assistant:${Colors.RESET}`);
        this.print(response.content);
      }

      if (!response.toolCalls || response.toolCalls.length === 0) {
        const stepElapsed = (Date.now() - stepStart) / 1000;
        const totalElapsed = (Date.now() - runStart) / 1000;
        this.print(`\n${Colors.DIM}⏱️  Step ${step + 1} completed in ${stepElapsed.toFixed(2)}s (total: ${totalElapsed.toFixed(2)}s)${Colors.RESET}`);
        return response.content;
      }

      for (const call of response.toolCalls) {
        this.print(`\n${Colors.BRIGHT_YELLOW}🔧 Tool Call:${Colors.RESET} ${Colors.BOLD}${Colors.CYAN}${call.function.name}${Colors.RESET}`);
        this.print(`${Colors.DIM}   Arguments:${Colors.RESET}`);
        for (const line of this.formatArgs(call.function.arguments).split("\n")) {
          this.print(`   ${Colors.DIM}${line}${Colors.RESET}`);
        }

        const tool = this.tools.get(call.function.name);
        const result = tool
          ? await tool.execute(call.function.arguments)
          : { success: false, content: "", error: `Unknown tool: ${call.function.name}` };

        if (result.success) {
          this.print(`${Colors.BRIGHT_GREEN}✓ Result:${Colors.RESET} ${this.truncateText(result.content, 300)}`);
        } else {
          this.print(`${Colors.BRIGHT_RED}✗ Error:${Colors.RESET} ${Colors.RED}${result.error ?? "Unknown error"}${Colors.RESET}`);
        }

        this.messages.push({
          role: "tool",
          content: result.success ? result.content : `Error: ${result.error}`,
          toolCallId: call.id,
          name: call.function.name
        });
      }

      const stepElapsed = (Date.now() - stepStart) / 1000;
      const totalElapsed = (Date.now() - runStart) / 1000;
      this.print(`\n${Colors.DIM}⏱️  Step ${step + 1} completed in ${stepElapsed.toFixed(2)}s (total: ${totalElapsed.toFixed(2)}s)${Colors.RESET}`);
    }

    const error = `Task couldn't be completed after ${this.maxSteps} steps.`;
    this.print(`\n${Colors.BRIGHT_YELLOW}⚠️  ${error}${Colors.RESET}`);
    return error;
  }
}
