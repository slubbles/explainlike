/**
 * One-time login codes go out through Cloudflare's Email Service REST API (no SDK).
 * The sender defaults to Explanimate <login@explanimate.co>; EXPLANIMATE_EMAIL_FROM
 * ("Name <addr>") overrides it. Failures log Cloudflare's error codes, never the token.
 * For end-to-end tests, EXPLANIMATE_EMAIL_CAPTURE_DIR captures each code to a file
 * instead of sending it.
 */
import fs from "node:fs";
import path from "node:path";
import { SITE_URL } from "./seo";

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

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type OtpEmail = { subject: string; text: string; html: string };

/**
 * The login-code message: a plain-text part plus a designed HTML part. The HTML is
 * tables with inline CSS only (no style blocks, scripts or SVG), so it renders in
 * strict email clients; the logo is a PNG served from public/email/logo.png.
 */
export function buildOtpEmail(otp: string): OtpEmail {
  const subject = `Your Explanimate code: ${otp}`;
  const text = `Your Explanimate code is ${otp}. It expires in 10 minutes. If you did not ask for this, ignore it.`;
  const code = escapeHtml(otp);
  const font = "font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:0;background-color:#0a0a0a;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;">` +
    `<tr><td align="center" style="padding:32px 16px;">` +
    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background-color:#111111;border:1px solid #1f1f1f;border-radius:12px;">` +
    `<tr><td style="padding:32px 32px 28px 32px;${font}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td width="36" style="width:36px;vertical-align:middle;"><img src="${SITE_URL}/email/logo.png" width="28" height="28" alt="Explanimate" style="display:block;width:28px;height:28px;border:0;"></td>` +
    `<td style="font-size:15px;font-weight:600;color:#ededed;vertical-align:middle;">Explanimate</td>` +
    `</tr></table>` +
    `<h1 style="margin:24px 0 8px 0;font-size:22px;font-weight:600;line-height:1.3;color:#ffffff;">Your sign-in code</h1>` +
    `<p style="margin:0 0 20px 0;font-size:14px;line-height:1.5;color:#a1a1a1;">Enter this code on explanimate.co to finish signing in.</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td align="center" style="background-color:#0a0a0a;border:1px solid #262626;border-left:3px solid #0082fb;border-radius:6px;padding:20px 16px 20px 26px;">` +
    `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:36px;letter-spacing:10px;color:#ffffff;">${code}</span>` +
    `</td></tr></table>` +
    `<p style="margin:20px 0 0 0;font-size:13px;line-height:1.5;color:#8a8a8a;">It expires in 10 minutes. If you didn&apos;t ask for this code, you can ignore this email.</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding:24px 0 16px 0;border-bottom:1px solid #1f1f1f;"></td>` +
    `</tr></table>` +
    `<p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#666666;">Explanimate turns any repo, article or idea into a narrated whiteboard video.<br><a href="${SITE_URL}" style="color:#0082fb;text-decoration:none;">explanimate.co</a></p>` +
    `</td></tr></table>` +
    `</td></tr></table>` +
    `</body></html>`;
  return { subject, text, html };
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
    console.error("[email] not configured: EXPLANIMATE_CF_ACCOUNT_ID or EXPLANIMATE_CF_EMAIL_TOKEN is missing");
    return { ok: false, error: FAIL };
  }
  const from = parseEmailFrom(process.env.EXPLANIMATE_EMAIL_FROM);
  const { subject, text, html } = buildOtpEmail(otp);
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
