# /explanimate in your coding agent

`packages/mcp` is an MCP server that runs Explanimate on your own machine. Add it to your agent, then ask. Full setup with copy-paste configs for every tool: https://explanimate.co/docs

```
/explanimate explain what this repo is about https://github.com/milind-soni/OpenMausBot
```

It renders locally and answers with the paths to the mp4 and both boards. Say "this repo" without a link and it explains the folder you're in. Files go to `~/explanimate-videos/<name>`. A render takes a few minutes, so the agent checks back with `explain_status` while it works.

Replace `/path/to/explanimate` below with where you cloned this repo.

**Muse Code**, in `~/.config/muse/settings.json` (merge with what's there):

```json
{
  "schema_version": 1,
  "mcp_servers": {
    "explanimate": {
      "transport": "stdio",
      "command": "node",
      "args": ["/path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs"],
      "env": { "MODEL_API_KEY": "${MODEL_API_KEY}", "DEEPGRAM_API_KEY": "${DEEPGRAM_API_KEY}" },
      "mode": "optional"
    }
  }
}
```

**Claude Desktop**, in `claude_desktop_config.json` (Settings, Developer, Edit Config). It doesn't read your shell environment, so the keys go in the file. Keep it private.

```json
{
  "mcpServers": {
    "explanimate": {
      "command": "node",
      "args": ["/path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs"],
      "env": { "MODEL_API_KEY": "your Meta key", "DEEPGRAM_API_KEY": "your Deepgram key" }
    }
  }
}
```

**Cursor**, in `~/.cursor/mcp.json` or `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "explanimate": {
      "command": "node",
      "args": ["/path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs"],
      "env": { "MODEL_API_KEY": "${env:MODEL_API_KEY}", "DEEPGRAM_API_KEY": "${env:DEEPGRAM_API_KEY}" }
    }
  }
}
```

**Claude Code**, in a terminal:

```bash
claude mcp add explanimate --transport stdio \
  --env MODEL_API_KEY=your-meta-key \
  --env DEEPGRAM_API_KEY=your-deepgram-key \
  -- node /path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs
```

**Codex**, in `~/.codex/config.toml` (then restart Codex):

```toml
[mcp_servers.explanimate]
command = "node"
args = ["/path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs"]

[mcp_servers.explanimate.env]
MODEL_API_KEY = "your Meta key"
DEEPGRAM_API_KEY = "your Deepgram key"
```

**VS Code**, in `.vscode/mcp.json` in your workspace (its format uses the `servers` key):

```json
{
  "servers": {
    "explanimate": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs"],
      "env": { "MODEL_API_KEY": "your Meta key", "DEEPGRAM_API_KEY": "your Deepgram key" }
    }
  }
}
```

Want to call it from your own code instead? `packages/api` runs the same jobs over a localhost HTTP API (`node packages/api/bin/explanimate-api.mjs`).
