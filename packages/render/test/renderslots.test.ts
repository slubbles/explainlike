import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireRenderSlot, ffmpegThreads, renderSlotsDir, threadArgs } from "../src/renderslots.ts";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "explanimate-slots-"));

test("the slots folder defaults to the temp dir and honours its setting", () => {
  assert.equal(renderSlotsDir({}), path.join(os.tmpdir(), "explanimate-render-slots"));
  assert.equal(renderSlotsDir({ EXPLANIMATE_RENDER_SLOTS_DIR: "/tmp/x" }), "/tmp/x");
});

test("ffmpeg threads split the cores across the render slots", () => {
  assert.deepEqual(threadArgs({}, { cpus: 4 }), ["-threads", "2"]);
  assert.equal(ffmpegThreads({ RENDER_CONCURRENCY: "1" }, { cpus: 4 }), 4);
});

test("only so many renders hold a slot; the rest wait silently, then take it in turn", async () => {
  const dir = tmp();
  try {
    const env = { RENDER_CONCURRENCY: "2" };
    const a = await acquireRenderSlot({ env, dir, pollMs: 10 });
    const b = await acquireRenderSlot({ env, dir, pollMs: 10 });
    assert.notEqual(a.slot, b.slot);
    assert.ok(a.waitMs < 1000 && b.waitMs < 1000, "free slots do not wait");
    let c: Awaited<ReturnType<typeof acquireRenderSlot>> | undefined;
    const waiting = acquireRenderSlot({ env, dir, pollMs: 10 }).then((s) => (c = s));
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(c, undefined, "no slot free yet");
    a.release();
    await waiting;
    assert.ok(c!.waitMs >= 50, `waited ${c!.waitMs}ms`);
    b.release();
    c!.release();
    assert.deepEqual(fs.readdirSync(dir), [], "releases clean up");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a lock from a dead process or an old run does not block the slot", async () => {
  const dir = tmp();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "slot-0.lock"), JSON.stringify({ pid: 987654321, at: Date.now() }));
    const s = await acquireRenderSlot({ env: {}, dir, slots: 1, pollMs: 10 });
    assert.equal(s.slot, 0);
    s.release();
    fs.writeFileSync(path.join(dir, "slot-0.lock"), JSON.stringify({ pid: process.pid, at: Date.now() - 31 * 60_000 }));
    const t = await acquireRenderSlot({ env: {}, dir, slots: 1, pollMs: 10 });
    assert.equal(t.slot, 0);
    t.release();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("releasing twice is safe", async () => {
  const dir = tmp();
  try {
    const s = await acquireRenderSlot({ env: {}, dir, slots: 1, pollMs: 10 });
    s.release();
    s.release();
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
