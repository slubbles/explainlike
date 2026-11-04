# Running Explanimate on a server

> This page covers any host: your own server, Railway, Fly.io, or plain Docker behind Caddy or Cloudflare.

Explanimate is built to run on your own machine. This page is what to check before you put the web app anywhere other people can reach it. Nothing here deploys anything for you.

## What the server needs

- Node 22 and pnpm 9.
- `ffmpeg` on the PATH.
- Chrome or Chromium. Set `EXPLANIMATE_CHROME` if it is not in a standard place.
- A persistent disk for jobs (`EXPLANIMATE_JOBS_DIR`). Each video is about 20 MB plus its boards.
- About 2 CPU cores and 2 GB of memory per render. Up to 10 videos render at once by default (`EXPLANIMATE_CONCURRENCY`); past that, new videos wait their turn.

A video takes 3 to 6 minutes and runs as a child process. That does not fit serverless functions with short time limits. Use a VM or a container with a disk instead.

## Run it in Docker

The [`Dockerfile`](../Dockerfile) at the repo root builds one image with Node 22, pnpm, Chromium, ffmpeg and git. Everything the server writes goes to a volume at `/data`: jobs, the spend ledger, and the repo, plan, voice and icon caches. Without that volume, a restart loses every video and resets the spend count, which also resets the spend guard.

```bash
docker build -t explanimate .
docker run -d --name explanimate --restart unless-stopped -p 127.0.0.1:3000:3000 \
  -v explanimate-data:/data \
  -e OPENROUTER_API_KEY -e MODEL_API_KEY -e DEEPGRAM_API_KEY \
  -e EXPLANIMATE_TRUST_PROXY=1 \
  explanimate
curl -s localhost:3000/api/health
```

`-e MODEL_API_KEY` with no value passes the key from your shell, so it never lands in your shell history. With `OPENROUTER_API_KEY` set, Muse Spark runs through OpenRouter; `MODEL_API_KEY` is still used for doodle icons and the voiceover check.

### Health check

`GET /api/health` answers `200` when a video can be made and `503` when it cannot:

```json
{
  "ok": true,
  "checks": { "ffmpeg": true, "chrome": true, "modelKey": true, "voiceKey": true, "jobsDir": true },
  "paused": false,
  "problems": [],
  "fallbacks": { "llm": true, "tts": false },
  "errors24h": 0
}
```

- Keys appear only as `true` or `false`, never their values.
- `fallbacks` says which backup AI services are configured: OpenRouter for Meta Muse calls, Cartesia for Deepgram narration.
- `errors24h` counts errors in the last 24 hours. No error details are public; they live in the admin portal.
- `modelKey` is the key for the Muse Spark provider in use: `OPENROUTER_API_KEY` on OpenRouter, `MODEL_API_KEY` on Meta.
- `voiceKey: false` is not a failure. Videos then render silent with captions.
- `paused: true` means demo-only mode is on or a spend cap is reached. The server is still healthy.
- The image runs this check every 30 seconds. Point your host's health check at the same path.

### Example videos

The home page and `/gallery` show the videos in the gallery folder (`/data/gallery` in Docker), never
the jobs visitors made. The folder holds the mp4s, a poster image for each and a `gallery.json` that lists
them in order; [`gallery.example.json`](gallery.example.json) shows the fields. Only files the manifest
names are served. With no folder or no manifest, the page hides the examples.

The videos are not in git. Copy the folder onto the volume. The list is read on every request, so no
restart is needed:

```bash
docker cp ./explanimate-gallery/. explanimate:/data/gallery/
```

To make a poster for a new video, take a frame a little past the middle:

```bash
ffmpeg -ss 50 -i video.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 3 video.jpg
```

Encode videos with `-movflags +faststart` so they start playing before they finish loading.

## Behind Caddy

If a Caddy instance already owns ports 80 and 443, keep the container on loopback and
give it a hostname of its own. Caddy gets the certificate itself.

```caddyfile
explanimate.example.com {
	encode zstd gzip
	handle {
		reverse_proxy 127.0.0.1:3001
	}
}
```

Run the container with `-p 127.0.0.1:3001:3000` so nothing is reachable except through
the proxy. Reload with `systemctl reload caddy`, or `caddy reload --config
/etc/caddy/Caddyfile` if Caddy runs as a service you do not restart.

### The volume is owned by root the first time

`docker run -v explanimate-data:/data` creates the volume owned by root, so the health
check reports `jobsDir: false` and the server refuses to start a render. Once, after the
first run:

