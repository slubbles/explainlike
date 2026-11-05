import { test } from "node:test";
import assert from "node:assert/strict";
import { refundFailedSlot, setSlotRelease, type Job } from "../lib/jobs";

const calls: [string, number][] = [];
setSlotRelease(async (u, d) => void calls.push([u, d]));
const mk = (o: Partial<Job>) => ({ id: "abcdefabcdef", owner: "u:alice", started: 1000, state: "error", ...o }) as Job;

test("a failed job gives its slot back once, on the day it started", () => {
  calls.length = 0;
  const j = mk({});
  assert.equal(refundFailedSlot(j), true);
  assert.equal(refundFailedSlot(j), false);
  assert.deepEqual(calls, [["alice", 1000]]);
});
test("done, cancelled, resumed and signed-out jobs keep their slot", () => {
  calls.length = 0;
  for (const j of [
    mk({ state: "done" } as Partial<Job>),
    mk({ cancelled: true }),
    mk({ resumed: 1 }),
    mk({ owner: "b:anon" }),
    mk({ slotReleased: true }),
  ])
    assert.equal(refundFailedSlot(j), false);
  assert.equal(calls.length, 0);
});
