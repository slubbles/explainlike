import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_SNIPPETS } from "../lib/mcp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const BIN = "packages/mcp/bin/explanimate-mcp.mjs";

test("every JSON snippet parses and starts node with the MCP server script", () => {
  const json = MCP_SNIPPETS.filter((s) => s.lang === "json");
  assert.ok(json.length >= 4, "the docs cover at least four JSON-configured tools");
  for (const s of json) {
    const cfg = JSON.parse(s.body) as Record<string, Record<string, any>>;
    const servers = cfg.mcpServers ?? cfg.servers ?? cfg.mcp_servers;
    assert.ok(servers?.explanimate, `${s.id}: no explanimate server entry`);
    const e = servers.explanimate;
    assert.equal(e.command, "node", `${s.id}: command`);
    assert.ok(String(e.args?.[0]).endsWith(BIN), `${s.id}: args point at ${BIN}`);
    for (const k of ["MODEL_API_KEY", "DEEPGRAM_API_KEY"]) {
      const v = String(e.env?.[k] ?? "");
      assert.ok(v && (v.includes("your") || v.includes("${")), `${s.id}: ${k} is a placeholder, never a real key`);
    }
  }
});

test("the TOML snippet uses the Codex mcp_servers table", () => {
  const s = MCP_SNIPPETS.find((x) => x.lang === "toml");
  assert.ok(s, "the docs have a TOML snippet for Codex");
  for (const line of [
    "[mcp_servers.explanimate]",
    'command = "node"',
    `args = ["${"/path/to/explanimate/" + BIN}"]`,
    "[mcp_servers.explanimate.env]",
    "MODEL_API_KEY",
    "DEEPGRAM_API_KEY",
  ])
    assert.ok(s.body.includes(line), `TOML snippet has ${line}`);
});

test("the shell snippet adds the server with claude mcp add", () => {
  const s = MCP_SNIPPETS.find((x) => x.lang === "bash");
  assert.ok(s, "the docs have a shell snippet for Claude Code");
  for (const part of [
    "claude mcp add explanimate",
    "--transport stdio",
    "--env MODEL_API_KEY=",
    "--env DEEPGRAM_API_KEY=",
    `-- node ${"/path/to/explanimate/" + BIN}`,
  ])
    assert.ok(s.body.includes(part), `shell snippet has ${part}`);
});

test("the documented server script exists and registers the documented tools", () => {
  assert.ok(fs.existsSync(path.join(root, BIN)), `${BIN} exists`);
  const server = fs.readFileSync(path.join(root, "packages/mcp/src/server.ts"), "utf8").replace(/\r\n/g, "\n");
  for (const tool of [`registerTool(\n    "explain",`, `registerTool(\n    "explain_status",`, `registerTool(\n    "explain_cancel",`])
    assert.ok(server.includes(tool), `server registers ${tool}`);
  assert.ok(server.includes('registerPrompt(\n    "explanimate",'), "server registers the /explanimate prompt");
  const page = fs.readFileSync(path.join(root, "apps/web/app/docs/page.tsx"), "utf8");
  for (const tool of ["explain_status", "explain_cancel"]) assert.ok(page.includes(tool), `/docs names ${tool}`);
});
