export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
  toOpenAISchema(): Record<string, unknown>;
  toAnthropicSchema(): Record<string, unknown>;
}

export abstract class BaseTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: Record<string, unknown>;

  abstract execute(args: Record<string, unknown>): Promise<ToolResult>;

  toOpenAISchema(): Record<string, unknown> {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    };
  }

  toAnthropicSchema(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.parameters
    };
  }
}
