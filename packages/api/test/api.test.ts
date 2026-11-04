import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JobRunner, createApiServer, nameFor, checkInput } from "../src/index.ts";

const cliPath = fileURLToPath(new URL("./fixtures/fake-cli.mjs", import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-api-"));

test("output folders are named after what is being explained", () => {
  assert.equal(nameFor("https://github.com/milind-soni/OpenMausBot"), "milind-soni-openmausbot");
  assert.equal(nameFor("https://x.com/karpathy/status/1977755427569111362"), "x-karpathy-1977755427569111362");
  assert.equal(nameFor("https://blog.vllm.ai/2023/06/20/vllm.html"), "blog-vllm-ai-2023-06-20-vllm-html");
});

test("a link, a local folder or a topic in words is accepted; a missing folder is refused with a reason", () => {
  assert.equal(checkInput("github.com/owner/repo"), "https://github.com/owner/repo");
  assert.equal(checkInput("blog.vllm.ai/2023/06/20/vllm.html"), "https://blog.vllm.ai/2023/06/20/vllm.html");
  assert.equal(checkInput(os.tmpdir()), path.resolve(os.tmpdir()));
  assert.equal(checkInput("  how do vector   databases work "), "how do vector databases work");
  assert.equal(nameFor("how DNS works"), "how-dns-works");
  assert.throws(() => checkInput("./no-such-folder-here"), /no folder/);
  assert.throws(() => checkInput("x".repeat(301) + " y"), /too long/);
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
  const job = runner.start({
    input: "https://github.com/milind-soni/OpenMausBot",
    goal: "how a chat message reaches the tools",
    depth: "overview",
  });
  assert.match(path.basename(job.out), /^milind-soni-openmausbot-ask-[0-9a-f]{8}$/);
  const done = await runner.wait(job.id, 10_000);
  const { argv } = JSON.parse(fs.readFileSync(path.join(done!.out, "args.json"), "utf8"));
  assert.equal(argv[argv.indexOf("--goal") + 1], "how a chat message reaches the tools");
  assert.equal(argv[argv.indexOf("--depth") + 1], "overview");
  assert.ok(!argv.includes("--audience"));
  assert.throws(() => runner.start({ input: "https://github.com/a/b", depth: "huge" as "deep" }), /depth/);
  assert.throws(
    () => runner.start({ input: "https://github.com/a/b", voice: "nope" as "silent" }),
    /voice is deepgram, cartesia or silent/,
  );
});

test("the job name and look reach the render, and a bad look is refused", async () => {
  const runner = new JobRunner({ cliPath, outRoot: tmp() });
  const done = await runner.wait(runner.start({ input: "https://github.com/owner/repo", name: "owner/repo", look: "dark" }).id, 10_000);
  assert.equal(done?.state, "done");
  const { argv } = JSON.parse(fs.readFileSync(path.join(done!.out, "args.json"), "utf8"));
  assert.equal(argv[argv.indexOf("--name") + 1], "owner/repo");
  assert.equal(argv[argv.indexOf("--look") + 1], "dark");
  assert.throws(() => runner.start({ input: "https://github.com/a/b", look: "neon" as "dark" }), /look is dark or default/);
});

test("cartesia is an accepted voice and reaches the render", async () => {
  const runner = new JobRunner({ cliPath, outRoot: tmp() });
  const done = await runner.wait(runner.start({ input: "https://github.com/owner/repo", voice: "cartesia" }).id, 10_000);
  assert.equal(done?.state, "done");
  const { argv } = JSON.parse(fs.readFileSync(path.join(done!.out, "args.json"), "utf8"));
  assert.equal(argv[argv.indexOf("--voice") + 1], "cartesia");
});

test("a failed render reports the reason, and only one render runs at a time", async () => {
  const runner = new JobRunner({ cliPath, outRoot: tmp(), env: { FAKE_DELAY_MS: "300" } });
  const a = runner.start({ input: "https://example.com/fail" });
  assert.throws(() => runner.start({ input: "https://example.com/other" }), /still rendering/);
  const end = await runner.wait(a.id, 10_000);
  assert.equal(end?.state, "error");
  assert.match(end!.error!, /could not read/);
});

test("links to localhost and private networks are refused unless local use allows them", () => {
  for (const u of [
    "http://127.0.0.1:8080/x",
    "http://localhost:3000/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
  ]) {
    assert.throws(() => checkInput(u), /private network/, u);
  }
  assert.equal(checkInput("https://github.com/owner/repo"), "https://github.com/owner/repo");
  // explicit local-dev opt-out, without touching the process environment
  assert.equal(checkInput("http://127.0.0.1:8080/x", { EXPLANIMATE_ALLOW_PRIVATE_URLS: "1" }), "http://127.0.0.1:8080/x");
});

test("a bare private address is refused too, and a missing Windows folder is not a topic", () => {
  for (const u of ["127.0.0.1/x", "10.0.0.5/", "192.168.1.1"]) {
    assert.throws(() => checkInput(u), /private network/, u);
  }
  assert.equal(checkInput("127.0.0.1/x", { EXPLANIMATE_ALLOW_PRIVATE_URLS: "1" }), "https://127.0.0.1/x");
  assert.throws(() => checkInput("C:\\no-such-dir-xyz"), /no folder/);
  assert.throws(() => checkInput("foo\\no-such-dir-xyz"), /no folder/);
  assert.equal(checkInput("github.com/owner/repo"), "https://github.com/owner/repo");
});

test("a crashed render reports its first stderr line, never a stack frame with a path", async () => {
  const runner = new JobRunner({ cliPath, outRoot: tmp() });
  const end = await runner.wait(runner.start({ input: "https://example.com/crash" }).id, 10_000);
  assert.equal(end?.state, "error");
  assert.equal(end?.error, "explanimate failed: could not read the repository");
});

test("health answers without the server paths, and a 500 stays generic", async () => {
  const api = createApiServer({ runner: new JobRunner({ cliPath, outRoot: tmp() }) });
  const port = await api.listen(0);
  try {
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.deepEqual(health, { ok: true });
    const bad = createApiServer({
      runner: {
        start() {
          throw new Error("boom /secret/server/path");
        },
        close() {},
      } as unknown as JobRunner,
    });
    const port2 = await bad.listen(0);
    try {
      const r = await fetch(`http://127.0.0.1:${port2}/v1/jobs`, { method: "POST", body: JSON.stringify({ input: "x" }) });
      assert.equal(r.status, 500);
      const body = await r.json();
      assert.equal(body.error, "The server had a problem. Try again in a moment.");
    } finally {
      await bad.close();
    }
  } finally {
    await api.close();
  }
});

test("a job for a private link is refused before anything renders", () => {
  const had = process.env.EXPLANIMATE_ALLOW_PRIVATE_URLS;
  delete process.env.EXPLANIMATE_ALLOW_PRIVATE_URLS;
  try {
    const runner = new JobRunner({ cliPath, outRoot: tmp() });
    assert.throws(() => runner.start({ input: "http://127.0.0.1:8080/x" }), /private network/);
  } finally {
    if (had !== undefined) process.env.EXPLANIMATE_ALLOW_PRIVATE_URLS = had;
  }
});

test("the opt-out lets a local render start, and renders see the guard is off", async () => {
  const runner = new JobRunner({ cliPath, outRoot: tmp(), env: { EXPLANIMATE_ALLOW_PRIVATE_URLS: "1" } });
  const job = runner.start({ input: "http://127.0.0.1:8080/x" });
  const done = await runner.wait(job.id, 10_000);
  assert.equal(done?.state, "done");
  const { allowPrivate } = JSON.parse(fs.readFileSync(path.join(done!.out, "args.json"), "utf8"));
  assert.equal(allowPrivate, "1");
});

test("renders spawned by default see the guard is on", async () => {
  const had = process.env.EXPLANIMATE_ALLOW_PRIVATE_URLS;
  delete process.env.EXPLANIMATE_ALLOW_PRIVATE_URLS;
  try {
    const runner = new JobRunner({ cliPath, outRoot: tmp() });
    const done = await runner.wait(runner.start({ input: "https://github.com/owner/repo" }).id, 10_000);
    const { allowPrivate } = JSON.parse(fs.readFileSync(path.join(done!.out, "args.json"), "utf8"));
    assert.equal(allowPrivate, "0");
  } finally {
    if (had !== undefined) process.env.EXPLANIMATE_ALLOW_PRIVATE_URLS = had;
  }
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
    const web = await fetch(`${base}/v1/jobs`, {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: JSON.stringify({ input: "https://github.com/a/b" }),
    });
    assert.equal(web.status, 403);
  } finally {
    await api.close();
  }
});