```bash
docker run --rm -v explanimate-data:/data --user 0 explanimate \
  sh -c 'mkdir -p /data/jobs && chown -R 1000:1000 /data'
```

## Pick a host

A render needs about 2 CPU cores, 2 GB of memory and 3 to 6 minutes. Pick a plan with that much, and one machine. The rate limit lives in memory, so two machines would each allow the full rate.

### Railway

1. Create a project from the GitHub repo. Railway finds the `Dockerfile`.
2. Add a volume and mount it at `/data`.
3. Under Variables, add `OPENROUTER_API_KEY`, `MODEL_API_KEY`, `DEEPGRAM_API_KEY` and `EXPLANIMATE_TRUST_PROXY=1`. Railway sets `PORT` itself.
4. Under Settings, set the health check path to `/api/health`.
5. Keep replicas at 1.

### Fly.io

```toml
# fly.toml
app = "explanimate"
primary_region = "sin"

[build]
  dockerfile = "Dockerfile"

[env]
  EXPLANIMATE_TRUST_PROXY = "1"

[mounts]
  source = "explanimate_data"
  destination = "/data"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"   # a stopped machine kills a render in progress
  min_machines_running = 1

[[http_service.checks]]
  method = "GET"
  path = "/api/health"
  interval = "30s"
  timeout = "10s"
  grace_period = "30s"

[[vm]]
  size = "shared-cpu-2x"
  memory = "2gb"
```

```bash
fly volumes create explanimate_data --size 10
fly secrets set OPENROUTER_API_KEY=... MODEL_API_KEY=... DEEPGRAM_API_KEY=...
fly deploy
```

Run `fly scale count 1` so there is one machine.

### Your own server (VPS)

Run the container as above, and put Caddy in front for TLS:

```
# /etc/caddy/Caddyfile
explanimate.co, www.explanimate.co {
  reverse_proxy 127.0.0.1:3000
}
```

Caddy gets and renews the certificate itself and sets `X-Forwarded-For`, so `EXPLANIMATE_TRUST_PROXY=1` is right here. The `docker run` above publishes the port on `127.0.0.1` only, so nobody can skip the proxy and fake the header. Keep it that way.

## Point your domain at it

Add these records for your domain at your registrar or DNS host (using explanimate.co as the example):

| Host             | Railway                                                                                             | Fly.io                             | VPS                                 |
| ---------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------- |
| `explanimate.co` | `ALIAS`/`ANAME` (or `CNAME` with flattening) to the target Railway gives under Settings â†’ Domains | `A` and `AAAA` from `fly ips list` | `A` (and `AAAA`) to the server's IP |
| `www`            | `CNAME` to the same Railway target                                                                  | `CNAME` to `explanimate.fly.dev`   | `CNAME` to `explanimate.co`         |

Then:

1. Add both names on the host: Settings â†’ Domains on Railway, `fly certs add explanimate.co` and `fly certs add www.explanimate.co` on Fly, or the Caddyfile above on a VPS.
2. Wait for the certificate. `fly certs show explanimate.co` or the Railway domain page shows when it is issued.
3. Check `https://explanimate.co/api/health` returns `200`.

A plain `CNAME` is not allowed on the bare domain, which is why Railway needs `ALIAS`, `ANAME` or CNAME flattening there. Cloudflare flattens by default. If you use Cloudflare's proxy (orange cloud), set SSL to "Full (strict)".

## Cloudflare in front

With the domain on Cloudflare, the edge and the server each do one job. Cloudflare handles TLS to
visitors, caching, the firewall and rate limits. The server runs the app behind Caddy and only
answers on 443 with a real certificate.

| Setting              | Value                                                                | Why                                                         |
| -------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| DNS `@` and `www`    | Proxied (orange cloud)                                               | Visitors never see the server's address                     |
| SSL/TLS mode         | Full (strict)                                                        | Caddy's Let's Encrypt certificate is checked, not just used |
| Always Use HTTPS     | On                                                                   | Plain `http://` links redirect at the edge                  |
| Minimum TLS          | 1.2                                                                  | Old protocol versions are refused                           |
| HSTS                 | On, 6 months, no subdomains, no preload, `nosniff`                   | Browsers stop trying plain HTTP                             |
| Bot Fight Mode       | On                                                                   | Known bad bots are challenged before they reach the app     |
| Cache rule           | `/api/*` not cached, except `/api/gallery/*` images and videos       | Job and account answers are never shared between visitors   |
| Rate limit rule      | Non-GET `/api/*`: 20 requests per 10 s per IP, then blocked for 10 s | A cheap first wall in front of the app's own per-IP limits  |
| Custom firewall rule | Block `.env`, `.git`, `wp-`, `.php`, `phpmyadmin`, `cgi-bin` paths   | Scanner noise never reaches the server                      |

