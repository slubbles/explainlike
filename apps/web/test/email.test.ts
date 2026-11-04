import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmailFrom, sendOtpEmail } from "../lib/email.ts";

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

test("the sender line parses Name <addr>, a bare address, or falls back to the default", () => {
  assert.deepEqual(parseEmailFrom(undefined), { name: "Explanimate", address: "login@explanimate.co" });
  assert.deepEqual(parseEmailFrom("Explanimate <login@explanimate.co>"), { name: "Explanimate", address: "login@explanimate.co" });
  assert.deepEqual(parseEmailFrom("other@explanimate.co"), { name: "Explanimate", address: "other@explanimate.co" });
  assert.deepEqual(parseEmailFrom("not an address"), { name: "Explanimate", address: "login@explanimate.co" });
});

test("the code goes out through Cloudflare Email with a short plain message", async () => {
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
      assert.equal((seen[0].init.headers as Record<string, string>).authorization, "Bearer tok");
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
        assert.match(part, /if you did not ask for this, ignore it/i);
      }
    },
  );
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
    assert.equal(calls, 1);
  });
  await withEnv({ EXPLANIMATE_CF_ACCOUNT_ID: undefined, EXPLANIMATE_CF_EMAIL_TOKEN: undefined }, async () => {
    const lines = await logged(async () => {
      const r = await sendOtpEmail("a@x.co", "123456", (() => assert.fail("must not call fetch")) as unknown as typeof fetch);
      assert.equal(r.ok, false);
    });
    assert.match(lines.join("\n"), /not configured/);
  });
});
