/**
 * Secret hygiene for ingested sources. Two layers:
 *  1. never open files whose path looks like it holds credentials
 *  2. redact anything that still looks like a credential in text we do read
 */
const SECRET_PATH = [
  /(^|\/)\.env(\.|$)(?!example|sample|template)/i,
  /(^|\/)\.dev\.vars/i,
  /\.(pem|key|p12|pfx|jks|keystore|crt|cer|der|kdbx|ovpn)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)/i,
  /(secret|credential|passw|private[-_]?key|service[-_]?account|token)s?[^/]*$/i,
  /(^|\/)(\.aws|\.ssh|\.gnupg|\.docker)\//i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /archive\//i, // dumps of old machines and backups are never worth the risk
  /backup/i,
];

export function isSecretPath(p: string): boolean {
  if (/\.(example|sample|template)$/i.test(p) || /\.env\.(example|sample|template)/i.test(p)) return false;
  return SECRET_PATH.some((r) => r.test(p));
}

const ASSIGN =
  /((?:api[_-]?key|apikey|secret|token|password|passwd|pwd|bearer|auth|credential|private[_-]?key|access[_-]?key|client[_-]?secret)[\w-]*["']?\s*[:=]\s*["'`]?)([^\s"'`,;]{6,})/gi;
const KNOWN = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /gh[ousr]_[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abpr]-[A-Za-z0-9-]{10,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /(postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"'`]+/gi,
];
const LONG_RANDOM = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{36,}\b/g;

export function redact(s: string): string {
  let out = s;
  for (const r of KNOWN) out = out.replace(r, "<redacted>");
  out = out.replace(ASSIGN, (_m, k, v) =>
    /^(process\.env|env\.|os\.environ|<redacted>|true|false|null|undefined|string|number)/.test(v) ? _m : `${k}<redacted>`,
  );
  out = out.replace(LONG_RANDOM, (m) => (/^[a-z_-]+$/i.test(m) ? m : "<redacted>"));
  return out;
}