`/_next/static/*` is cached by default (Next sends `immutable`), and HTML is not, because every page
carries a fresh CSP nonce. Check it with:

```bash
curl -sI https://example.com/_next/static/chunks/<any>.js | grep -i cf-cache-status   # HIT
curl -sI https://example.com/api/health | grep -i cf-cache-status                     # DYNAMIC
curl -sI https://example.com/ | grep -i strict-transport-security
```

The Bot Fight Mode challenge can also catch scripts and uptime checkers that call the site through
Cloudflare. Check health on the server itself (`curl http://127.0.0.1:3000/api/health`), as the deploy
workflow below does.

## Deploy from GitHub Actions

`.github/workflows/deploy.yml` deploys `main` after CI passes on it, or by hand from the Actions tab.
It stays off until you set it up:

1. On the server, make a deploy script that pulls, rebuilds and checks health, for example
   `/root/deploy-from-ci.sh`:

   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   bash /root/deploy-explanimate.sh          # your existing pull + docker build + restart
   chown -R 1000:1000 /var/lib/docker/volumes/explanimate-data/_data
   for i in $(seq 1 30); do
     curl -fsS http://127.0.0.1:3000/api/health | grep -q '"ok":true' && { echo healthy; exit 0; }
     sleep 2
   done
   echo "health check failed" >&2; exit 1
   ```

2. Make a key pair used only for this (`ssh-keygen -t ed25519 -f explanimate-deploy -N ""`) and add
   the public half to the server's `~/.ssh/authorized_keys` with a forced command, so the key can run
   the deploy and nothing else:

   ```text
   command="/root/deploy-from-ci.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... explanimate-deploy
   ```

3. In the GitHub repository, under Settings → Secrets and variables → Actions, add the secrets
   `DEPLOY_SSH_KEY` (the private half), `DEPLOY_HOST` (`root@your-server`) and `DEPLOY_KNOWN_HOSTS`
   (the output of `ssh-keyscan your-server`), then the variable `DEPLOY_ENABLED` = `true`.
   Optionally add required reviewers to the `production` environment the job uses.

Delete the key pair from your computer once the private half is in GitHub. No key ever goes in the
repository.

## Build and start without Docker

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test
pnpm --filter @explanimate/web build
cd apps/web && pnpm start          # port 3000
```

Put it behind a reverse proxy that terminates TLS and sets `X-Forwarded-For`. Then set `EXPLANIMATE_TRUST_PROXY=1`. Without that setting, the per-IP limit treats every caller as one address. That is safe, but strict.

## Settings

Every setting is listed with its default in [`.env.example`](../.env.example). The ones that matter in public are:

The project used to be called Explain Like. Settings with the old `EXPLAINLIKE_` prefix still work: each one is copied to its `EXPLANIMATE_` name at startup, unless the new name is set too (then the new one wins). Rename them when it is convenient. Folders from before the rename (`explainlike-out`, `~/explainlike-videos`, `~/.cache/explainlike`) are likewise still used when the new ones do not exist.

