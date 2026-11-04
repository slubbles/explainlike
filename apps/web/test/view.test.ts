import { test } from "node:test";
import assert from "node:assert/strict";
import { publicJob, scrubError } from "../lib/view.ts";
import type { Job } from "../lib/jobs.ts";

const job = (error: string) =>
  ({
    id: "abcdef123456",
    kind: "video",
    input: "x",
    voice: "silent",
    state: "error",
    stage: "render",
    message: "",
    pct: 0,
    started: 1,
    error,
    args: ["secret"],
    owner: "me",
  }) as unknown as Job;

test("absolute server paths in an error never reach the browser", () => {
  assert.equal(scrubError("ENOENT: no such file /tmp/explanimate/x.json"), "ENOENT: no such file (a server path)");
  assert.equal(scrubError("at foo (C:\\srv\\x\\y.mjs:1:2)"), "at foo ((a server path):1:2)");
  assert.equal(scrubError("could not read the repository"), "could not read the repository");
  const seen = publicJob(job("boom /var/data/x"), "me") as { error: string; mine: boolean; args?: unknown };
  assert.equal(seen.error, "boom (a server path)");
  assert.equal(seen.mine, true);
  assert.equal(seen.args, undefined);
});
