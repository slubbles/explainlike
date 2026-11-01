import { test } from "node:test";
import assert from "node:assert/strict";
import { readStart, spokenUrl, takeSentences, voiceSystem } from "../lib/voice.ts";

const github = (u: string) => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(u);

test("a link said out loud becomes a real link", () => {
  assert.equal(spokenUrl("github dot com slash slubbles slash openmausbot"), "https://github.com/slubbles/openmausbot");
  assert.equal(spokenUrl("github.com/slubbles/explain like"), "https://github.com/slubbles/explainlike");
  assert.equal(spokenUrl("HTTPS://github.com/a/b"), "https://github.com/a/b");
});

test("the start call becomes a job request with safe defaults", () => {
  const r = readStart({ link: "github dot com slash slubbles slash openmausbot", goal: "  how a message\nflows ", audience: "my cofounder", depth: "bogus", also: "", confirm: "" }, github);
  assert.ok(r.ok);
  assert.deepEqual(r.req, { input: "https://github.com/slubbles/openmausbot", goal: "how a message flows", audience: "my cofounder", depth: "working", also: "" });
  assert.match(r.confirm, /starting/i);
});

test("a missing or unusable link goes back to the model as something to ask again", () => {
  assert.equal(readStart({ goal: "x" }, github).ok, false);
  const bad = readStart({ link: "my cool project" }, github);
  assert.ok(!bad.ok && /say or type it again/.test(bad.error));
});

test("a field cannot be read as a command-line flag", () => {
  const r = readStart({ link: "github.com/a/b", goal: "--depth deep", depth: "deep" }, github);
  assert.ok(r.ok && !r.req.goal.startsWith("-"));
});

test("sentences are voiced one at a time without splitting a link", () => {
  assert.deepEqual(takeSentences("Nice, github.com/a/b looks fun! Who is it for? I"), { done: ["Nice, github.com/a/b looks fun!", "Who is it for?"], rest: "I" });
  assert.deepEqual(takeSentences("Almost done."), { done: [], rest: "Almost done." });
});

test("a link typed before talking is not asked for again", () => {
  assert.match(voiceSystem("https://github.com/a/b"), /github\.com\/a\/b/);
});

test("voice mode answers only requests made on this machine", async () => {
  const { localOnly } = await import("../lib/local.ts");
  const req = (h: Record<string, string>) => new Request("http://localhost:3000/api/voice/token", { headers: h });
  assert.equal(localOnly(req({ host: "localhost:3000", "x-forwarded-host": "localhost:3000", "x-forwarded-for": "::1" })), undefined);
  assert.equal(localOnly(req({ host: "127.0.0.1:3000", "x-forwarded-for": "::ffff:127.0.0.1" })), undefined);
  assert.equal(localOnly(req({ host: "localhost:3000", "x-forwarded-host": "abc.trycloudflare.com" }))?.status, 403);
  assert.equal(localOnly(req({ host: "localhost:3000", "x-forwarded-for": "203.0.113.9, ::1" }))?.status, 403);
  assert.equal(localOnly(req({ host: "192.168.1.5:3000" }))?.status, 403);
});

test("a misheard repo name finds the real one among the owner's repos", async () => {
  const { closest } = await import("../lib/reach.ts");
  assert.deepEqual(closest("openmousebot", ["umami", "OpenMausBot", "spotibai", "open-mouse"]).slice(0, 1), ["OpenMausBot"]);
  assert.deepEqual(closest("explainlike", ["umami", "spotibai"]), []);
});

test("a spoken topic with no link starts a topic video, a spoken link still becomes a URL", async () => {
  const { validInput } = await import("../lib/validate.ts");
  const t = readStart({ link: "how DNS works", goal: "", audience: "", depth: "overview", also: "", confirm: "" }, validInput);
  assert.ok(t.ok && t.req.input === "how DNS works");
  const l = readStart({ link: "github dot com slash a slash b" }, validInput);
  assert.ok(l.ok && l.req.input === "https://github.com/a/b");
});
