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
 * The login-code message: a plain-text part plus the approved v2 HTML design. The HTML
 * is tables with inline CSS only (no style blocks, scripts or SVG), so it renders in
 * strict email clients; the logo and the copy icon are PNGs from public/email/. The code
 * sits left-aligned next to a blue Copy code button that opens /copy?c= for one-tap copy.
 */
export function buildOtpEmail(otp: string): OtpEmail {
  const subject = `Your Explanimate code: ${otp}`;
  const copyUrl = `${SITE_URL}/copy?c=${encodeURIComponent(otp)}`;
  const text =
    `Your Explanimate code is ${otp}. It expires in 10 minutes. ` + `If you did not ask for this, ignore it. Copy it here: ${copyUrl}`;
  const code = escapeHtml(otp);
  const link = escapeHtml(copyUrl);
  const font = "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  const mono = "font-family:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace;";
  // one chunk per output line, matching the approved v2 design line for line
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><title>Your Explanimate code</title></head>\n` +
    `<body style="margin:0;padding:0;background:#0a0a0a;">\n` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:48px 16px;">\n` +
    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;background:#111111;border:1px solid #1f1f1f;border-radius:12px;">\n` +
    `<tr><td style="padding:32px 36px 0 36px;${font}">\n` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>\n` +
    `<td style="vertical-align:middle;padding-right:10px;"><img src="${SITE_URL}/email/logo.png" width="24" height="24" alt="Explanimate" style="display:block;width:24px;height:24px;border:0;"></td>\n` +
    `<td style="vertical-align:middle;font-size:15px;font-weight:600;color:#ededed;letter-spacing:-0.01em;">Explanimate</td></tr></table></td></tr>\n` +
    `<tr><td style="padding:32px 36px 0 36px;${font}">\n` +
    `<h1 style="margin:0;font-size:22px;line-height:30px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;">Your sign-in code</h1>\n` +
    `<p style="margin:10px 0 0 0;font-size:14px;line-height:22px;color:#a1a1a1;">Enter this code on explanimate.co to finish signing in.</p></td></tr>\n` +
    `<tr><td style="padding:24px 36px 0 36px;">\n` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;border:1px solid #262626;border-left:3px solid #0082fb;border-radius:8px;"><tr>\n` +
    `<td align="left" style="padding:22px 0 22px 24px;${mono}font-size:36px;line-height:40px;font-weight:600;letter-spacing:10px;color:#ffffff;">${code}</td><td align="right" style="padding:0 16px 0 8px;"><a href="${link}" style="display:inline-block;padding:10px 14px;background:#0082fb;border-radius:6px;${font}font-size:13px;line-height:16px;font-weight:600;color:#ffffff;text-decoration:none;white-space:nowrap;"><img src="${SITE_URL}/email/copy.png" width="14" height="14" alt="" style="vertical-align:-2px;margin-right:6px;border:0;">Copy code</a></td></tr></table></td></tr>\n` +
    `<tr><td style="padding:20px 36px 32px 36px;${font}font-size:13px;line-height:20px;color:#8a8a8a;">\n` +
    `It expires in 10 minutes. If you didn't ask for this code, you can ignore this email.</td></tr>\n` +
    `<tr><td style="padding:18px 36px;border-top:1px solid #1f1f1f;${font}font-size:12px;line-height:18px;color:#666666;">\n` +
    `Explanimate turns any repo, article or idea into a narrated whiteboard video.<br><a href="${SITE_URL}" style="color:#8a8a8a;text-decoration:underline;">explanimate.co</a></td></tr>\n` +
    `</table></td></tr></table></body></html>\n`;
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
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email] dev login code for ${to}: ${otp}`);
      return { ok: true };
    }
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
