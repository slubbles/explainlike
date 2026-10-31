import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { JobRunner } from "@explainlike/api";
import { createExplainLikeServer } from "../src/index.ts";

const cliPath = fileURLToPath(new URL("../../api/test/fixtures/fake-cli.mjs", import.meta.url));

async function connect(env: Record<string, string> = {}) {
  const runner = new JobRunner({ cliPath, outRoot: fs.mkdtempSync(path.join(os.tmpdir(), "explainlike-mcp-")), env });
  const { server } = createExplainLikeServer(runner);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, runner };
}
const text = (r: any) => r.content.map((c: any) => c.text).join("\n");

test("the server offers explain, explain_status, explain_cancel and the /explainlike prompt", async () => {
  const { client } = await connect();
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ["explain", "explain_cancel", "explain_status"]);
  const status = (await client.listTools()).tools.find((t) => t.name === "explain_status")!;
  assert.equal(status.annotations?.readOnlyHint, true);
  const p = await client.getPrompt({ name: "explainlike", arguments: { request: "explain what this repo is about https://github.com/a/b" } });
  assert.match((p.messages[0].content as any).text, /https:\/\/github\.com\/a\/b/);
});

test("explain returns the video and board paths, with progress along the way", async () => {
  const { client } = await connect();
  const progress: string[] = [];
  const r = await client.callTool({ name: "explain", arguments: { source: "https://github.com/milind-soni/OpenMausBot", voice: "silent" } }, undefined, { onprogress: (p) => progress.push(p.message ?? "") });
  assert.equal(r.isError, false);
  const job = JSON.parse((r.content as any)[1].text);
  assert.equal(job.state, "done");
  for (const k of ["mp4", "tldr", "excalidraw"]) assert.ok(fs.existsSync(job.outputs[k]), k);
  assert.match(text(r), /Video: .*demo\.mp4/);
  assert.ok(progress.includes("drawing frames 10/10"), progress.join(" | "));
});

test("a long job answers with its id first, and explain_status waits for the rest", async () => {
  const { client } = await connect({ FAKE_DELAY_MS: "400" });
  const r = await client.callTool({ name: "explain", arguments: { source: "https://github.com/a/b", waitSeconds: 0 } });
  const job = JSON.parse((r.content as any)[1].text);
  assert.equal(job.state, "running");
  assert.match(text(r), /explain_status/);
  const s = await client.callTool({ name: "explain_status", arguments: { jobId: job.id, waitSeconds: 10 } });
  assert.match(text(s), /^Done:/);
});

test("a specific question is handed to the engine as the viewer's goal", async () => {
  const { client } = await connect();
  const r = await client.callTool({ name: "explain", arguments: { source: "https://github.com/a/b", question: "how auth works", depth: "deep" } });
  const job = JSON.parse((r.content as any)[1].text);
  const { argv } = JSON.parse(fs.readFileSync(path.join(job.out, "args.json"), "utf8"));
  assert.equal(argv[argv.indexOf("--goal") + 1], "how auth works");
  assert.equal(argv[argv.indexOf("--depth") + 1], "deep");
});

test("a bare topic and a failed render come back as tool errors, not crashes", async () => {
  const { client } = await connect();
  const t = await client.callTool({ name: "explain", arguments: { source: "how do vector databases work" } });
  assert.equal(t.isError, true);
  assert.match(text(t), /plain topic/);
  const f = await client.callTool({ name: "explain", arguments: { source: "https://example.com/fail" } });
  assert.equal(f.isError, true);
  assert.match(text(f), /could not read the repository/);
});
