# Explain Like

Give it a GitHub repo, an article or an X post. It gives you back a narrated **whiteboard explainer video** and the same drawing as **editable boards** you can open in [tldraw](https://www.tldraw.com) or [Excalidraw](https://excalidraw.com).

![Explain Like drawing the OpenMausBot repo](docs/media/openmausbot.gif)

*Above: 12 seconds from a 2-minute video about [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot). A run like this costs well under $0.20 in models and voice.*

## What it does

- **Repos** become a system design walkthrough on one canvas. It builds the architecture piece by piece, walks one real request through it, then circles what breaks at 10x traffic and draws the fix. Every box is tied to real files in the repo, and a second pass checks each box against the code before anything is drawn.
- **Articles and X posts** become an annotated view of the source, quotes underlined, followed by small concept boards. Every point carries a word-for-word quote from the source.
- **Nothing to configure.** Muse Spark reads the source first and picks how to explain it (an analogy, a story, step by step...), how deep to go, how fast and which look.
- **Checked before you see it.** Labels and arrows are checked against the camera before rendering, the finished frames are checked for cut-off words, overlaps and blank frames, and both boards are read back to make sure they open.

| A request, start to end | What breaks at 10x | The fix |
| --- | --- | --- |
| ![a chat message walking through OpenMausBot](docs/media/openmausbot-walk.jpg) | ![the chat transcripts store circled in red at 10x](docs/media/openmausbot-10x.jpg) | ![a write queue drawn in green as the fix](docs/media/openmausbot-fix.jpg) |

## Quick start

You need Node 20+, pnpm, ffmpeg on your PATH and Chrome or Chromium.

```bash
git clone https://github.com/slubbles/explainlike && cd explainlike
pnpm install
cp .env.example .env                    # add MODEL_API_KEY (Meta); DEEPGRAM_API_KEY adds the voice
npx playwright-core install chromium    # or point EXPLAINLIKE_CHROME at an installed Chrome

pnpm explainlike https://github.com/milind-soni/OpenMausBot
```

Without a Deepgram key the video renders silent, with timed captions. Every run prints what it spent.

Results land in `explainlike-out/<name>/`:

- `<name>.mp4`: the 1920x1080 video, with narration and captions
- `<name>.tldr` and `<name>.excalidraw`: the drawing as boards you can keep editing
- `<name>.contact.jpg`: a sheet of frames for a quick look
- `manifest.json`: what was made, the check results and the spend

The plan and voiceover are cached in that folder, so running the same source again costs almost nothing. Use `--fresh` to plan again.

## Web app, with voice mode

```bash
pnpm web    # http://localhost:3000
```

Paste a link and watch it build, with a live cost meter. Or press the **mic button** and just say what you want explained. The assistant talks back, asks what you want to understand and who it's for, then starts the video. You can interrupt it at any time, and a small box under the chat takes a typed link, since spoken names get misheard. Voice mode needs `DEEPGRAM_API_KEY`.

When the video is done you can tap any box for a short explanation from the code, render a 15-20 s deep dive on it, ask "what if 10x traffic?", or download the boards.

It runs on localhost only. Every job spends your API credits, so don't put it on the public internet as is.

## CLI

```
pnpm explainlike <github url | local repo folder | article url | x.com post url> [options]

  --out <dir>                 output folder (default ./explainlike-out/<name>)
  --voice <deepgram|silent>   default: deepgram when DEEPGRAM_API_KEY is set
  --fresh                     plan again instead of using the cached plan
  --goal <text>               what you want to understand
  --audience <text>           who it is for
  --depth <overview|working|deep>
  --workers <n>               Chrome processes drawing frames (default: cores - 1, at most 6)
  --no-music, --no-qa         skip the music bed, skip the voiceover check
  --json                      progress as JSON lines

follow-ups on an earlier repo run:
  --from <earlier out dir> --focus <box id>       15-20 s deep dive on one box
  --from <earlier out dir> --what-if <10x|100x>   what breaks if traffic grows
```

`pnpm explainlike --help` lists the rest.

## /explainlike in your coding agent

`packages/mcp` is an MCP server that runs Explain Like on your own machine. Add it to your agent, then ask:

```
/explainlike explain what this repo is about https://github.com/milind-soni/OpenMausBot
```

It renders locally and answers with the paths to the mp4 and both boards. Say "this repo" without a link and it explains the folder you're in. Files go to `~/explainlike-videos/<name>`. A render takes a few minutes, so the agent checks back with `explain_status` while it works.

Replace `/path/to/explainlike` below with where you cloned this repo.

**Muse Code**, in `~/.config/muse/settings.json` (merge with what's there):

```json
{
  "schema_version": 1,
  "mcp_servers": {
    "explainlike": {
      "transport": "stdio",
      "command": "node",
      "args": ["/path/to/explainlike/packages/mcp/bin/explainlike-mcp.mjs"],
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
    "explainlike": {
      "command": "node",
      "args": ["/path/to/explainlike/packages/mcp/bin/explainlike-mcp.mjs"],
      "env": { "MODEL_API_KEY": "your Meta key", "DEEPGRAM_API_KEY": "your Deepgram key" }
    }
  }
}
```

**Cursor**, in `~/.cursor/mcp.json` or `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "explainlike": {
      "command": "node",
      "args": ["/path/to/explainlike/packages/mcp/bin/explainlike-mcp.mjs"],
      "env": { "MODEL_API_KEY": "${env:MODEL_API_KEY}", "DEEPGRAM_API_KEY": "${env:DEEPGRAM_API_KEY}" }
    }
  }
}
```

Want to call it from your own code instead? `packages/api` runs the same jobs over a localhost HTTP API (`node packages/api/bin/explainlike-api.mjs`).

## How it works

1. **Read.** It takes a digest of the repo (file tree, manifests, entry points, configs; secret files are never opened) or the article's text.
2. **Plan.** Muse Spark maps the architecture, checks every box against real files, picks an approach and writes the scenes and narration.
3. **Voice.** Deepgram Aura reads the script, and word timestamps let each box draw in on the word that names it.
4. **Draw.** The scenes become one hand-drawn SVG canvas with a moving camera. Chrome draws the frames in parallel and ffmpeg encodes them as they arrive.
5. **Check.** The frames and both boards are checked, and the voiceover is transcribed back and compared with the script.

The code is a pnpm workspace: `packages/` holds `core`, `models`, `ingest`, `planner`, `voice`, `render`, `cli`, `api` and `mcp`, and `apps/web` is the Next.js app. Icon packs are a plugin point; see [docs/plugins.md](docs/plugins.md). Run the tests with `pnpm test` and `pnpm typecheck`.

## License

MIT, see [LICENSE](LICENSE). Fonts and libraries are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Not affiliated with or endorsed by Meta, tldraw or Excalidraw.
