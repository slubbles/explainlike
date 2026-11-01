# Running Explain Like on a server

Explain Like is built to run on your own machine. This page is what to check before you put the web app anywhere other people can reach it. Nothing here deploys anything for you.

## What the server needs

- Node 22 and pnpm 9.
- `ffmpeg` on the PATH.
- Chrome or Chromium. Set `EXPLAINLIKE_CHROME` if it is not in a standard place.
- A persistent disk for jobs (`EXPLAINLIKE_JOBS_DIR`). Each video is about 20 MB plus its boards.
- About 2 CPU cores and 2 GB of memory per render. One video renders at a time.

A video takes 3 to 6 minutes and runs as a child process. That does not fit serverless functions with short time limits. Use a VM or a container with a disk instead.

## Build and start

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test
pnpm --filter @explainlike/web build
cd apps/web && pnpm start          # port 3000
```

Put it behind a reverse proxy that terminates TLS and sets `X-Forwarded-For`. Then set `EXPLAINLIKE_TRUST_PROXY=1`. Without that setting, the per-IP limit treats every caller as one address. That is safe, but strict.

## Settings

Every setting is listed with its default in [`.env.example`](../.env.example). The ones that matter in public are:

| Variable | Default | What it does |
| --- | --- | --- |
| `MODEL_API_KEY` | (required) | Meta Muse key. Read only on the server. |
| `DEEPGRAM_API_KEY` | (optional) | Voiceover and voice mode. Read only on the server. |
| `EXPLAINLIKE_META_CAP_USD` | 25 | New work pauses before Meta spend could pass this amount. |
| `EXPLAINLIKE_VOICE_CAP_USD` | 3 | New work pauses before Deepgram spend could pass this amount. |
| `EXPLAINLIKE_REQ_PER_MIN` | 12 | Per-IP limit on the routes that start work or cost money. |
| `EXPLAINLIKE_JOBS_PER_HOUR` | 20 | Videos per hour across everyone. |
| `EXPLAINLIKE_TRUST_PROXY` | 0 | Trust `X-Forwarded-For` for the client IP. |
| `EXPLAINLIKE_DEMO_ONLY` | 0 | Show the finished examples only and refuse new videos. |
| `EXPLAINLIKE_RESUME` | 1 | After a restart, start the job it cut off once more, if it is under 6 hours old. |

## What is already guarded

- **Spend.** Each job records its Meta and Deepgram cost. Voice chat, speech and box explanations are added to `spend.jsonl` in the jobs folder. A warning appears past 80% of a cap. New work stops while the cap is less than one job's reserve away.
- **Rate and size.** Each IP is rate-limited. JSON bodies are capped at 16 KB (96 KB for voice turns), and links at 2,048 characters. Repos over the clone limit, private repos, and pages over 5 MB are refused with a plain message.
- **Keys.** API keys are read only in server code. A test fails if a client component touches `process.env` or an API key.
- **Voice mode** only answers requests to localhost.
- **Failures.** Muse and Deepgram calls retry with backoff and time out. Errors name the service and the setting to check, and never print the key.

## Still to do before a public launch

- The spend guard counts what this server spent. It does not know about other use of the same keys, so set the caps on the provider dashboards as well.
- The rate limit is in memory, on one process. Use a shared store if you run more than one instance.
- Voice mode has no login. Keep it local, or add auth before you open it up.
- There is no sign-in or per-user quota.
