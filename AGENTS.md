# Working on Explain Like

Explain Like turns a GitHub repo, an X post, an article or a plain topic into a narrated, hand-drawn whiteboard explainer video (mp4), plus `.tldr` and `.excalidraw` boards. It's built for the Meta Global AI Developer Hackathon (deadline Thu Nov 5, 10:00 AM Manila) on Meta Muse models.

## Layout
- `packages/ingest`: fetches repos, articles, X posts and cited sources for plain topics. Has an SSRF guard, size limits and timeouts.
- `packages/planner`: brief, architecture map and review, scene plan, self-check, narration polish, broken-sentence check, and validators that check names and arrows against the code.
- `packages/models`: Meta Model API client (`muse-spark-1.3-contributor`, `https://api.meta.ai/v1`) with timeouts and retries.
- `packages/voice`: Deepgram Aura text to speech and the voiceover check.
- `packages/render`: roughjs drawing in headless Chrome, frame streaming into ffmpeg, the placement check, the frame check, cut-ins (charts, timelines, maps from Natural Earth), the music bed and sound effects.
- `packages/core`: shared types, schemas, pacing rules and figures.
- `packages/cli`: `pnpm explainlike <link or topic>`.
- `packages/api`: local job API on 127.0.0.1:7311 (`/v1/jobs`).
- `packages/mcp`: the `/explainlike` MCP server (`explain`, `explain_status`, `explain_cancel`).
- `apps/web`: Next.js 16 web app with voice mode (Deepgram STT, Muse reply, Aura speech; localhost only).
- `docs/explaining-playbook.md`: how the engine scripts videos, drawn from the channels the user likes. `docs/deploy.md`: hosting notes.

## Commands
- `pnpm install`, `pnpm typecheck`, `pnpm test` (it must end with `# fail 0`), and `pnpm web` (dev server on port 3000).
- On Windows, set `EXPLAINLIKE_CHROME` to Chrome's path. Keys go in `apps/web/.env.local`, which is gitignored; `.env.example` lists every setting.
- CI (`.github/workflows/ci.yml`) runs the typecheck, tests and web build on every push to main.

## Rules
- Never print, commit or send API keys to a model. Don't read `.env` files into prompts.
- Spend caps: $25 on Meta and $3 on Deepgram. The app's spend guard warns at 80%. Reuse cached plans and voice when re-rendering.
- Don't run Muse Code on client repos (for example ACC). Test with public repos or topics.
- Push straight to main with small, meaningful commits. Each commit has a subject in the form `type(scope): plain-language subject`, then a blank line, one plain sentence on what was wrong or why, and plain bullets of what changed.
- Keep quality high. Don't trade quality for speed. Keep the UI clean, light and restrained, with Inter and brand colors only.
- Don't deploy publicly without the user's OK. The domain explainlike.co isn't bought yet.

## Where things stand (Nov 1, 6:30 PM Manila)
- 212 commits, 210+ tests, CI green.
- A fresh repo run takes about 2:50 and a cached re-render about 30 s.
- Spend so far is about $6.30 on Meta and about $1.90 on Deepgram.
- Samples are in the Google Drive folder "Explain Like samples" (microui v8, Silk Road v3, DNS, how the internet grew, minbpe, OpenMausBot).

## Open items
1. Awkward line endings still get through the broken-sentence check (for example, "and you'll follow one click with you").
2. Deepgram may mispronounce proper nouns ("Rome", "Parthian"). Add pronunciation hints that respell risky names for speech only, keeping the captions as written.
3. Long openings (about 15 s) should split into two shots so the pace gets to about 7 to 8 cuts a minute, with every hold at least 4 s.
4. Do a full web app walkthrough at 1440 and 390 px: paste a link, watch progress, download, use the board links and ask follow-ups.
5. Deploy prep is ready (Dockerfile, health check, rate limits, spend guard). It still needs a host, the domain, and the user's go.
6. Later: the hackathon write-up and X post drafts (don't post), an architecture diagram for the README, and voice cloning.
