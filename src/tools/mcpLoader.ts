import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { BaseTool, type Tool } from "./base.js";
import type { ToolResult } from "./base.js";

export type ConnectionType = "stdio" | "sse" | "http" | "streamable_http";

export interface MCPTimeoutConfig {
  connectTimeout: number;
  executeTimeout: number;
  sseReadTimeout: number;
}

const defaultTimeoutConfig: MCPTimeoutConfig = {
  connectTimeout: 10,
  executeTimeout: 60,
  sseReadTimeout: 120
};

interface MCPServerConfig {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
  connect_timeout?: number;
  execute_timeout?: number;
  sse_read_timeout?: number;
}

interface MCPConfigFile {
  mcpServers?: Record<string, MCPServerConfig>;
}

interface MCPListToolsResponse {
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
}

interface MCPCallToolResponse {
  content?: Array<{ text?: string } | unknown>;
  isError?: boolean;
}

interface MCPClientAdapter {
  listTools: () => Promise<MCPListToolsResponse>;
  callTool: (params: { name: string; arguments?: Record<string, unknown> }, options?: { timeout?: number }) => Promise<MCPCallToolResponse>;
  close?: () => Promise<void>;
}

interface MCPTransportAdapter {
  close?: () => Promise<void>;
}

const connections: MCPServerConnection[] = [];

export function setMcpTimeoutConfig(config: Partial<MCPTimeoutConfig>): void {
  if (typeof config.connectTimeout === "number") {
    defaultTimeoutConfig.connectTimeout = config.connectTimeout;
  }
  if (typeof config.executeTimeout === "number") {
    defaultTimeoutConfig.executeTimeout = config.executeTimeout;
  }
  if (typeof config.sseReadTimeout === "number") {
    defaultTimeoutConfig.sseReadTimeout = config.sseReadTimeout;
  }
}

export function getMcpTimeoutConfig(): MCPTimeoutConfig {
  return { ...defaultTimeoutConfig };
}

export function determineConnectionType(serverConfig: MCPServerConfig): ConnectionType {
  const explicitType = (serverConfig.type ?? "").toLowerCase();
  if (explicitType === "stdio" || explicitType === "sse" || explicitType === "http" || explicitType === "streamable_http") {
    return explicitType;
  }
  if (serverConfig.url) {
    return "streamable_http";
  }
  return "stdio";
}

