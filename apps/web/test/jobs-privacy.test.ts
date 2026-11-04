import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// the jobs here are rendered by the fake CLI: nothing paid runs
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-privacy-"));
Object.assign(process.env, {
  EXPLANIMATE_JOBS_DIR: dir,
  EXPLANIMATE_RESUME: "0",
  EXPLANIMATE_ROOT: path.resolve(import.meta.dirname, "../../.."),
  EXPLANIMATE_CLI: path.join(import.meta.dirname, "fake-cli.mjs"),
  EXPLANIMATE_JOBS_PER_HOUR: "1000",
});
delete process.env.EXPLANIMATE_AUTH_ENABLED;
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const list = () => import("../app/api/jobs/route.ts");
const one = () => import("../app/api/jobs/[id]/route.ts");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (input: string, cookie?: string) =>
  new Request("https://explanimate.co/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ input, voice: "silent" }),
  });
const get = (url: string, cookie?: string) => new Request(url, { headers: cookie ? { cookie } : {} });

test("a stranger's jobs list is empty, the owner sees only their own, and nothing is cached", async () => {
  const { GET, POST } = await list();
  const a = await POST(post("how a zipper works"));
  assert.equal(a.status, 200);
  const setCookie = a.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /^ex_owner=[a-f0-9]{32}; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax; Secure$/);
  const alice = setCookie.split(";")[0];
  const aliceId = (await a.json()).id;
  const b = await POST(post("how DNS works"));
  const bob = (b.headers.get("set-cookie") ?? "").split(";")[0];
  assert.notEqual(alice, bob, "each browser gets its own owner cookie");

  const stranger = await GET(get("https://explanimate.co/api/jobs"));
  assert.deepEqual(await stranger.json(), []);
  assert.equal(stranger.headers.get("cache-control"), "no-store");

  const mine = await (await GET(get("https://explanimate.co/api/jobs", alice))).json();
  assert.deepEqual(
    mine.map((j: { id: string }) => j.id),
    [aliceId],
  );
  assert.equal(mine[0].input, "how a zipper works");

  // a forged cookie value matches nobody
  assert.deepEqual(await (await GET(get("https://explanimate.co/api/jobs", `ex_owner=${"0".repeat(32)}`))).json(), []);
  assert.deepEqual(await (await GET(get("https://explanimate.co/api/jobs", "ex_owner=not-a-token"))).json(), []);
});

test("one job by id never carries CLI arguments, server paths or the owner key", async () => {
  const { POST } = await list();
  const { GET } = await one();
  const r = await POST(post("how a lock works"));
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  const { id } = await r.json();
  const asOwner = await GET(get(`https://explanimate.co/api/jobs/${id}`, cookie), ctx(id));
  const body = await asOwner.json();
  const text = JSON.stringify(body);
  for (const k of ["args", "owner", "resumed", "began", "finished"]) assert.ok(!(k in body), `${k} is not sent`);
  assert.doesNotMatch(text, /--out|\/tmp|el-privacy|"a:/);
  assert.equal(body.mine, true);
  assert.equal(asOwner.headers.get("cache-control"), "no-store");
  const asStranger = await (await GET(get(`https://explanimate.co/api/jobs/${id}`), ctx(id))).json();
  assert.equal(asStranger.mine, false);
  assert.equal(asStranger.id, id, "the share link still opens the video");
});

test("?parent lists only that video's follow-up clips, with no input or cost", async () => {
  const { listFor } = await import("../lib/view.ts");
  const base = { voice: "silent", stage: "start", message: "", pct: 0, started: 1, costUsd: 0.1, input: "https://github.com/a/b" };
  const all = [
    { ...base, id: "aaaaaaaaaaaa", kind: "video" as const, state: "done" as const, owner: "a:x" },
    { ...base, id: "bbbbbbbbbbbb", kind: "what-if" as const, state: "done" as const, parent: "aaaaaaaaaaaa", whatIf: "10x", owner: "a:y" },
    { ...base, id: "cccccccccccc", kind: "video" as const, state: "done" as const, owner: "a:y" },
  ];
  const clips = listFor(all, undefined, "aaaaaaaaaaaa");
  assert.deepEqual(
    clips.map((c) => c.id),
    ["bbbbbbbbbbbb"],
  );
  assert.ok(!("input" in clips[0]) && !("costUsd" in clips[0]) && !("owner" in clips[0]));
  assert.deepEqual(listFor(all, undefined, "../etc"), []);
  assert.deepEqual(listFor(all, undefined, null), []);
  assert.deepEqual(
    listFor(all, "a:y", null).map((c) => c.id),
    ["bbbbbbbbbbbb", "cccccccccccc"],
  );
});
