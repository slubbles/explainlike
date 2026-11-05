import { test } from "node:test";
import assert from "node:assert/strict";
import { GIBBERISH_ERROR, REPO_404_ERROR, githubRepo, looksLikeGibberish, precheckInput } from "../lib/precheck.ts";
import { shownVideos, type UserVideo } from "../lib/videos.ts";

test("keyboard mashing is gibberish, real topics are not", () => {
  for (const s of ["asdfghjkl", "xqzv bnmw prtk", "qwrtpsdfg"]) assert.equal(looksLikeGibberish(s), true, s);
  for (const s of ["how DNS works", "strengths of TCP", "why is the sky blue", "https://github.com/a/b", "CRDTs"])
    assert.equal(looksLikeGibberish(s), false, s);
});

test("githubRepo reads owner and repo from a link", () => {
  assert.deepEqual(githubRepo("https://github.com/karpathy/micrograd"), { owner: "karpathy", repo: "micrograd" });
  assert.deepEqual(githubRepo("https://github.com/a/b.git"), { owner: "a", repo: "b" });
  assert.deepEqual(githubRepo("https://github.com/a/b/tree/main/src"), { owner: "a", repo: "b" });
  assert.equal(githubRepo("https://github.com/a"), null);
  assert.equal(githubRepo("how DNS works"), null);
});

test("a 404 repo is refused, a found or unreachable one goes through", async () => {
  const status = (n: number) => (async () => new Response("{}", { status: n })) as typeof fetch;
  assert.equal(await precheckInput("https://github.com/no/such", status(404)), REPO_404_ERROR);
  assert.equal(await precheckInput("https://github.com/a/b", status(200)), null);
  assert.equal(await precheckInput("https://github.com/a/b", status(403)), null);
  const down = (async () => {
    throw new Error("down");
  }) as typeof fetch;
  assert.equal(await precheckInput("https://github.com/a/b", down), null);
  assert.equal(await precheckInput("asdfghjkl", down), GIBBERISH_ERROR);
});

test("My videos hides failed runs that made no video", () => {
  const v = (id: string, status: string, mp4?: string) => ({ id, status, files: mp4 ? { mp4 } : {} }) as unknown as UserVideo;
  const shown = shownVideos([v("a", "done", "a.mp4"), v("b", "error"), v("c", "running"), v("d", "error", "d.mp4")]);
  assert.deepEqual(
    shown.map((x) => x.id),
    ["a", "c", "d"],
  );
});
