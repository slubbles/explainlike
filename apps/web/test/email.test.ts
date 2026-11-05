import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildOtpEmail, parseEmailFrom, sendOtpEmail, setEmailRetryDelay } from "../lib/email.ts";

setEmailRetryDelay(1);

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  const restore = () => {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
  return Promise.resolve(fn()).finally(restore);
}

function logged(fn: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  return fn().then(
    () => ((console.error = orig), lines),
    (e) => ((console.error = orig), Promise.reject(e)),
  );
}

function loggedLog(fn: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  return fn().then(
    () => ((console.log = orig), lines),
    (e) => ((console.log = orig), Promise.reject(e)),
  );
}

test("the sender line parses Name <addr>, a bare address, or falls back to the default", () => {
  assert.deepEqual(parseEmailFrom(undefined), { name: "Explanimate", address: "login@explanimate.co" });
  assert.deepEqual(parseEmailFrom("Explanimate <login@explanimate.co>"), { name: "Explanimate", address: "login@explanimate.co" });
  assert.deepEqual(parseEmailFrom("other@explanimate.co"), { name: "Explanimate", address: "other@explanimate.co" });
  assert.deepEqual(parseEmailFrom("not an address"), { name: "Explanimate", address: "login@explanimate.co" });
});

test("the code goes out through Cloudflare Email with text and designed HTML parts", async () => {
  await withEnv(
    { EXPLANIMATE_CF_ACCOUNT_ID: "acct", EXPLANIMATE_CF_EMAIL_TOKEN: "tok", EXPLANIMATE_EMAIL_FROM: "Explanimate <login@explanimate.co>" },
    async () => {
      const seen: { url: string; init: RequestInit }[] = [];
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        seen.push({ url, init: init! });
        return new Response(JSON.stringify({ success: true, errors: [] }), { status: 200 });
      }) as typeof fetch;
      assert.deepEqual(await sendOtpEmail("a@x.co", "123456", fetchImpl), { ok: true });
      assert.equal(seen.length, 1);
      assert.equal(seen[0].url, "https://api.cloudflare.com/client/v4/accounts/acct/email/sending/send");
      assert.equal((seen[0].init.headers as Record<string, string>).authorization, "Bearer " + "tok");
      const body = JSON.parse(String(seen[0].init.body));
      assert.deepEqual(
        { to: body.to, from: body.from, subject: body.subject },
        {
          to: "a@x.co",
          from: { address: "login@explanimate.co", name: "Explanimate" },
          subject: "Your Explanimate code: 123456",
        },
      );
      for (const part of [body.text, body.html]) {
        assert.match(part, /123456/);
        assert.match(part, /expires in 10 minutes/);
        assert.match(part, /https:\/\/explanimate\.co\/copy\?c=123456/);
      }
      assert.match(body.text, /if you did not ask for this, ignore it/i);
      assert.match(body.html, /Your sign-in code/);
      assert.match(body.html, /you can ignore this email/);
    },
  );
});

test("the subject names the code, and the text part carries the code and the copy link", () => {
  const { subject, text } = buildOtpEmail("123456");
  assert.equal(subject, "Your Explanimate code: 123456");
  assert.match(text, /123456/);
  assert.match(text, /expires in 10 minutes/);
  assert.match(text, /https:\/\/explanimate\.co\/copy\?c=123456/);
});

