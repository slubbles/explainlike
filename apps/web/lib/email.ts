/**
 * One-time login codes go out through Cloudflare's Email Service REST API (no SDK).
 * The sender defaults to Explanimate <login@explanimate.co>; EXPLANIMATE_EMAIL_FROM
 * ("Name <addr>") overrides it. Failures log Cloudflare's error codes, never the token.
 * For end-to-end tests, EXPLANIMATE_EMAIL_CAPTURE_DIR captures each code to a file
 * instead of sending it. In local dev (anything but production) with no email keys,
 * the code is logged to the server console instead of failing, so sign-in works
 * with no setup.
 */
import fs from "node:fs";
import path from "node:path";

export type EmailFrom = { name: string; address: string };

const DEFAULT_FROM: EmailFrom = { name: "Explanimate", address: "login@explanimate.co" };

/** "Name <addr>" or a bare address; anything unparsable falls back to the default. */
export function parseEmailFrom(raw?: string): EmailFrom {
  if (!raw?.trim()) return DEFAULT_FROM;
  const m = raw.trim().match(/^(.*)<([^<>@\s]+@[^<>@\s]+)>\s*$/);
  if (m) return { name: m[1].trim() || DEFAULT_FROM.name, address: m[2].trim() };
  const bare = raw.trim();
  if (/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(bare)) return { name: DEFAULT_FROM.name, address: bare };
  return DEFAULT_FROM;
}

export type EmailResult = { ok: true } | { ok: false; error: string };

const FAIL = "Could not send the code. Try again in a moment.";

/** Where captured codes go in tests (EXPLANIMATE_EMAIL_CAPTURE_DIR); unset in production. */
export function emailCaptureDir(): string | undefined {
  const d = process.env.EXPLANIMATE_EMAIL_CAPTURE_DIR?.trim();
  return d ? d : undefined;
}

/** Send a 6-digit login code. `fetchImpl` is stubbed in tests. */
export async function sendOtpEmail(to: string, otp: string, fetchImpl: typeof fetch = fetch): Promise<EmailResult> {
  const capture = emailCaptureDir();
  if (capture) {
    fs.mkdirSync(capture, { recursive: true });
    const row = JSON.stringify({ to, otp, at: Date.now() });
    fs.appendFileSync(path.join(capture, "outbox.jsonl"), row + "\n");
    fs.writeFileSync(path.join(capture, `${to.replace(/[^a-zA-Z0-9@._-]+/g, "_")}.json`), row + "\n");
    return { ok: true };
  }
  const account = process.env.EXPLANIMATE_CF_ACCOUNT_ID;
  const token = process.env.EXPLANIMATE_CF_EMAIL_TOKEN;
  if (!account || !token) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email] dev login code for ${to}: ${otp}`);
      return { ok: true };
    }
    console.error("[email] not configured: EXPLANIMATE_CF_ACCOUNT_ID or EXPLANIMATE_CF_EMAIL_TOKEN is missing");
    return { ok: false, error: FAIL };
  }
  const from = parseEmailFrom(process.env.EXPLANIMATE_EMAIL_FROM);
  const subject = `Your Explanimate code: ${otp}`;
  const text = `Your Explanimate code is ${otp}. It expires in 10 minutes. If you did not ask for this, ignore it.`;
  const html = `<p>Your Explanimate code is <b>${otp}</b>.</p><p>It expires in 10 minutes. If you did not ask for this, ignore it.</p>`;
  let res: Response;
  try {
    res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ to, from: { address: from.address, name: from.name }, subject, text, html }),
    });
  } catch {
    return { ok: false, error: FAIL };
  }
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; errors?: { code?: number; message?: string }[] };
  if (!res.ok || data.success !== true) {
    const codes = (data.errors ?? [])
      .map((e) => e.code)
      .filter(Boolean)
      .join(",");
    console.error(`[email] Cloudflare refused the send (http ${res.status}${codes ? `, codes ${codes}` : ""})`);
    return { ok: false, error: FAIL };
  }
  return { ok: true };
}
