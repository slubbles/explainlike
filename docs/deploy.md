# Running Explanimate on a server

> Current state (Nov 3, 2026): production is the Tokyo VPS running the old `explainlike` container built from commit a5100c3 (before the rename, queue, gallery, Skia and OpenRouter). Today's main is **not** deployed. See [AGENTS.md](../AGENTS.md#deployment).

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
{"ok":true,"checks":{"ffmpeg":true,"chrome":true,"modelKey":true,"voiceKey":true,"jobsDir":true},"paused":false,"problems":[]}
```

- Keys appear only as `true` or `false`, never their values.
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

## Point explanimate.co at it

explanimate.co is bought, but its DNS is on hold until the user says to point it. When they do, add these records at the registrar or DNS host:

| Host | Railway | Fly.io | VPS |
| --- | --- | --- | --- |
| `explanimate.co` | `ALIAS`/`ANAME` (or `CNAME` with flattening) to the target Railway gives under Settings → Domains | `A` and `AAAA` from `fly ips list` | `A` (and `AAAA`) to the server's IP |
| `www` | `CNAME` to the same Railway target | `CNAME` to `explanimate.fly.dev` | `CNAME` to `explanimate.co` |

Then:

1. Add both names on the host: Settings → Domains on Railway, `fly certs add explanimate.co` and `fly certs add www.explanimate.co` on Fly, or the Caddyfile above on a VPS.
2. Wait for the certificate. `fly certs show explanimate.co` or the Railway domain page shows when it is issued.
3. Check `https://explanimate.co/api/health` returns `200`.

A plain `CNAME` is not allowed on the bare domain, which is why Railway needs `ALIAS`, `ANAME` or CNAME flattening there. Cloudflare flattens by default. If you use Cloudflare's proxy (orange cloud), set SSL to "Full (strict)".

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

The project used to be called Explain Like. Settings with the old `EXPLAINLIKE_` prefix still work: each one is copied to its `EXPLANIMATE_` name at startup, unless the new name is set too (then the new one wins). Rename them when it is convenient.

| Variable | Default | What it does |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | (optional) | OpenRouter key. When set, planning and voice mode use Muse Spark 1.3 through OpenRouter. Read only on the server. |
| `MODEL_API_KEY` | (required without an OpenRouter key) | Meta Muse key: Muse Spark when there is no OpenRouter key, and always doodle icons and the voiceover check. Read only on the server. |
| `EXPLANIMATE_LLM_PROVIDER` | `openrouter` if its key is set, else `meta` | Which service runs Muse Spark. The health check asks for that service's key. |
| `DEEPGRAM_API_KEY` | (optional) | Voiceover and voice mode. Read only on the server. |
| `EXPLANIMATE_META_CAP_USD` | 25 | New work pauses before Muse spend (OpenRouter or Meta) could pass this amount. |
| `EXPLANIMATE_VOICE_CAP_USD` | 10 | New work pauses before Deepgram spend could pass this amount. |
| `EXPLANIMATE_REQ_PER_MIN` | 12 | Per-IP limit on the routes that start work or cost money. |
| `EXPLANIMATE_JOBS_PER_HOUR` | 20 | Videos per hour across everyone. |
| `EXPLANIMATE_TRUST_PROXY` | 0 | Trust `X-Forwarded-For` for the client IP. |
| `EXPLANIMATE_CONCURRENCY` | 10 | Videos rendered at once. Past that, new videos wait their turn (first in, first out) and their page shows the first step in progress; nobody is turned away for being busy. Each render is a Chromium plus ffmpeg, so size this to the machine. |
| `EXPLANIMATE_QUEUE_MAX` | 200 | Safety ceiling on videos waiting for a slot. Only past this is a request refused ("very busy"). |
| `EXPLANIMATE_WAIT_IDLE_S` | 120 | A waiting video whose page has not polled for this long (the tab was closed) is dropped before it starts. |
| `EXPLANIMATE_DEMO_ONLY` | 0 | Show the finished examples only and refuse new videos. |
| `EXPLANIMATE_RESUME` | 1 | After a restart, start the job it cut off once more, if it is under 6 hours old. |
| `EXPLANIMATE_JOBS_DIR` | `explainlike-out/web` (`/data/jobs` in Docker) | Where jobs and the spend ledger live. Must be on a persistent disk. |
| `EXPLANIMATE_GALLERY_DIR` | unset (`/data/gallery` in Docker) | Folder of example videos and their `gallery.json`. Unset or empty: no examples. |
| `EXPLANIMATE_ALLOW_LOCAL` | 0 | Accept folder paths on the server. Leave off in public. |
| `EXPLANIMATE_ALLOW_PRIVATE_URLS` | 0 | Read links that resolve to private addresses. Leave off in public; set to 1 (or pass `--allow-private` to the CLI) only to read a local intranet. A host whose DNS hands out proxy addresses (198.18.0.0/15, as some sandboxes and "fake-IP" proxies do) fails every link with the guard on; give such a host real DNS rather than turning the guard off. |

## What is already guarded

- **Spend.** Each job records its Meta and Deepgram cost. Voice chat, speech and box explanations are added to `spend.jsonl` in the jobs folder. A warning appears past 80% of a cap. New work stops while the cap is less than one job's reserve away, and each render running at once holds back its own reserve, so a busy server starts waiting videos only as the budget allows.
- **Rate and size.** Each IP is rate-limited. JSON bodies are capped at 16 KB (96 KB for voice turns), and links at 2,048 characters. Repos over the clone limit, private repos, and pages over 5 MB are refused with a plain message.
- **Keys.** API keys are read only in server code. A test fails if a client component touches `process.env` or an API key.
- **Private networks.** A link, and every redirect from it, must resolve to a public address. Links to localhost, private ranges or the cloud metadata address (169.254.169.254) are refused.
- **Voice mode** only answers requests to localhost.
- **Failures.** Muse and Deepgram calls retry with backoff and time out. Errors name the service and the setting to check, and never print the key.

## Still to do before a public launch

- The spend guard counts what this server spent. It does not know about other use of the same keys, so set the caps on the provider dashboards as well.
- The rate limit is in memory, on one process. Use a shared store if you run more than one instance.
- Voice mode has no login. Keep it local, or add auth before you open it up.
- There is no sign-in or per-user quota.
- The private-address check resolves the name, then fetches. A DNS server that answers differently the second time could still slip through (DNS rebinding). Pinning the checked address in the connection needs the `undici` package. Until then, block the metadata address and your private ranges in the host's firewall as well.
- Chromium loads images named in a page's card (avatars, preview images) without that check. It can only show them as pictures, but a firewall rule covers it too.
- `/api/jobs` still lists the newest jobs to anyone who asks. The home page no longer shows them, but the list and each job are readable by id. Limit it to the caller (or turn it off) before a public launch.
- The GitHub Actions in CI still run on Node 20 and print deprecation notices. Move `actions/checkout`, `pnpm/action-setup` and `actions/setup-node` to their latest majors.
