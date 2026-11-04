# Explanimate

Give it a GitHub repo and get back a short narrated whiteboard video that draws how the code works, in plain words.

![A frame from the Explanimate video about facebook/react: a tap on Like flowing from the browser through React and the reconciler to React DOM](docs/assets/hero-react.jpg)

<!-- DEMO_LINK -->

**Watch the demo:** [demo video (link coming soon)](#)

**Try it live:** https://explanimate.co. **See finished videos:** https://explanimate.co/gallery

It also takes an article, an X post or a plain topic ("how DNS works"). Every video comes with the same drawing as **editable boards** for [tldraw](https://www.tldraw.com) and [Excalidraw](https://excalidraw.com).

## How it works

- You paste a GitHub repo link (or an article, an X post or a topic) on the site, in the CLI or from your coding agent.
- It reads a digest of the repo: the file tree, manifests, entry points and configs. Secret files are never opened.
- Muse Spark maps the parts of the system against the real files, checks each box against the code, and writes the scenes and narration.
- A voice (Deepgram Aura, with Cartesia Sonic as a backup) reads the script, and word timings let each box draw in on the word that names it.
- The hand-drawn board is rendered to a 1920x1080 mp4 with captions, and exported as `.tldr` and `.excalidraw` boards.
- Before you see it, the frames are checked for cut-off words, overlaps and blank frames, and the voiceover is transcribed back and compared with the script.

## How it uses Meta Muse Spark

Explanimate calls Meta models through the Meta Model API (or Muse Spark through OpenRouter). See [`packages/models/src/index.ts`](packages/models/src/index.ts).

- **`muse-spark-1.3` does the thinking**, always with strict structured JSON output validated by zod:
  - the brief: reads the source and picks the approach, depth, pace and look (`packages/planner/src/brief.ts`)
  - the architecture: extracts the parts and how they connect, then a review pass checks every box against real files and a fix pass repairs what failed (`packages/planner/src/architecture.ts`)
  - the scenes and narration, plus a plan check (`packages/planner/src/scenes.ts`)
  - follow-ups after a video: explaining a tapped box, a deep dive on it, and "what breaks at 10x traffic" (`packages/planner/src/followups.ts`)
  - voice mode on the web app, where Muse Spark holds the conversation and starts the video with a tool call (`apps/web/app/api/voice/turn/route.ts`)
  - an optional look at rendered frames to list layout problems (off by default, since it costs money)
- **`muse-image-1.0`** draws the doodle icons on the whiteboard.
- **`sam-3.1`** finds the drawn object so each icon is cropped cleanly.
- **`muse-voice-transcribe-1.0`** transcribes the finished voiceover and checks it says what the script says.

## Features

- **Three formats:** Short, Deep and Anatomy (or Auto, which lets Muse Spark choose).
- **Tap a box:** after a repo video, tap any box for a short explanation from the code, a 15-20 s deep dive on it, or "what if 10x traffic?".
- **Editable boards:** download the drawing and keep editing it in tldraw or Excalidraw.
- **`/explanimate` in your coding agent:** `packages/mcp` is an MCP server for Muse Code, Claude Code, Cursor, Codex, Claude Desktop and VS Code. It explains the folder you're in and hands back the video and both boards.
- **Sign-in:** a 6-digit email code (temporary email addresses are refused), Google, or GitHub.
- **Limits:** 3 videos per account per day on the hosted site, plus a per-IP rate limit and a spend guard that pauses new work before the Meta or Deepgram cap.
- **Voice mode:** press the mic and say what you want explained (on localhost).

## Stack

- TypeScript in a pnpm workspace: `core`, `models`, `ingest`, `planner`, `voice`, `render`, `cli`, `api` and `mcp` under `packages/`, and a Next.js web app in `apps/web`.
- Models: Meta Muse Spark, Muse Image, SAM and Muse Voice Transcribe; Deepgram Aura for the voice, Cartesia Sonic as a backup.
- Rendering: one hand-drawn SVG canvas with a moving camera, drawn by Skia (or headless Chrome) and encoded with ffmpeg.
- Hosting: Docker on a VPS, deployed by GitHub Actions after CI passes.

## A sample run

![Explanimate drawing the OpenMausBot repo](docs/media/openmausbot.gif)

_Above: 12 seconds from a 2-minute video about [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot). A run like this costs well under $0.20 in models and voice._

![The Explanimate site turning a link into a video](docs/media/site.jpg)

## What it does

- **Repos** become a system design walkthrough on one canvas. It builds the architecture piece by piece, walks one real request through it, then circles what breaks at 10x traffic and draws the fix. Every box is tied to real files in the repo, and a second pass checks each box against the code before anything is drawn.
- **Articles and X posts** become an annotated view of the source, quotes underlined, followed by small concept boards. Every point carries a word-for-word quote from the source.
- **Nothing to configure.** Muse Spark reads the source first and picks how to explain it (an analogy, a story, step by step...), how deep to go, how fast and which look.
- **Checked before you see it.** Labels and arrows are checked against the camera before rendering, the finished frames are checked for cut-off words, overlaps and blank frames, and both boards are read back to make sure they open.

| A request, start to end                                                        | What breaks at 10x                                                                  | The fix                                                                    |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ![a chat message walking through OpenMausBot](docs/media/openmausbot-walk.jpg) | ![the chat transcripts store circled in red at 10x](docs/media/openmausbot-10x.jpg) | ![a write queue drawn in green as the fix](docs/media/openmausbot-fix.jpg) |

## Quick start

Prereqs: Node 22+, pnpm 9, ffmpeg on your PATH, and Chrome or Chromium.
On Windows, if PowerShell refuses to run `pnpm.ps1`, use `pnpm.cmd ...` instead.
No Chrome? `npx playwright-core install chromium`, or point `EXPLANIMATE_CHROME` at an installed binary.

```bash
git clone https://github.com/slubbles/explanimate && cd explanimate
pnpm install
cp .env.example .env   # empty works: the app boots with no keys
pnpm dev               # web app on http://localhost:3000 (`pnpm web` is the same)
```

Check it:

```bash
curl -s http://localhost:3000/ -o /dev/null -w "%{http_code}\n"
curl -s http://localhost:3000/api/health
```

`/` serves the site (200). `/api/health` answers `{"ok":true}` when a video can be made,
`{"ok":false}` with a 503 when ffmpeg, Chrome or a Muse key is missing; the pages still load.

Without keys, pages, gallery and docs work and sign-in stays off: no Turnstile, Analytics
or email setup is needed. To make videos, add `OPENROUTER_API_KEY` to `.env`
(`MODEL_API_KEY` works too, and is still needed for doodle icons and the voiceover check);
`DEEPGRAM_API_KEY` adds the voice, otherwise videos render silent with timed captions.
To try sign-in locally, set `EXPLANIMATE_AUTH_ENABLED=1`: the database defaults to
`explanimate-out/web/auth.db`, the login code is logged to the server console, and the
Turnstile check is skipped. Every setting, required vs optional, is listed in
[`.env.example`](.env.example).

Prefer Docker? `docker compose up` builds the image and serves the same app on port 3000
with a persistent volume; put the same keys in `.env` to make videos.

Prefer the command line? `pnpm explanimate <link or "a topic">` renders one video
(see the CLI section below). Prefer your coding agent? `packages/mcp` runs the same
renders as an MCP server (see the coding-agent section below).

## Make a video

```bash
pnpm explanimate https://github.com/milind-soni/OpenMausBot
```

Every run prints what it spent. Results land in `explanimate-out/<name>/`:

- `<name>.mp4`: the 1920x1080 video, with narration and captions
- `<name>.tldr` and `<name>.excalidraw`: the drawing as boards you can keep editing
- `<name>.contact.jpg`: a sheet of frames for a quick look
- `manifest.json`: what was made, the check results and the spend

The plan and voiceover are cached in that folder, so running the same source again costs almost nothing. A GitHub repo's plan is also kept per commit in `~/.cache/explanimate/plans`, so a new folder for the same commit, asked the same way, skips the Muse planning calls too; a change to the planner code or a new commit plans again. Use `--fresh` to plan again, or set `EXPLANIMATE_PLAN_CACHE=0` to turn the shared cache off.

## Web app, with voice mode

Paste a link and watch it build, with a live cost meter. Or press the **mic button** and just say what you want explained. The assistant talks back, asks what you want to understand and who it's for, then starts the video. You can interrupt it at any time, and a small box under the chat takes a typed link, since spoken names get misheard. Voice mode needs `DEEPGRAM_API_KEY`.

When the video is done you can tap any box for a short explanation from the code, render a 15-20 s deep dive on it, ask "what if 10x traffic?", or download the boards.

Every job spends your API credits. The web app has a per-IP rate limit, size limits and a spend guard that pauses new work before the Meta or Deepgram cap (`EXPLANIMATE_META_CAP_USD`, `EXPLANIMATE_VOICE_CAP_USD`). Voice mode only answers on localhost. Read [docs/deploy.md](docs/deploy.md) before you put it anywhere public.

If a server restart cuts a video off, it starts again on its own the next time the app loads. Every setting is listed in [`.env.example`](.env.example).

## Configuration

Every setting is listed in [`.env.example`](.env.example). Each AI service has a backup for when it fails:

- **Muse Spark** runs on Meta (`EXPLANIMATE_LLM_PROVIDER=meta`) or through OpenRouter (the default when `OPENROUTER_API_KEY` is set). When Meta is primary and a call fails after its retries, it is tried once on OpenRouter's `meta/muse-spark-1.3` if that key is set; otherwise the error surfaces.
- **Voice** is Deepgram Aura (`DEEPGRAM_API_KEY`); without it videos render silent. When Deepgram fails and `CARTESIA_API_KEY` is set, the scene falls back to Cartesia Sonic instead (`--voice cartesia` uses it directly; `CARTESIA_VOICE_ID` picks the voice).

`/api/health` reports `fallbacks: { llm, tts }`, so a deployment can see which backups are configured (booleans only, never keys).

## Checks

```bash
pnpm typecheck && pnpm test
```

The tests need ffmpeg and Chrome but no API keys.

## CLI

```
pnpm explanimate <github url | local repo folder | article url | x.com post url | "a topic"> [options]

  --out <dir>                 output folder (default ./explanimate-out/<name>)
  --voice <deepgram|cartesia|silent>   default: deepgram when DEEPGRAM_API_KEY is set
  --fresh                     plan again instead of using the cached plan
  --goal <text>               what you want to understand
  --audience <text>           who it is for
  --depth <overview|working|deep>
  --workers <n>               threads (Skia) or Chrome processes drawing frames
  --no-music, --no-qa         skip the music bed, skip the voiceover check
  --json                      progress as JSON lines
  --allow-private             read links that resolve to private or localhost addresses (local intranet only)

follow-ups on an earlier repo run:
  --from <earlier out dir> --focus <box id>       15-20 s deep dive on one box
  --from <earlier out dir> --what-if <10x|100x>   what breaks if traffic grows
```

`pnpm explanimate --help` lists the rest.

## /explanimate in your coding agent

`packages/mcp` is an MCP server that runs Explanimate on your own machine. Add it to your agent, then ask. Full setup with copy-paste configs for every tool: https://explanimate.co/docs

```
/explanimate explain what this repo is about https://github.com/milind-soni/OpenMausBot
```

It renders locally and answers with the paths to the mp4 and both boards. Say "this repo" without a link and it explains the folder you're in. Files go to `~/explanimate-videos/<name>`. A render takes a few minutes, so the agent checks back with `explain_status` while it works.

Replace `/path/to/explanimate` below with where you cloned this repo.

**Muse Code**, in `~/.config/muse/settings.json` (merge with what's there):

```json
{
  "schema_version": 1,
  "mcp_servers": {
    "explanimate": {
      "transport": "stdio",
      "command": "node",
      "args": ["/path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs"],
      "env": { "MODEL_API_KEY": "${MODEL_API_KEY}", "DEEPGRAM_API_KEY": "${DEEPGRAM_API_KEY}" },
      "mode": "optional"
    }
  }
}
```

**Claude Desktop**, in `claude_desktop_config.json` (Settings, Developer, Edit Config). It doesn't read your shell environment, so the keys go in the file. Keep it private.

```json
{
  "mcpServers": {
    "explanimate": {
      "command": "node",
      "args": ["/path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs"],
      "env": { "MODEL_API_KEY": "your Meta key", "DEEPGRAM_API_KEY": "your Deepgram key" }
    }
  }
}
```

**Cursor**, in `~/.cursor/mcp.json` or `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "explanimate": {
      "command": "node",
      "args": ["/path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs"],
      "env": { "MODEL_API_KEY": "${env:MODEL_API_KEY}", "DEEPGRAM_API_KEY": "${env:DEEPGRAM_API_KEY}" }
    }
  }
}
```

**Claude Code**, in a terminal:

```bash
claude mcp add explanimate --transport stdio \
  --env MODEL_API_KEY=your-meta-key \
  --env DEEPGRAM_API_KEY=your-deepgram-key \
  -- node /path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs
```

**Codex**, in `~/.codex/config.toml` (then restart Codex):

```toml
[mcp_servers.explanimate]
command = "node"
args = ["/path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs"]

[mcp_servers.explanimate.env]
MODEL_API_KEY = "your Meta key"
DEEPGRAM_API_KEY = "your Deepgram key"
```

**VS Code**, in `.vscode/mcp.json` in your workspace (its format uses the `servers` key):

```json
{
  "servers": {
    "explanimate": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/explanimate/packages/mcp/bin/explanimate-mcp.mjs"],
      "env": { "MODEL_API_KEY": "your Meta key", "DEEPGRAM_API_KEY": "your Deepgram key" }
    }
  }
}
```

Want to call it from your own code instead? `packages/api` runs the same jobs over a localhost HTTP API (`node packages/api/bin/explanimate-api.mjs`).

## Pipeline details

1. **Read.** It takes a digest of the repo (file tree, manifests, entry points, configs; secret files are never opened) or the article's text. A plain topic is looked up on Wikipedia, and the article plus up to two reputable pages it cites (standards bodies, universities, governments, major outlets) are read; every quote on screen comes from them, and the sources are named in the video, `sources.md` and the manifest.
2. **Plan.** Muse Spark maps the architecture, checks every box against real files, picks an approach and writes the scenes and narration.
3. **Voice.** Deepgram Aura reads the script (Cartesia Sonic when Deepgram fails and its key is set), and word timestamps let each box draw in on the word that names it.
4. **Draw.** The scenes become one hand-drawn SVG canvas with a moving camera. Skia draws the frames on a few threads and streams them into ffmpeg (NVENC when a GPU is there, else libx264). Set `EXPLANIMATE_RENDERER=chrome` to draw them in headless Chrome instead; Skia falls back to Chrome on its own if it cannot load.
5. **Check.** The frames and both boards are checked, and the voiceover is transcribed back and compared with the script.

The code is a pnpm workspace: `packages/` holds `core`, `models`, `ingest`, `planner`, `voice`, `render`, `cli`, `api` and `mcp`, and `apps/web` is the Next.js app. Icon packs are a plugin point; see [docs/plugins.md](docs/plugins.md). Run the tests with `pnpm test` and `pnpm typecheck`.

### Architecture

```mermaid
flowchart TD
    CLI["cli: pipeline"] --> ING["ingest: repos, posts, articles, topics"]
    WEB["apps/web: Next.js + voice mode"] --> API["api: local job server"]
    MCP["mcp: /explanimate server"] --> API
    API --> ING
    ING --> PLAN["planner: brief, architecture, scenes"]
    PLAN --> VOICE["voice: Deepgram TTS + retake checks"]
    VOICE --> REN["render: hand-drawn canvas, Chrome frames, ffmpeg"]
    REN --> OUT["mp4 + .tldr + .excalidraw boards"]
    MOD["models: Muse Spark, Image, SAM, Transcribe"] -.-> PLAN
    MOD -.-> VOICE
    MOD -.-> REN
    CORE["core: shared types and checks"] -.-> ING
    CORE -.-> PLAN
    CORE -.-> VOICE
    CORE -.-> REN
```

## License

MIT, see [LICENSE](LICENSE). Fonts and libraries are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Not affiliated with or endorsed by Meta, tldraw or Excalidraw.