test("the designed HTML matches v2: the code on the left, a Copy code button on the right", () => {
  const { html } = buildOtpEmail("123456");
  assert.match(html, /<td align="left"[^>]*>123456<\/td>/);
  assert.match(html, /<a href="https:\/\/explanimate\.co\/copy\?c=123456"[^>]*>/);
  assert.match(html, />Copy code<\/a>/);
  assert.match(html, /Your sign-in code/);
  assert.match(html, /<table/);
  assert.match(html, /<img[^>]*alt="Explanimate"/);
  assert.match(html, /https:\/\/explanimate\.co\/email\/logo\.png/);
  assert.match(html, /<img[^>]*src="https:\/\/explanimate\.co\/email\/copy\.png"[^>]*>/);
  assert.match(html, /border-left:3px solid #0082fb/);
  assert.doesNotMatch(html, /<style|<script|<svg|<link/);
  assert.ok(fs.existsSync(new URL("../public/email/logo.png", import.meta.url)), "the logo PNG is served from public/");
  assert.ok(fs.existsSync(new URL("../public/email/copy.png", import.meta.url)), "the copy-icon PNG is served from public/");

  const nasty = buildOtpEmail(`1<svg onload=alert(1)>&`).html;
  assert.doesNotMatch(nasty, /<svg/);
  assert.match(nasty, /1&lt;svg onload=alert\(1\)&gt;&amp;/);
  assert.match(nasty, /copy\?c=1%3Csvg/);
});

test("a refused send logs the Cloudflare error codes and tells the user something plain", async () => {
  await withEnv({ EXPLANIMATE_CF_ACCOUNT_ID: "acct", EXPLANIMATE_CF_EMAIL_TOKEN: "tok" }, async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ success: false, errors: [{ code: 7003 }, { code: 7500 }] }), { status: 400 })) as typeof fetch;
    const lines = await logged(async () => {
      const r = await sendOtpEmail("a@x.co", "123456", fetchImpl);
      assert.equal(r.ok, false);
      assert.match(r.ok === false ? r.error : "", /Could not send the code/);
    });
    assert.match(lines.join("\n"), /7003/);
    assert.doesNotMatch(lines.join("\n"), /tok/);
  });
});

test("a network error or a missing config fails plainly without sending", async () => {
  await withEnv({ EXPLANIMATE_CF_ACCOUNT_ID: "acct", EXPLANIMATE_CF_EMAIL_TOKEN: "tok" }, async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      throw new Error("down");
    }) as typeof fetch;
    assert.deepEqual(await sendOtpEmail("a@x.co", "123456", fetchImpl), {
      ok: false,
      error: "Could not send the code. Try again in a moment.",
    });
    assert.equal(calls, 3, "a network error is retried");
  });
  await withEnv({ EXPLANIMATE_CF_ACCOUNT_ID: undefined, EXPLANIMATE_CF_EMAIL_TOKEN: undefined, NODE_ENV: "production" }, async () => {
    const lines = await logged(async () => {
      const r = await sendOtpEmail("a@x.co", "123456", (() => assert.fail("must not call fetch")) as unknown as typeof fetch);
      assert.equal(r.ok, false);
    });
    assert.match(lines.join("\n"), /not configured/);
  });
});

test("outside production a missing email config logs the code to the console instead of failing", async () => {
  await withEnv({ EXPLANIMATE_CF_ACCOUNT_ID: undefined, EXPLANIMATE_CF_EMAIL_TOKEN: undefined, NODE_ENV: "development" }, async () => {
    const lines = await loggedLog(async () => {
      const r = await sendOtpEmail("a@x.co", "123456", (() => assert.fail("must not call fetch")) as unknown as typeof fetch);
      assert.deepEqual(r, { ok: true });
    });
    assert.match(lines.join("\n"), /a@x\.co/);
    assert.match(lines.join("\n"), /123456/);
  });
});

test("EXPLANIMATE_EMAIL_CAPTURE_DIR writes the code to a file instead of sending", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-email-"));
  await withEnv({ EXPLANIMATE_EMAIL_CAPTURE_DIR: dir }, async () => {
    const r = await sendOtpEmail("a@x.co", "654321", (() => assert.fail("must not call fetch")) as unknown as typeof fetch);
    assert.deepEqual(r, { ok: true });
    const row = JSON.parse(fs.readFileSync(path.join(dir, "a@x.co.json"), "utf8"));
    assert.equal(row.to, "a@x.co");
    assert.equal(row.otp, "654321");
    assert.match(fs.readFileSync(path.join(dir, "outbox.jsonl"), "utf8"), /654321/);
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a 5xx then a success sends the code on the retry; a 400 is not retried", async () => {
  await withEnv({ EXPLANIMATE_CF_ACCOUNT_ID: "acct", EXPLANIMATE_CF_EMAIL_TOKEN: "tok" }, async () => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      return calls === 1 ? new Response("{}", { status: 503 }) : new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;
    assert.deepEqual(await sendOtpEmail("a@x.co", "123456", flaky), { ok: true });
    assert.equal(calls, 2);
    calls = 0;
    const refused = (async () => {
      calls++;
      return new Response(JSON.stringify({ success: false }), { status: 400 });
    }) as typeof fetch;
    assert.equal((await sendOtpEmail("a@x.co", "123456", refused)).ok, false);
    assert.equal(calls, 1);
  });
});
