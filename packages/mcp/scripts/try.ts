// Try the MCP server the way an agent would, without one: starts it over stdio, calls explain, prints progress.
//   pnpm --filter explanimate-mcp try https://github.com/owner/repo [out dir]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const [source, outDir] = process.argv.slice(2);
if (!source) {
  console.error("usage: try <repo url | x.com post | article url | local folder> [out dir]");
  process.exit(1);
}
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("../bin/explanimate-mcp.mjs", import.meta.url))],
  env: process.env as Record<string, string>,
  stderr: "inherit",
});
const client = new Client({ name: "explanimate-try", version: "0.1.0" });
await client.connect(transport);
console.log("tools:", (await client.listTools()).tools.map((t) => t.name).join(", "));
console.log("prompts:", (await client.listPrompts()).prompts.map((p) => "/" + p.name).join(", "));
const onprogress = (p: { progress: number; message?: string }) =>
  console.log(`  ${p.progress.toFixed(0).padStart(3)}%  ${p.message ?? ""}`);
const opts = { onprogress, resetTimeoutOnProgress: true, timeout: 120_000 };
let r: any = await client.callTool({ name: "explain", arguments: { source, ...(outDir ? { outDir } : {}) } }, undefined, opts);
let job = JSON.parse(r.content[1]?.text ?? "{}");
while (job.state === "running") {
  r = await client.callTool({ name: "explain_status", arguments: { jobId: job.id } }, undefined, opts);
  job = JSON.parse(r.content[1].text);
}
console.log("\n" + r.content[0].text);
await client.close();
process.exit(r.isError ? 1 : 0);
