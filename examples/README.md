# Mini-Agent-TS Examples

This directory contains progressive TypeScript examples migrated from `Mini-Agent/examples`.

## Example List

1. `01_basic_tools.ts`
- Direct tool usage: `read_file`, `write_file`, `edit_file`, `bash`
- No LLM required

2. `02_simple_agent.ts`
- Minimal agent usage
- File task and bash task

3. `03_session_notes.ts`
- Direct note tools (`record_note`, `recall_notes`)
- Agent memory across sessions

4. `04_full_agent.ts`
- Full local stack: file tools + bash + note tools
- Optional MCP loader (`config/mcp.json`)
- Optional Skills from `./skills` (includes `example-greeter`)
- Multi-turn conversation flow

5. `05_provider_selection.ts`
- `LLMClient` provider selection (`anthropic` / `openai`)

6. `06_tool_schema_demo.ts`
- Custom tool definitions
- Tool schema conversion for both protocols

## Run

```bash
# install deps
pnpm install

# examples not requiring API key
pnpm run example:01

# examples requiring API key
cp .env.example .env
# edit .env and fill MINI_AGENT_API_KEY

pnpm run example:02
pnpm run example:03
# optional for MCP demo in example:04
cp config/mcp-example.json config/mcp.json
# set MINI_AGENT_ENABLE_MCP=true in .env if needed
pnpm run example:04
pnpm run example:05
pnpm run example:06
```
