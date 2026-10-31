# metual

Paste a GitHub repo, an X post or an article. Get a **whiteboard explainer video** (mp4) and an **editable Excalidraw diagram** of it.

- Black canvas, hand-drawn rough strokes, Excalifont, colors that mean something: red = problem, orange/yellow = key idea, green = fix, blue = actors.
- **Repos** become a system design explainer on one evolving canvas: the architecture is built layer by layer, a dot walks one real request through it, then red circles show what breaks at 10x/100x and green boxes show the fix. Every box is grounded in files from the repo, and a second model pass reviews each box against the code before anything is drawn.
- **Posts and articles** become an annotated screenshot of the source (quotes underlined and boxed) followed by small concept boards. Every board node carries a verbatim quote from the source as evidence; quotes that are not in the source are dropped.
- **Levels**: explain it like I'm 5, I'm new, I'm interviewing, or I'm senior.

Powered by Meta Muse models (Muse Spark for reading and planning, Muse Transcribe for voiceover QA, Muse Image + SAM for the doodle icon pack). Voice by Deepgram Aura.

## Quick start

```bash
pnpm install
cp .env.example .env        # add MODEL_API_KEY, optionally DEEPGRAM_API_KEY
npx playwright-core install chromium   # or set METUAL_CHROME to an installed Chrome

# a repo (GitHub URL or local path)
node packages/cli/bin/metual.mjs https://github.com/umami-software/umami --level new
# an article or X post
node packages/cli/bin/metual.mjs https://blog.vllm.ai/2023/06/20/vllm.html --level five
```

Needs Node 20+, ffmpeg on PATH, and Chrome/Chromium.

Outputs land in `metual-out/<name>-<level>/`:

| file | what |
| --- | --- |
| `<name>.mp4` | 1920x1080 video with narration and karaoke captions |
| `<name>.excalidraw` | the full diagram; open it at excalidraw.com and keep editing |
| `<name>.contact.jpg` | contact sheet of frames, for a quick look |
| `architecture.json`, `review.json` | repo only: components, evidence files, review verdict |
| `plan.json` | scenes and narration (cached; delete it or use `--fresh` to re-plan) |
| `manifest.json` | outputs, timings, voice QA score, and model/voice spend |

### CLI options

```
metual <github-url | local-path | x-post-url | article-url> [options]
  --level <five|new|interviewing|senior>   default new
  --theme <caleb-dark|...>                 default caleb-dark
  --out <dir>                              output folder
  --name <owner/repo>                      display name (useful for local paths)
  --voice <deepgram|silent>                default deepgram when DEEPGRAM_API_KEY is set
  --icons <dir>                            extra icon pack (repeatable)
  --fresh                                  ignore cached architecture/plan
  --workers <n>                            parallel frame renderers
  --no-qa                                  skip the Muse Transcribe voiceover check
  --json                                   progress as JSON lines (used by the web app)
```

## Web app

```bash
pnpm --filter @metual/web build && pnpm --filter @metual/web start   # http://localhost:3000
```

A single page: paste a link, pick a level, watch progress, play the video and download the mp4 and `.excalidraw`. It spawns the CLI with `--json` per job and keeps jobs in memory, so it is meant for running locally or on your own box. It refuses URLs that point at private networks; local paths are only accepted with `METUAL_ALLOW_LOCAL=1`.

## How it works

```
packages/
  core     contract: schemas (zod), levels, themes, text rules
  models   Meta Model API client (Muse Spark JSON-schema chat, Muse Image, SAM, Muse Transcribe) + cost ledger
  ingest   repo digest (secret files never opened, secrets redacted), X post via fxtwitter, article via Readability; source card screenshot + quote boxes
  planner  architecture extraction -> validation against real files -> review pass -> revise; scene planning per level
  voice    Deepgram Aura TTS + Nova word timestamps (cached), or silent timing
  render   elk layout -> rough.js strokes -> one SVG world with camera keyframes -> Playwright frames -> ffmpeg; Excalidraw export
  cli      `metual` command and the pipeline
apps/web   Next.js front end
```

Animation events (a box drawing in, an arrow, a circle) are timed to the word in the narration that names them, using the word timestamps, so the drawing follows the voice.

## Plugins

- **Icon packs**: a folder with `manifest.json` (`{ "id": "...", "icons": { "database": { "file": "database.png", "aliases": ["db", "postgres"] } } }`) and white-on-transparent PNGs. Pass `--icons <dir>`; later packs override earlier ones. The built-in `doodle` pack was generated with Muse Image and cut out with SAM (`scripts/gen-icon-pack.ts`).
- **Themes**: `registerTheme({ id, background, ink, colors, ... })` from `@metual/core`.
- **Levels**: `registerLevel({ id, label, minComponents, maxComponents, perScene, ... })` from `@metual/core`.

## Honest notes

- Article screenshots are a reader view that Metual renders itself (title, byline and the paragraphs that hold the quotes), not a capture of the original site. X posts are rendered as Metual's own card from public post data. Neither uses X's or any site's branding.
- Repo understanding comes from a digest of the repo (tree, manifests, entry points, configs), not the whole codebase; the review pass and the "no box without file evidence" rule keep it honest, but very large monorepos get simplified.
- Voiceover QA transcribes the final narration with Muse Transcribe and reports word overlap with the script in `manifest.json`.

## License

MIT, see [LICENSE](LICENSE). Fonts and libraries: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Not affiliated with or endorsed by Meta.
