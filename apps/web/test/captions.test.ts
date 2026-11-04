import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-captions-"));
Object.assign(process.env, { EXPLANIMATE_JOBS_DIR: dir, EXPLANIMATE_RESUME: "0" });
delete process.env.EXPLANIMATE_AUTH_ENABLED;

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const id = "abcdef123456";
fs.mkdirSync(path.join(dir, id));
fs.writeFileSync(
  path.join(dir, id, "film.json"),
  JSON.stringify({
    captions: [
      {
        t0: 0.5,
        t1: 2.25,
        words: [
          { w: "Hello", s: 0.5, e: 1 },
          { w: "there", s: 1, e: 2 },
        ],
      },
      {
        t0: 2.5,
        t1: 4,
        words: [
          { w: "Second", s: 2.5, e: 3 },
          { w: "line", s: 3, e: 4 },
        ],
        hidden: true,
      },
      { t0: 5, t1: 4, words: [{ w: "bad times" }] },
      { t0: 6, t1: 7, words: [] },
      { t0: 8, t1: 9.5, words: [{ w: "a-->b" }] },
    ],
  }),
);

test("captions become WebVTT; bad cues are skipped and --> is escaped", async () => {
  const { captionsVtt } = await import("../lib/captions.ts");
  assert.equal(
    captionsVtt(id, dir),
    "WEBVTT\n\n00:00:00.500 --> 00:00:02.250\nHello there\n\n00:00:02.500 --> 00:00:04.000\nSecond line\n\n00:00:08.000 --> 00:00:09.500\na—b\n",
  );
});

test("a bad id, a missing film or an unreadable one means no captions", async () => {
  const { captionsVtt } = await import("../lib/captions.ts");
  assert.equal(captionsVtt("../nope", dir), undefined);
  assert.equal(captionsVtt("bbbbbbbbbbbb", dir), undefined);
  fs.mkdirSync(path.join(dir, "cccccccccccc"));
  fs.writeFileSync(path.join(dir, "cccccccccccc", "film.json"), "{broken");
  assert.equal(captionsVtt("cccccccccccc", dir), undefined);
});

test("the captions route serves text/vtt, or 404 while the video renders", async () => {
  const { GET } = await import("../app/api/jobs/[id]/captions/route.ts");
  const ok = await GET(new Request(`http://x/api/jobs/${id}/captions`), { params: Promise.resolve({ id }) });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "text/vtt");
  assert.match(await ok.text(), /^WEBVTT/);
  const missing = await GET(new Request("http://x/api/jobs/bbbbbbbbbbbb/captions"), {
    params: Promise.resolve({ id: "bbbbbbbbbbbb" }),
  });
  assert.equal(missing.status, 404);
});
