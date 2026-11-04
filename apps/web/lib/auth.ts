/**
 * Sign-in by one-time email code, behind EXPLANIMATE_AUTH_ENABLED=1 (only the exact value "1"
 * turns it on; anything else is today's behaviour: no sign-in, no Turnstile, no per-account limit).
 * Better Auth with its emailOTP plugin only: no passwords, no OAuth. Sessions last 7 days and are
 * refreshed daily; codes are 6 digits, valid 10 minutes, with 5 attempts. The database is D1 over
 * its REST API (see lib/db.ts), or a local SQLite file for tests; its tables are created on first use, once per process.
 */
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { emailOTP } from "better-auth/plugins";
import { createKysely, d1ConfigFromEnv, ensureTables, getD1Db, localD1Path } from "./db";
import { createLocalKysely } from "./db-local";
import { sendOtpEmail } from "./email";
import { clientIp, rateLimit } from "./guard";
import { verifyTurnstile } from "./turnstile";

/** Only the exact value "1" turns auth on. */
export const authEnabled = (): boolean => process.env.EXPLANIMATE_AUTH_ENABLED === "1";

export const SIGNIN_ERROR = "Sign in to make a video.";

const SEND_PATH = "/email-otp/send-verification-otp";
const VERIFY_PATHS = new Set(["/sign-in/email-otp", "/email-otp/check-verification-otp", "/email-otp/verify-email"]);

function buildAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return betterAuth({
    secret,
    baseURL,
    trustedOrigins: [baseURL],
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    database: {
      db: localD1Path() ? createLocalKysely(localD1Path()) : createKysely(d1ConfigFromEnv()),
      type: "sqlite",
      transaction: false,
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "sign-in") throw new APIError("BAD_REQUEST", { message: "Not supported." });
          const r = await sendOtpEmail(email, otp);
          if (!r.ok) throw new APIError("INTERNAL_SERVER_ERROR", { message: r.error });
        },
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== SEND_PATH && !(ctx.path && VERIFY_PATHS.has(ctx.path))) return;
        const req = ctx.request ?? new Request("http://localhost/", { headers: new Headers(ctx.headers as HeadersInit) });
        const ip = clientIp(req);
        if (ctx.path === SEND_PATH) {
          // sending a code costs an email: per-IP and per-address limits, then the Turnstile
          // check. The hook throws before the endpoint runs, so no email goes out without one.
          const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
          if (rateLimit(`otp-send:${ip}`, 5, 10 * 60_000))
            throw new APIError("TOO_MANY_REQUESTS", { message: "Too many codes requested. Try again in a few minutes." });
          if (email && rateLimit(`otp-email:${email}`, 5, 60 * 60_000))
            throw new APIError("TOO_MANY_REQUESTS", { message: "Too many codes for this address. Try again in an hour." });
          const token =
            req.headers.get("x-turnstile-token") ?? (typeof ctx.body?.turnstileToken === "string" ? ctx.body.turnstileToken : "");
          const v = await verifyTurnstile(token, ip);
          if (!v.ok) throw new APIError("BAD_REQUEST", { message: v.error });
        } else if (rateLimit(`otp-verify:${ip}`, 10, 10 * 60_000)) {
          throw new APIError("TOO_MANY_REQUESTS", { message: "Too many tries. Try again in a few minutes." });
        }
      }),
    },
  });
}

type Auth = ReturnType<typeof buildAuth>;
let auth: Auth | undefined;

/** The Better Auth instance (built once; throws when the auth settings are missing). */
export function getAuth(): Auth {
  if (!auth) auth = buildAuth();
  return auth;
}

/** Better Auth's tables plus ours, created when missing (once per process; a failure retries). */
let migrated: Promise<void> | undefined;
export function ensureAuthSchema(): Promise<void> {
  migrated ??= (async () => {
    try {
      const { runMigrations } = await getMigrations(getAuth().options);
      await runMigrations();
      await ensureTables(getD1Db());
    } catch (e) {
      migrated = undefined;
      throw e;
    }
  })();
  return migrated;
}

export interface SessionUser {
  id: string;
  email: string;
}

/** The signed-in account, or null (flag off, signed out, or anything failing: fail closed). */
export async function sessionUser(req: Request): Promise<SessionUser | null> {
  if (!authEnabled()) return null;
  try {
    await ensureAuthSchema();
    const s = await getAuth().api.getSession({ headers: req.headers });
    return s?.user?.id && s.user.email ? { id: s.user.id, email: s.user.email } : null;
  } catch (e) {
    console.error(`[auth] session check failed: ${(e as Error).message}`);
    return null;
  }
}
