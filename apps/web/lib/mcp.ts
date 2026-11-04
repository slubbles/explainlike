/**
 * The MCP setup snippets shown on /docs, one per coding tool. Each format was checked against that tool's
 * official docs, and test/mcp.test.ts keeps the bodies honest: the JSON still parses, every block points at
 * the real server script, and the tool names match what the server registers.
 */

export interface McpSnippet {
  /** anchor and key */
  id: string;
  /** plain tool name, no logos anywhere */
  tool: string;
  /** where the config lives */
  file: string;
  /** label on the block: bash, json or toml */
  lang: string;
  /** one plain sentence under the heading */
  note: string;
  /** the exact text the copy button copies; placeholders only, never real keys */
  body: string;
}

const BIN = "/path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs";

export const MCP_SNIPPETS: McpSnippet[] = [
  {
    id: "claude-code",
    tool: "Claude Code",
    file: "Terminal",
    lang: "bash",
    note: "In a terminal, with the repo cloned. The keys go on the command line, with the server command after the --.",
    body: `claude mcp add explanimate --transport stdio \\
  --env MODEL_API_KEY=your-meta-key \\
  --env DEEPGRAM_API_KEY=your-deepgram-key \\
  -- node ${BIN}`,
  },
  {
    id: "claude-desktop",
    tool: "Claude Desktop",
    file: "claude_desktop_config.json",
    lang: "json",
    note: "Open it from Settings, Developer, Edit Config. Claude Desktop does not read your shell environment, so the keys go in the file; keep it private. Fully quit and reopen the app after saving.",
    body: `{
  "mcpServers": {
    "explanimate": {
      "command": "node",
      "args": ["${BIN}"],
      "env": { "MODEL_API_KEY": "your Meta key", "DEEPGRAM_API_KEY": "your Deepgram key" }
    }
  }
}`,
  },
  {
    id: "cursor",
    tool: "Cursor",
    file: "~/.cursor/mcp.json",
    lang: "json",
    note: "Use ~/.cursor/mcp.json for every project, or .cursor/mcp.json inside one project. Cursor fills ${env:NAME} from your environment, so the file names the secret without containing it.",
    body: `{
  "mcpServers": {
    "explanimate": {
      "command": "node",
      "args": ["${BIN}"],
      "env": { "MODEL_API_KEY": "\${env:MODEL_API_KEY}", "DEEPGRAM_API_KEY": "\${env:DEEPGRAM_API_KEY}" }
    }
  }
}`,
  },
  {
    id: "codex",
    tool: "Codex",
    file: "~/.codex/config.toml",
    lang: "toml",
    note: "Add one table to ~/.codex/config.toml, then restart Codex.",
    body: `[mcp_servers.explanimate]
command = "node"
args = ["${BIN}"]

[mcp_servers.explanimate.env]
MODEL_API_KEY = "your Meta key"
DEEPGRAM_API_KEY = "your Deepgram key"`,
  },
  {
    id: "vscode",
    tool: "VS Code Copilot",
    file: ".vscode/mcp.json",
    lang: "json",
    note: "In .vscode/mcp.json in your workspace. VS Code's own format uses the servers key, not mcpServers.",
    body: `{
  "servers": {
    "explanimate": {
      "type": "stdio",
      "command": "node",
      "args": ["${BIN}"],
      "env": { "MODEL_API_KEY": "your Meta key", "DEEPGRAM_API_KEY": "your Deepgram key" }
    }
  }
}`,
  },
  {
    id: "muse-code",
    tool: "Muse Code",
    file: "~/.config/muse/settings.json",
    lang: "json",
    note: "Merge with what is already in ~/.config/muse/settings.json.",
    body: `{
  "schema_version": 1,
  "mcp_servers": {
    "explanimate": {
      "transport": "stdio",
      "command": "node",
      "args": ["${BIN}"],
      "env": { "MODEL_API_KEY": "\${MODEL_API_KEY}", "DEEPGRAM_API_KEY": "\${DEEPGRAM_API_KEY}" },
      "mode": "optional"
    }
  }
}`,
  },
];
