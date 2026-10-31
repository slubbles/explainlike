import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JobRunner, createApiServer, nameFor, checkInput } from "../src/index.ts";

const cliPath = fileURLToPath(new URL("./fixtures/fake-cli.mjs", import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "explainlike-api-"));

test("output folders are named after what is being explained", () => {
  assert.equal(nameFor("https://github.com/milind-soni/OpenMausBot"), "milind-soni-openmausbot");
  assert.equal(nameFor("https://x.com/karpathy/status/1977755427569111362"), "x-karpathy-1977755427569111362");
  assert.equal(nameFor("https://blog.vllm.ai/2023/06/20/vllm.html"), "blog-vllm-ai-2023-06-20-vllm-html");
});

test("a link or a local folder is accepted, a bare topic is refused with a reason", () => {
  assert.equal(checkInput("github.com/owner/repo"), "https://github.com/owner/repo");
  assert.equal(checkInput(os.tmpdir()), path.resolve(os.tmpdir()));
  assert.throws(() => checkInput("how do vector databases work"), /plain topic/);
});

test("a job runs to the end and hands back the paths of the video and both boards", async () => {
  const runner = new JobRunner({ cliPath, outRoot: tmp() });
  const seen: string[] = [];
  runner.on("update", (j) => seen.push(j.stage));
  const job = runner.start({ input: "https://github.com/milind-soni/OpenMausBot", voice: "silent" });
  assert.equal(job.state, "running");
  const done = await runner.wait(job.id, 10_000);
  assert.equal(done?.state, "done");
  assert.equal(done?.title, "Demo");
  assert.equal(done?.approach, "analogy");
  assert.deepEqual(done?.usd, { meta: 0.01, voice: 0.02, total: 0.03 });
  for (const k of ["mp4", "tldr", "excalidraw"] as const) assert.ok(fs.existsSync(done!.outputs![k]!), k);
  assert.ok(seen.includes("render"));
  const args = JSON.parse(fs.readFileSync(path.join(done!.out, "args.json"), "utf8"));
  assert.ok(args.argv.includes("--json") && args.argv.includes("silent"));
  // the render runs in its own output folder, never in the caller's
  assert.equal(fs.realpathSync(args.cwd), fs.realpathSync(done!.out));
});

test("what the viewer asked for reaches the engine and gets its own folder", async () => {
  const root = tmp();
  const runner = new JobRunner({ cliPath, outRoot: root });
  const job = runner.start({ input: "https://github.com/milind-soni/OpenMausBot", goal: "how a chat message reaches the tools", depth: "overview" });
  assert.match(path.basename(job.out), /^milind-soni-openmausbot-ask-[0-9a-f]{8}$/);
  const done = await runner.wait(job.id, 10_000);
  const { argv } = JSON.parse(fs.readFileSync(path.join(done!.out, "args.json"), "utf8"));
  assert.equal(argv[argv.indexOf("--goal") + 1], "how a chat message reaches the tools");
  assert.equal(argv[argv.indexOf("--depth") + 1], "overview");
  assert.ok(!argv.includes("--audience"));
  assert.throws(() => runner.start({ input: "https://github.com/a/b", depth: "huge" as "deep" }), /depth/);
});

test("a failed render reports the reason, and only one render runs at a time", async () => {
  const runner = new JobRunner({ cliPath, outRoot: tmp(), env: { FAKE_DELAY_MS: "300" } });
  const a = runner.start({ input: "https://example.com/fail" });
  assert.throws(() => runner.start({ input: "https://example.com/other" }), /still rendering/);
  const end = await runner.wait(a.id, 10_000);
  assert.equal(end?.state, "error");
  assert.match(end!.error!, /could not read/);
});

test("the HTTP API creates a job, waits on it, and refuses other hosts and web pages", async () => {
  const api = createApiServer({ runner: new JobRunner({ cliPath, outRoot: tmp() }) });
  const port = await api.listen(0);
  const base = `http://127.0.0.1:${port}`;
  try {
    const bad = await fetch(`${base}/v1/jobs`, { method: "POST", body: JSON.stringify({ topic: "x" }) });
    assert.equal(bad.status, 400);
    const r = await fetch(`${base}/v1/jobs`, { method: "POST", body: JSON.stringify({ input: "https://github.com/owner/repo" }) });
    assert.equal(r.status, 202);
    const job = await r.json();
    const done = await (await fetch(`${base}/v1/jobs/${job.id}?wait=10`)).json();
    assert.equal(done.state, "done");
    assert.ok(fs.existsSync(done.outputs.mp4));
    assert.equal((await fetch(`${base}/v1/jobs`)).status, 200);
    const web = await fetch(`${base}/v1/jobs`, { method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify({ input: "https://github.com/a/b" }) });
    assert.equal(web.status, 403);
  } finally { await api.close(); }
});
