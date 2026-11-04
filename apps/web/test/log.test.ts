import { test } from "node:test";
import assert from "node:assert/strict";
import { log, logError, maskEmail, requestId, scrub, scrubString } from "../lib/log.ts";

test("emails are masked, never logged in full", () => {
  assert.equal(maskEmail("you@example.com"), "y***@example.com");
  assert.equal(maskEmail("a@x.co"), "a***@x.co");
  assert.equal(maskEmail("not-an-email"), "***");
  const s = scrubString("sign-in failed for you@example.com, try again");
  assert.doesNotMatch(s, /you@example\.com/);
  assert.match(s, /y\*\*\*@example\.com/);
});

test("tokens, bearer credentials and cookies are redacted from strings", () => {
  assert.match(scrubString("auth Bearer abcdef123456 failed"), /Bearer \[redacted\]/);
  assert.doesNotMatch(scrubString("auth Bearer abcdef123456 failed"), /abcdef123456/);
  assert.equal(scrubString("cookie: session=abc; theme=dark"), "cookie=[redacted]; theme=dark");
  assert.equal(scrubString("a=1; cookie: session=abc"), "a=1; cookie=[redacted]");
});

test("sensitive object keys are redacted, everything else passes through", () => {
  const out = scrub({
    route: "jobs.POST",
    token: "secret",
    otp: "123456",
    nested: { cookie: "a=b", count: 2 },
    emails: ["you@example.com"],
  });
  assert.deepEqual(out, {
    route: "jobs.POST",
    token: "[redacted]",
    otp: "[redacted]",
    nested: { cookie: "[redacted]", count: 2 },
    emails: ["y***@example.com"],
  });
});

function logged(fn: () => void): Record<string, unknown>[] {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return lines.map((l) => JSON.parse(l));
}

test("one event is one JSON line on stdout with level, timestamp, route and message", () => {
  const [line] = logged(() => log("info", "jobs.POST", "started", { requestId: "abc123" }));
  assert.equal(line.level, "info");
  assert.equal(line.route, "jobs.POST");
  assert.equal(line.msg, "started");
  assert.equal(line.requestId, "abc123");
  assert.ok(!Number.isNaN(Date.parse(String(line.ts))), String(line.ts));
});

test("an error logs its name, message and stack trimmed, all scrubbed", () => {
  const e = new Error("send to you@example.com with Bearer abcdef failed");
  e.stack = `Error: send to you@example.com\n${"    at x\n".repeat(500)}`;
  const [line] = logged(() => logError("jobs.POST", "uncaught error", e, "req1"));
  const err = line.error as { name: string; message: string; stack: string };
  assert.equal(line.level, "error");
  assert.equal(line.requestId, "req1");
  assert.equal(err.name, "Error");
  assert.doesNotMatch(err.message, /you@example\.com|abcdef/);
  assert.match(err.message, /y\*\*\*@example\.com/);
  assert.ok(err.stack.length <= 2000, String(err.stack.length));
  assert.doesNotMatch(err.stack, /you@example\.com/);
});

test("request ids are unique hex", () => {
  const ids = new Set([requestId(), requestId(), requestId()]);
  assert.equal(ids.size, 3);
  for (const id of ids) assert.match(id, /^[a-f0-9]{16}$/);
});
