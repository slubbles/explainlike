import { test } from "node:test";
import assert from "node:assert/strict";
import { runExplanimate } from "../src/pipeline.ts";

test("a vague input on its own is refused with a friendly message, before any work starts", async () => {
  await assert.rejects(runExplanimate({ input: "?" }), /Tell me what to explain/);
  await assert.rejects(runExplanimate({ input: "explain" }), /not enough to go on/);
});
