# Mini-Agent-TS

`Mini-Agent` 的 TypeScript 复刻版（核心架构 + 教学示例）：
- Agent 执行循环
- `LLMClient` 包装（支持 `anthropic` / `openai` provider）
- 工具系统（文件读写编辑、Bash、Session Note）
- CLI 交互模式与单次任务模式
- 迁移自原项目的 `examples/01-06`
- 已迁移原版 `system_prompt.md`：`config/system_prompt.md`

## 安装（pnpm）

```bash
cd mini-agent-ts
pnpm install
```

## 编译

```bash
pnpm run build
```

## 运行

```bash
# 1) 创建并编辑 .env
cp .env.example .env
# 然后把 MINI_AGENT_API_KEY 改成你的真实 key

# 2) 运行

# 交互模式
pnpm run dev -- --workspace /path/to/workspace

# 单任务模式
pnpm run dev -- --workspace /path/to/workspace --task "read README and summarize"
```

配置读取规则：
- 程序会用 `dotenv` 从项目根目录 `.env` 读取配置
- 优先读取 `MINI_AGENT_*`，兼容 `api_key/api_base/model/provider`
- CLI 和示例默认读取 `config/system_prompt.md` 作为 system prompt
- MCP 可选开关：
  - `MINI_AGENT_ENABLE_MCP=true` 时加载 MCP 工具
  - `MINI_AGENT_MCP_CONFIG` 指定配置文件（默认 `config/mcp.json`）
- Skills 可选开关：
  - `MINI_AGENT_ENABLE_SKILLS=true` 时加载 `get_skill` 工具
  - `MINI_AGENT_SKILLS_DIR` 指定 skills 目录（默认 `./skills`）

交互命令：
- `/help`
- `/clear`
- `/history`
- `/stats`
- `/skills`
- `/log`
- `/log <filename>`
- `/exit`（同 `/quit`、`/q`，也支持输入 `exit/quit/q`）

## MCP Loader（本地复刻）

已复刻 Python 工程的 MCP loader 核心能力：
- 从 `mcp.json` 读取 `mcpServers`
- 连接类型：`stdio` / `sse` / `http` / `streamable_http`
- 自动类型推断（有 `url` 默认 `streamable_http`，否则 `stdio`）
- 每服务独立超时：`connect_timeout` / `execute_timeout` / `sse_read_timeout`
- `mcp.json` 缺失时回退 `mcp-example.json`
- 工具动态包装并注入 agent

建议配置方式：
```bash
cp config/mcp-example.json config/mcp.json
# 修改后在 .env 中启用
# MINI_AGENT_ENABLE_MCP=\"true\"
```

## Skills Tool（Progressive Disclosure）

已移植 `skill_loader` / `skill_tool` 核心能力：
- 递归发现 `SKILL.md`
- 解析 YAML frontmatter（`name` / `description` 等）
- 路径增强（scripts/references/assets、文档引用、markdown link）
- metadata 注入 `system_prompt` 的 `{SKILLS_METADATA}`
- 暴露 `get_skill` 工具按需加载完整技能内容

仓库内置了一个最小示例 skill：
- [`example-greeter/SKILL.md`](/Users/txr/workspace/mini-agent-ts/skills/example-greeter/SKILL.md)
- 启用方式：在 `.env` 设置 `MINI_AGENT_ENABLE_SKILLS=\"true\"`，并保持 `MINI_AGENT_SKILLS_DIR=\"./skills\"`

## 示例

```bash
pnpm run example:01
pnpm run example:02
pnpm run example:03
pnpm run example:04
pnpm run example:05
pnpm run example:06
```

详见：
- `examples/README.md`
- `examples/README_CN.md`