function resolveMcpConfigPath(configPath: string): string | null {
  const fullPath = resolve(configPath);
  if (existsSync(fullPath)) {
    return fullPath;
  }

  if (fullPath.endsWith("mcp.json")) {
    const fallback = fullPath.replace(/mcp\.json$/, "mcp-example.json");
    if (existsSync(fallback)) {
      console.log(`mcp.json not found, using template: ${fallback}`);
      return fallback;
    }
  }

  return null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

class MCPTool extends BaseTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;

  constructor(
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    private readonly client: MCPClientAdapter,
    private readonly executeTimeoutSeconds: number
  ) {
    super();
    this.name = name;
    this.description = description;
    this.parameters = parameters;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const result = await this.client.callTool(
        {
          name: this.name,
          arguments: args
        },
        { timeout: this.executeTimeoutSeconds * 1000 }
      );

      const contentParts: string[] = [];
      for (const item of result.content ?? []) {
        if (typeof item === "object" && item !== null && "text" in item && typeof (item as { text?: unknown }).text === "string") {
          contentParts.push((item as { text: string }).text);
        } else {
          contentParts.push(String(item));
        }
      }

      const content = contentParts.join("\n");
      const isError = Boolean(result.isError);
      return {
        success: !isError,
        content,
        error: isError ? "Tool returned error" : undefined
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `MCP tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

class MCPServerConnection {
  private client: MCPClientAdapter | null = null;
  private transport: MCPTransportAdapter | null = null;
  private readonly tools: MCPTool[] = [];

  constructor(private readonly name: string, private readonly config: MCPServerConfig) {}

  private get connectTimeout(): number {
    return this.config.connect_timeout ?? defaultTimeoutConfig.connectTimeout;
  }

  private get executeTimeout(): number {
    return this.config.execute_timeout ?? defaultTimeoutConfig.executeTimeout;
  }

  private get sseReadTimeout(): number {
    return this.config.sse_read_timeout ?? defaultTimeoutConfig.sseReadTimeout;
  }

  async connect(): Promise<boolean> {
    try {
      const type = determineConnectionType(this.config);
      const client = new Client({ name: "mini-agent-ts", version: "0.1.0" });
      const transport = this.createTransport(type);

      await withTimeout(
        client.connect(transport),
        this.connectTimeout * 1000,
        `Connection to MCP server '${this.name}' timed out after ${this.connectTimeout}s`
      );

      const listed = await withTimeout(
        client.listTools(),
        this.connectTimeout * 1000,
        `Listing MCP tools for '${this.name}' timed out after ${this.connectTimeout}s`
      );

      this.client = client as MCPClientAdapter;
      this.transport = transport as MCPTransportAdapter;

      for (const tool of listed.tools ?? []) {
        this.tools.push(
          new MCPTool(
            tool.name,
            tool.description ?? "",
            tool.inputSchema ?? {},
            client as MCPClientAdapter,
            this.executeTimeout
          )
        );
      }

      const info = this.config.url ?? this.config.command;
      console.log(`✓ Connected to MCP server '${this.name}' (${type}: ${info}) - loaded ${this.tools.length} tools`);
      for (const tool of this.tools) {
        const desc = tool.description.length > 60 ? `${tool.description.slice(0, 60)}...` : tool.description;
        console.log(`  - ${tool.name}: ${desc}`);
      }

      return true;
    } catch (error) {
      console.log(`✗ Failed to connect to MCP server '${this.name}': ${error instanceof Error ? error.message : String(error)}`);
      await this.disconnect();
      return false;
    }
  }

  getTools(): Tool[] {
    return [...this.tools];
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client?.close) {
        await this.client.close();
      }
    } catch {
      // best effort
    }

    try {
      if (this.transport?.close) {
        await this.transport.close();
      }
    } catch {
      // best effort
    }

    this.client = null;
    this.transport = null;
  }

  private createTransport(type: ConnectionType): Transport {
    if (type === "stdio") {
      if (!this.config.command) {
        throw new Error(`No command specified for STDIO server: ${this.name}`);
      }
      return new StdioClientTransport({
        command: this.config.command,
        args: this.config.args ?? [],
        env: this.config.env ?? {}
      });
    }

    if (!this.config.url) {
      throw new Error(`No url specified for ${type.toUpperCase()} server: ${this.name}`);
    }

    if (type === "sse") {
      return new SSEClientTransport(new URL(this.config.url), {
        requestInit: {
          headers: this.config.headers ?? {}
        }
      });
    }

    return new StreamableHTTPClientTransport(new URL(this.config.url), {
      requestInit: {
        headers: this.config.headers ?? {}
      },
      reconnectionOptions: {
        initialReconnectionDelay: 1000,
        maxReconnectionDelay: Math.max(this.sseReadTimeout * 1000, 1000),
        reconnectionDelayGrowFactor: 1.5,
        maxRetries: 2
      }
    });
  }
}

export async function loadMcpToolsAsync(configPath = "config/mcp.json"): Promise<Tool[]> {
  const resolvedPath = resolveMcpConfigPath(configPath);
  if (!resolvedPath) {
    console.log(`MCP config not found: ${configPath}`);
    return [];
  }

  try {
    const raw = await readFile(resolvedPath, "utf-8");
    const parsed = JSON.parse(raw) as MCPConfigFile;
    const servers = parsed.mcpServers ?? {};

    if (Object.keys(servers).length === 0) {
      console.log("No MCP servers configured");
      return [];
    }

    const tools: Tool[] = [];

    for (const [name, serverConfig] of Object.entries(servers)) {
      if (serverConfig.disabled) {
        console.log(`Skipping disabled server: ${name}`);
        continue;
      }

      const connection = new MCPServerConnection(name, serverConfig);
      const ok = await connection.connect();
      if (!ok) {
        continue;
      }

      connections.push(connection);
      tools.push(...connection.getTools());
    }

    console.log(`\nTotal MCP tools loaded: ${tools.length}`);
    return tools;
  } catch (error) {
    console.log(`Error loading MCP config: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export async function cleanupMcpConnections(): Promise<void> {
  for (const connection of connections) {
    await connection.disconnect();
  }
  connections.length = 0;
}