| Variable                         | Default                                        | What it does                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`             | (optional)                                     | OpenRouter key. When set, planning and voice mode use Muse Spark 1.3 through OpenRouter. Read only on the server.                                                                                                                                                                                                                                         |
| `MODEL_API_KEY`                  | (required without an OpenRouter key)           | Meta Muse key: Muse Spark when there is no OpenRouter key, and always doodle icons and the voiceover check. Read only on the server.                                                                                                                                                                                                                      |
| `EXPLANIMATE_LLM_PROVIDER`       | `openrouter` if its key is set, else `meta`    | Which service runs Muse Spark. The health check asks for that service's key.                                                                                                                                                                                                                                                                              |
| `DEEPGRAM_API_KEY`               | (optional)                                     | Voiceover and voice mode. Read only on the server.                                                                                                                                                                                                                                                                                                        |
| `EXPLANIMATE_META_CAP_USD`       | 25                                             | New work pauses before Muse spend (OpenRouter or Meta) could pass this amount.                                                                                                                                                                                                                                                                            |
| `EXPLANIMATE_VOICE_CAP_USD`      | 10                                             | New work pauses before Deepgram spend could pass this amount.                                                                                                                                                                                                                                                                                             |
| `EXPLANIMATE_REQ_PER_MIN`        | 12                                             | Per-IP limit on the routes that start work or cost money.                                                                                                                                                                                                                                                                                                 |
| `EXPLANIMATE_JOBS_PER_HOUR`      | 20                                             | Videos per hour across everyone.                                                                                                                                                                                                                                                                                                                          |
| `EXPLANIMATE_TRUST_PROXY`        | 0                                              | Trust `X-Forwarded-For` for the client IP.                                                                                                                                                                                                                                                                                                                |
| `EXPLANIMATE_CONCURRENCY`        | 10                                             | Videos rendered at once. Past that, new videos wait their turn (first in, first out) and their page shows the first step in progress; nobody is turned away for being busy. Each render is a Chromium plus ffmpeg, so size this to the machine.                                                                                                           |
| `EXPLANIMATE_QUEUE_MAX`          | 200                                            | Safety ceiling on videos waiting for a slot. Only past this is a request refused ("very busy").                                                                                                                                                                                                                                                           |
| `EXPLANIMATE_WAIT_IDLE_S`        | 120                                            | A waiting video whose page has not polled for this long (the tab was closed) is dropped before it starts.                                                                                                                                                                                                                                                 |
| `EXPLANIMATE_DEMO_ONLY`          | 0                                              | Show the finished examples only and refuse new videos.                                                                                                                                                                                                                                                                                                    |
| `EXPLANIMATE_RESUME`             | 1                                              | After a restart, start the job it cut off once more, if it is under 6 hours old.                                                                                                                                                                                                                                                                          |
| `EXPLANIMATE_JOBS_DIR`           | `explanimate-out/web` (`/data/jobs` in Docker) | Where jobs and the spend ledger live. Must be on a persistent disk.                                                                                                                                                                                                                                                                                       |
| `EXPLANIMATE_GALLERY_DIR`        | unset (`/data/gallery` in Docker)              | Folder of example videos and their `gallery.json`. Unset or empty: no examples.                                                                                                                                                                                                                                                                           |
| `EXPLANIMATE_ALLOW_LOCAL`        | 0                                              | Accept folder paths on the server. Leave off in public.                                                                                                                                                                                                                                                                                                   |
| `EXPLANIMATE_ALLOW_PRIVATE_URLS` | 0                                              | Read links that resolve to private addresses. Leave off in public; set to 1 (or pass `--allow-private` to the CLI) only to read a local intranet. A host whose DNS hands out proxy addresses (198.18.0.0/15, as some sandboxes and "fake-IP" proxies do) fails every link with the guard on; give such a host real DNS rather than turning the guard off. |
| `GA_MEASUREMENT_ID`              | (optional)                                     | Google Analytics 4 id (`G-…`). When set, pages load gtag.js with IP anonymization and report page views plus `video_create`, `video_finished`, `video_failed`, `signin_code_sent` and `signin_success` events; when unset, nothing from Google loads.                                                                                                     |

## Sign-in by email code (optional)

Making a video can ask for an account first: the visitor enters their email, passes a Turnstile
check, and signs in with a 6-digit code (valid 10 minutes, 5 tries). Sessions last 7 days. Each
account gets 3 videos a day by default. The landing page, gallery and `/docs` stay open without
an account.

Set `EXPLANIMATE_AUTH_ENABLED=1` — only the exact value `1` turns it on; unset or anything else
is today's behaviour (no sign-in, no per-account limit; the per-IP limits and spend caps still
apply) — plus:

| Variable                          | Default                              | What it does                                                                                                                 |
| --------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`              | (required)                           | Random secret for session cookies (`openssl rand -base64 32`).                                                               |
| `BETTER_AUTH_URL`                 | `http://localhost:3000`              | Public base URL of the app (`https://explanimate.co` in production); also the trusted origin.                                |
| `EXPLANIMATE_CF_ACCOUNT_ID`       | (required)                           | Cloudflare account id for D1 and Email.                                                                                      |
| `EXPLANIMATE_D1_DATABASE_ID`      | (required)                           | D1 database holding accounts, sessions and usage. Tables are created on first use.                                           |
| `EXPLANIMATE_D1_TOKEN`            | (required)                           | API token with D1 read and write on that database.                                                                           |
| `EXPLANIMATE_CF_EMAIL_TOKEN`      | (required)                           | API token allowed to send through Cloudflare Email Service.                                                                  |
| `EXPLANIMATE_EMAIL_FROM`          | `Explanimate <login@explanimate.co>` | Sender line for login codes, `Name <addr>`.                                                                                  |
| `EXPLANIMATE_TURNSTILE_SITE_KEY`  | (required, public)                   | Turnstile site key, shown on the sign-in form.                                                                               |
| `EXPLANIMATE_TURNSTILE_SECRET`    | (required)                           | Turnstile secret for checking tokens.                                                                                        |
| `EXPLANIMATE_TURNSTILE_HOSTNAMES` | (required)                           | Comma list of hostnames a token must come from.                                                                              |
| `EXPLANIMATE_DAILY_VIDEOS`        | 3                                    | Videos per account per UTC day.                                                                                              |
| `EXPLANIMATE_DAILY_CAP_USD`       | 3                                    | Combined Meta + voice cap per UTC day; works whether sign-in is on or off.                                                   |
| `EXPLANIMATE_ADMIN_EMAILS`        | (empty)                              | Comma list of admin addresses (case-insensitive). Listed accounts get the `/admin` portal. `ADMIN_EMAILS` works as an alias. |

