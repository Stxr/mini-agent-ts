# Mini-Agent-TS 示例

本目录是从 `Mini-Agent/examples` 迁移过来的 TypeScript 教学示例。

## 示例列表

1. `01_basic_tools.ts`
- 直接调用工具：`read_file`、`write_file`、`edit_file`、`bash`
- 不依赖 LLM

2. `02_simple_agent.ts`
- 最小化 Agent 使用
- 文件任务与 bash 任务

3. `03_session_notes.ts`
- 直接使用笔记工具（`record_note`、`recall_notes`）
- 演示跨会话记忆

4. `04_full_agent.ts`
- 完整本地工具栈：文件工具 + bash + note 工具
- 可选 MCP Loader（`config/mcp.json`）
- 可选 Skills（`./skills`，默认带 `example-greeter` 示例）
- 多轮对话流程

5. `05_provider_selection.ts`
- 演示 `LLMClient` provider 切换（`anthropic` / `openai`）

6. `06_tool_schema_demo.ts`
- 自定义工具定义
- 工具 schema 在两种协议下的转换

## 运行方式

```bash
# 安装依赖
pnpm install

# 不需要 API Key
pnpm run example:01

# 需要 API Key
cp .env.example .env
# 编辑 .env，填入 MINI_AGENT_API_KEY

pnpm run example:02
pnpm run example:03
# 若要演示 MCP（example:04）
cp config/mcp-example.json config/mcp.json
# 并在 .env 中设置 MINI_AGENT_ENABLE_MCP=true
pnpm run example:04
pnpm run example:05
pnpm run example:06
```
