import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanupMcpConnections,
  determineConnectionType,
  getMcpTimeoutConfig,
  loadMcpToolsAsync,
  setMcpTimeoutConfig
} from "../src/tools/mcpLoader.js";

describe("mcp loader", () => {
  it("determines connection type correctly", () => {
    expect(determineConnectionType({ command: "npx", args: ["-y", "x"] })).toBe("stdio");
    expect(determineConnectionType({ command: "npx", type: "stdio" })).toBe("stdio");
    expect(determineConnectionType({ url: "https://mcp.example.com/mcp" })).toBe("streamable_http");
    expect(determineConnectionType({ url: "https://mcp.example.com/sse", type: "sse" })).toBe("sse");
    expect(determineConnectionType({ url: "https://mcp.example.com/http", type: "http" })).toBe("http");
    expect(determineConnectionType({ url: "https://mcp.example.com/mcp", type: "streamable_http" })).toBe("streamable_http");
    expect(determineConnectionType({ url: "https://mcp.example.com/sse", type: "SSE" })).toBe("sse");
    expect(determineConnectionType({})).toBe("stdio");
  });

  it("sets and gets timeout config", () => {
    const original = getMcpTimeoutConfig();
    setMcpTimeoutConfig({ connectTimeout: 20, executeTimeout: 120, sseReadTimeout: 180 });
    const updated = getMcpTimeoutConfig();

    expect(updated.connectTimeout).toBe(20);
    expect(updated.executeTimeout).toBe(120);
    expect(updated.sseReadTimeout).toBe(180);

    setMcpTimeoutConfig(original);
  });

  it("returns empty tools for invalid url/stdio config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ma-ts-mcp-"));

    const badSse = join(dir, "bad-sse.json");
    await writeFile(
      badSse,
      JSON.stringify({ mcpServers: { "broken-sse": { type: "sse" } } }),
      "utf-8"
    );

    const tools1 = await loadMcpToolsAsync(badSse);
    expect(tools1).toEqual([]);

    const badStdio = join(dir, "bad-stdio.json");
    await writeFile(
      badStdio,
      JSON.stringify({ mcpServers: { "broken-stdio": { type: "stdio" } } }),
      "utf-8"
    );

    const tools2 = await loadMcpToolsAsync(badStdio);
    expect(tools2).toEqual([]);

    await cleanupMcpConnections();
    await rm(dir, { recursive: true, force: true });
  });

  it("handles disabled servers gracefully", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ma-ts-mcp-"));
    const cfg = join(dir, "mixed.json");

    await writeFile(
      cfg,
      JSON.stringify({
        mcpServers: {
          "stdio-server": { command: "npx", args: ["-y", "nonexistent-server"], disabled: true },
          "url-server": { url: "https://mcp.nonexistent.example.com/mcp", disabled: true }
        }
      }),
      "utf-8"
    );

    const tools = await loadMcpToolsAsync(cfg);
    expect(tools).toEqual([]);

    await cleanupMcpConnections();
    await rm(dir, { recursive: true, force: true });
  });
});