Sending a code is limited to 5 per IP per 10 minutes and 5 per address per hour; verifying to
10 per IP per 10 minutes. To give one account its own daily limit (after it signs in once):

```bash
pnpm set-user-limit somebody@example.com 10
```

With `EXPLANIMATE_ADMIN_EMAILS` set, a listed account that signs in gets the `/admin` portal:
jobs with wait, render time, video length and cost, timing medians, users, videos, usage per day,
spend, per-user limits, recent errors (failed renders included) and health. To anyone else
`/admin` and `/api/admin/*` answer 404. The per-route checks are audited in
[`security.md`](security.md).

## What is already guarded

- **Spend.** Each job records its Meta and Deepgram cost. Voice chat, speech and box explanations are added to `spend.jsonl` in the jobs folder. A warning appears past 80% of a cap. New work stops while the cap is less than one job's reserve away, and each render running at once holds back its own reserve, so a busy server starts waiting videos only as the budget allows.
- **Rate and size.** Each IP is rate-limited. JSON bodies are capped at 16 KB (96 KB for voice turns), and links at 2,048 characters. Repos over the clone limit, private repos, and pages over 5 MB are refused with a plain message.
- **Requests.** POSTs with a cross-origin `Origin` header get a 403, stated non-JSON content types a 415. Every response carries a strict Content Security Policy (with a per-request nonce), HSTS, `nosniff`, a tight referrer and permissions policy, and frame denial. See [`security.md`](security.md) for the per-route audit.
- **Errors.** Structured JSON logs scrub emails, tokens, codes and cookies. Every finished job logs one line with its wait, render and total time and its cost. Errors persist to D1 (or an in-memory ring without it) for the admin portal; `/api/health` shows only the 24-hour count.
- **Keys.** API keys are read only in server code. A test fails if a client component touches `process.env` or an API key.
- **Private networks.** A link, and every redirect from it, must resolve to a public address. Links to localhost, private ranges or the cloud metadata address (169.254.169.254) are refused.
- **Voice mode** only answers requests to localhost.
- **Failures.** Muse and Deepgram calls retry with backoff and time out. Errors name the service and the setting to check, and never print the key.

## Still to do before a public launch

- The spend guard counts what this server spent. It does not know about other use of the same keys, so set the caps on the provider dashboards as well.
- The rate limit is in memory, on one process. Use a shared store if you run more than one instance.
- Voice mode only answers on localhost. Its routes ask for a sign-in too when `EXPLANIMATE_AUTH_ENABLED=1`.
- Sign-in and the per-account daily quota exist but are off by default; turn them on with `EXPLANIMATE_AUTH_ENABLED=1` before a public launch.
- The private-address check resolves the name, then fetches. A DNS server that answers differently the second time could still slip through (DNS rebinding). Pinning the checked address in the connection needs the `undici` package. Until then, block the metadata address and your private ranges in the host's firewall as well.
- Chromium loads images named in a page's card (avatars, preview images) without that check. It can only show them as pictures, but a firewall rule covers it too.
- Each job is readable by anyone who has its id (the share link). Ids are 12 random hex characters; tie jobs to accounts if links should be private.
- The GitHub Actions in CI still run on Node 20 and print deprecation notices. Move `actions/checkout`, `pnpm/action-setup` and `actions/setup-node` to their latest majors.
