import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Temporary inboxes never get a login code: unit tests for the guard plus one pass
// through the real send endpoint (local SQLite, captured codes, the Turnstile test
// keys, no network).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "el-email-guard-"));
const mailDir = path.join(dir, "mail");
Object.assign(process.env, {
  BETTER_AUTH_SECRET: "test-secret-for-email-guard",
  BETTER_AUTH_URL: "http://localhost:3000",
  EXPLANIMATE_D1_LOCAL_PATH: path.join(dir, "auth.db"),
  EXPLANIMATE_EMAIL_CAPTURE_DIR: mailDir,
  EXPLANIMATE_TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
  EXPLANIMATE_TRUST_PROXY: "1",
});

// best-effort: the local SQLite handle stays open until the process exits, so on
// Windows the tmp dir is left behind (Linux unlinks it fine)
test.after(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
});

const guard = () => import("../lib/email-guard.ts");

test("gmail.com passes, mailinator.com is blocked", async () => {
  const { emailDomain, isDisposableDomain } = await guard();
  assert.equal(isDisposableDomain("gmail.com"), false);
  assert.equal(isDisposableDomain("mailinator.com"), true);
  assert.equal(emailDomain("User@GMail.COM"), "gmail.com");
  assert.equal(emailDomain("not-an-email"), "");
});

test("subdomains of a listed domain are blocked, lookalikes are not", async () => {
  const { isDisposableDomain } = await guard();
  assert.equal(isDisposableDomain("x.mailinator.com"), true);
  assert.equal(isDisposableDomain("mailinator.com."), true);
  assert.equal(isDisposableDomain("fakemailinator.com"), false);
  assert.equal(isDisposableDomain("mail.gmail.com"), false);
  assert.equal(isDisposableDomain(""), false);
});

test("checkMx: ok on records, none on NXDOMAIN or no records", async () => {
  const { checkMx } = await guard();
  const ok = () => checkMx("gmail.com", { resolve: async () => [{ exchange: "a", priority: 1 }] });
  assert.equal(await ok(), "ok");
  const nx = (code: string) => async () => {
    const e = new Error(code) as NodeJS.ErrnoException;
    e.code = code;
    throw e;
  };
  assert.equal(await checkMx("no-mx.invalid", { resolve: nx("ENOTFOUND") }), "none");
  assert.equal(await checkMx("no-mx.invalid", { resolve: nx("ENODATA") }), "none");
  assert.equal(await checkMx("no-mx.invalid", { resolve: async () => [] }), "none");
});

test("checkMx fails open on timeout and on other DNS errors", async () => {
  const { checkMx } = await guard();
  assert.equal(await checkMx("gmail.com", { resolve: () => new Promise(() => {}), timeoutMs: 20 }), "unknown");
  const e = new Error("EAI_AGAIN") as NodeJS.ErrnoException;
  e.code = "EAI_AGAIN";
  assert.equal(
    await checkMx("gmail.com", {
      resolve: async () => {
        throw e;
      },
    }),
    "unknown",
  );
});

test("rejectTempEmail: gmail ok, mailinator blocked without a lookup, no-MX blocked", async () => {
  const { TEMP_EMAIL_ERROR, rejectTempEmail } = await guard();
  assert.equal(TEMP_EMAIL_ERROR, "Please use a permanent email address. Temporary inboxes aren't supported.");
  assert.equal(await rejectTempEmail("user@gmail.com", { resolve: async () => [{ exchange: "a", priority: 1 }] }), null);
  let lookedUp = false;
  assert.equal(
    await rejectTempEmail("user@mailinator.com", {
      resolve: async () => {
        lookedUp = true;
        return [];
      },
    }),
    TEMP_EMAIL_ERROR,
  );
  assert.equal(lookedUp, false);
  const nx = async () => {
    const e = new Error("ENOTFOUND") as NodeJS.ErrnoException;
    e.code = "ENOTFOUND";
    throw e;
  };
  assert.equal(await rejectTempEmail("user@no-mx.invalid", { resolve: nx }), TEMP_EMAIL_ERROR);
  assert.equal(await rejectTempEmail("not-an-email"), null);
  assert.equal(await rejectTempEmail("user@no-mx.invalid", { skipMx: true, resolve: nx }), null);
});

test("the send endpoint refuses a temporary inbox before sending, and still sends to gmail", async () => {
  const { TEMP_EMAIL_ERROR } = await guard();
  const { ensureAuthSchema, getAuth, resetAuthForTests } = await import("../lib/auth.ts");
  resetAuthForTests();
  const api = getAuth();
  await ensureAuthSchema();
  const send = (email: string, ip: string) =>
    api.handler(
      new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "x-forwarded-for": ip,
          "x-turnstile-token": "XXXX.DUMMY.TOKEN.XXXX",
        },
        body: JSON.stringify({ email, type: "sign-in" }),
      }),
    );
  const bad = await send("user@mailinator.com", "10.9.9.9");
  assert.equal(bad.status, 400);
  assert.equal(((await bad.json()) as { message?: string }).message, TEMP_EMAIL_ERROR);
  assert.ok(!fs.existsSync(path.join(mailDir, "user@mailinator.com.json")), "no code is captured for a refused address");
  const good = await send("user@gmail.com", "10.9.9.10");
  if (!good.ok) assert.fail(`sending to gmail failed: ${good.status} ${await good.text()}`);
  const row = JSON.parse(fs.readFileSync(path.join(mailDir, "user@gmail.com.json"), "utf8")) as { otp: string };
  assert.match(row.otp, /^\d{6}$/);
});

test("a failed send comes back as an error, not a false success", async () => {
  const { getAuth } = await import("../lib/auth.ts");
  // a capture dir under a plain file cannot be created, so the send itself fails
  const blocker = path.join(dir, "blocker");
  fs.writeFileSync(blocker, "");
  process.env.EXPLANIMATE_EMAIL_CAPTURE_DIR = path.join(blocker, "mail");
  const orig = console.error;
  console.error = () => {};
  try {
    const res = await getAuth().handler(
      new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "x-forwarded-for": "10.9.9.11",
          "x-turnstile-token": "XXXX.DUMMY.TOKEN.XXXX",
        },
        body: JSON.stringify({ email: "fails@gmail.com", type: "sign-in" }),
      }),
    );
    assert.equal(res.status, 500);
    assert.match(((await res.json()) as { message?: string }).message ?? "", /Could not send the code/);
  } finally {
    console.error = orig;
    process.env.EXPLANIMATE_EMAIL_CAPTURE_DIR = mailDir;
  }
});
