# Security: what guards each route

How the web app answers abuse: every API route with its auth check, rate limit and input
validation, the headers on every response, and where secrets may and may not go. The deploy
settings this mentions are listed in [`.env.example`](../.env.example) and
[`deploy.md`](deploy.md).

## Response headers

`middleware.ts` sets these on every route (see `lib/security.ts`); `next.config.mjs` removes
`x-powered-by`:

- `Content-Security-Policy`: scripts are this site plus a per-request nonce (middleware hands
  it to Next, which stamps it on the inline scripts it renders) plus the Turnstile loader;
  styles allow inline; the browser talks back only to this site, Turnstile and the Deepgram
  listening socket (`wss://api.deepgram.com`, which voice mode opens from the browser). The
  Google hosts join only when `GA_MEASUREMENT_ID` is set. Frames are Turnstile only, and
  `frame-ancestors 'none'` with `X-Frame-Options: DENY` means nobody embeds us.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: microphone=(self), camera=(), geolocation=()` (voice mode needs the mic).

## Routes

Every handler runs inside `withErrors` (`lib/route.ts`): a throw is logged as structured JSON,
persisted to the error store, and answered as a generic 500 carrying the request id. Nothing
internal — no stack, no sentence from the code — reaches the caller.

Every POST checks the `Origin` header first (`checkOrigin`): a mismatched origin gets a 403.
Requests without one (curl, server-to-server) pass, because they carry no cookies to forge.
Every route that reads a body uses `readBody`, which refuses a stated non-JSON content type
with a 415 and caps the size (16 KB, 96 KB for voice turns, 4 KB for client errors).

| Route                            | Auth when sign-in is on                                      | Rate limit              | Input validation                                    |
| -------------------------------- | ------------------------------------------------------------ | ----------------------- | --------------------------------------------------- |
| `GET /api/health`                | public (count only, no details)                              | no (15 s cache)         | none                                                |
| `GET /api/auth-config`           | public read                                                  | no                      | none                                                |
| `GET /api/runtime-config`        | public read (GA id only)                                     | no                      | none                                                |
| `GET /api/gallery`               | public                                                       | no                      | none                                                |
| `GET /api/gallery/[name]`        | public                                                       | no                      | manifest allowlist + file-name pattern              |
| `GET /api/jobs`                  | own jobs (account or `ex_owner` cookie), or `?parent=` clips | no                      | none                                                |
| `POST /api/jobs`                 | 401 without a session                                        | per-IP + hourly + daily | JSON, link ≤ 2048 chars, URL/topic checks           |
| `GET /api/jobs/[id]`             | read by id, server fields stripped                           | no                      | id is a map lookup, never a path                    |
| `GET /api/jobs/[id]/file/[name]` | public read                                                  | no                      | id + name patterns, `job.json` excluded             |
| `POST /api/jobs/[id]/followup`   | 401 without a session                                        | per-IP + hourly + daily | JSON, component/`10x`/`100x` shape before claim     |
| `POST /api/jobs/[id]/explain`    | 401 without a session                                        | per-IP                  | JSON, component id pattern, spend budget            |
| `POST /api/voice/token`          | localhost + 401 without a session                            | per-IP                  | no body                                             |
| `POST /api/voice/turn`           | localhost + 401 without a session                            | per-IP + hourly + daily | JSON, 30 turns ≤ 2000 chars, typed link validated   |
| `GET /api/voice/speak`           | localhost + 401 without a session                            | per-IP                  | `text` param ≤ 400 chars, voice budget              |
| `POST /api/client-error`         | public by design (signed-out pages report too)               | per-IP                  | 4 KB JSON, message/digest/path lengths + path shape |
| `GET /api/auth/[...all]`         | Better Auth's own session cookies                            | OTP send/verify limits  | Better Auth + Turnstile on send (see below)         |
| `POST /api/auth/[...all]`        | Better Auth's own session cookies                            | OTP send/verify limits  | Better Auth + Turnstile on send (see below)         |
| `GET /api/admin/users`           | 404 unless an admin (see below)                              | per-IP                  | none                                                |
| `GET /api/admin/videos`          | 404 unless an admin                                          | per-IP                  | none                                                |
| `GET /api/admin/usage`           | 404 unless an admin                                          | per-IP                  | none                                                |
| `GET /api/admin/spend`           | 404 unless an admin                                          | per-IP                  | none                                                |
| `GET /api/admin/errors`          | 404 unless an admin                                          | per-IP                  | none                                                |
| `GET /api/admin/health`          | 404 unless an admin                                          | per-IP                  | none                                                |
| `POST /api/admin/limits`         | 404 unless an admin                                          | per-IP                  | JSON, account email + whole number 0–1000           |

Notes:

- **Sign-in** (`/api/auth/*`) is Better Auth's email-OTP plugin only: sending a code costs
  5 per IP per 10 minutes and 5 per address per hour plus a Turnstile check; verifying costs
  10 per IP per 10 minutes. Trusted origins are the app's own base URL.
- **Admin** (`/admin`, `/api/admin/*`) answers 404 — never 403 — unless sign-in is on and
  the signed-in address is in `EXPLANIMATE_ADMIN_EMAILS` (comma list, case-insensitive).
  The check runs on the server for every route and for the page.
- **Reads stay open**: the landing page, gallery, `/docs`, `/api/health` and job reads work
  without an account, with or without sign-in turned on.
- **Jobs list** (`GET /api/jobs`) returns only the caller's own jobs: the signed-in account's,
  or the ones started from this browser (an HttpOnly `ex_owner` cookie set on the first
  video). A stranger gets `[]`. `?parent=<id>` lists that video's follow-up clips without
  their input or cost. A job read by id never carries CLI arguments, paths or the owner key.
- **Voice** answers only on localhost (`lib/local.ts`): every host and forwarded address
  must be loopback, so a tunnel or proxy is refused.
- **Job ids and paths**: `[id]` is looked up in memory, never joined into a path; file
  names must match `^[\w.-]+$` (and gallery names must be listed in the manifest), so no
  traversal reaches the disk.

## Abuse and budget checks

- Per-IP limits on every mutating or costly endpoint (`EXPLANIMATE_REQ_PER_MIN`, default 12).
- Per-user daily video quota when sign-in is on (default 3, overridable per account), claimed
  atomically so parallel requests cannot both pass; the global hourly cap, spend caps and
  daily cap apply either way.
- Prompt caps: the create box and voice typed links at 2048 characters, voice turns at 30 of
  2000 characters, follow-up fields at 60/8 characters with shape checks.
- Private links are refused everywhere by default (see `deploy.md`).

## Data and secrets

- All D1 SQL uses bound parameters (`lib/db.ts`, `lib/usage.ts`, `lib/errors.ts`,
  `lib/admin.ts`): values travel in `params`, never in the statement text. The only
  statement built in code is the `videos` column migration, from constant strings.
- Logs (`lib/log.ts`) are structured JSON on stdout. Emails are masked, and tokens, codes,
  cookies, secrets and passwords are redacted — in free text and under matching keys.
- API keys are read only in server code; a test fails if a client component touches
  `process.env` or a key. The browser learns only public values through `/api/auth-config`
  (Turnstile site key) and `/api/runtime-config` (GA id).
- Errors persist to the D1 `errors` table when D1 is configured (rows older than 14 days
  are pruned), otherwise to an in-memory ring of 200. `/api/health` exposes only the
  24-hour count; details live in the admin portal.
