# Working on Explanimate

Explanimate turns a GitHub repo, an X post, an article or a plain topic into a narrated, hand-drawn whiteboard explainer video (mp4), plus `.tldr` and `.excalidraw` boards. It's built for the Meta Global AI Developer Hackathon (deadline Thu Nov 5, 10:00 AM Manila) on Meta Muse models.

## Layout
- `packages/ingest`: fetches repos, articles, X posts and cited sources for plain topics. Has an SSRF guard, size limits and timeouts.
- `packages/planner`: brief, architecture map and review, scene plan, self-check, narration polish, broken-sentence check, and validators that check names and arrows against the code.
- `packages/models`: Meta Model API client (`muse-spark-1.3-contributor`, `https://api.meta.ai/v1`) with timeouts and retries.
- `packages/voice`: Deepgram Aura text to speech and the voiceover check.
- `packages/render`: roughjs drawing in headless Chrome, frame streaming into ffmpeg, the placement check, the frame check, cut-ins (charts, timelines, maps from Natural Earth), the music bed and sound effects.
- `packages/core`: shared types, schemas, pacing rules and figures.
- `packages/cli`: `pnpm explanimate <link or topic>`.
- `packages/api`: local job API on 127.0.0.1:7311 (`/v1/jobs`).
- `packages/mcp`: the `/explanimate` MCP server (`explain`, `explain_status`, `explain_cancel`).
- `apps/web`: Next.js 16 web app with voice mode (Deepgram STT, Muse reply, Aura speech; localhost only).
- `docs/explaining-playbook.md`: how the engine scripts videos, drawn from the channels the user likes. `docs/deploy.md`: hosting notes.

## Commands
- `pnpm install`, `pnpm typecheck`, `pnpm test` (it must end with `# fail 0`), and `pnpm web` (dev server on port 3000).
- On Windows, Chrome is found in its usual install folders, so a fresh shell works; set `EXPLANIMATE_CHROME` only for a non-standard path. Keys go in `apps/web/.env.local`, which is gitignored; `.env.example` lists every setting.
- CI (`.github/workflows/ci.yml`) runs the typecheck, tests and web build on every push to main.

## Rules
- Never print, commit or send API keys to a model. Don't read `.env` files into prompts.
- Spend caps: $25 on Meta and $10 on Deepgram. The app's spend guard warns at 80%. Reuse cached plans and voice when re-rendering.
- Don't run Muse Code on client repos (for example a client project). Test with public repos or topics.
- Work on a branch, open a PR with a meaningful title, wait for green CI, then rebase-merge (no force-push). Small, meaningful commits. Each commit has a subject in the form `type(scope): plain-language subject`, then a blank line, one plain sentence on what was wrong or why, and plain bullets of what changed.
- Keep quality high. Don't trade quality for speed. Keep the UI clean, light and restrained, with Inter and brand colors only.
- Don't deploy publicly without the user's OK. The domain explanimate.co is bought but not pointed at anything yet; ask before you point it.

## Handoff (Nov 3, 6:30 AM Manila)
Work moves from the cloud box to the laptop repo `~\explainlike`. Hackathon deadline: **Thu Nov 5, 10:00 AM Manila (UTC+8)**. Keep main shippable.

### Pipeline (what `pnpm explanimate <url|topic> --out <dir> [--fresh] [--no-qa]` does)
1. **ingest**: clone or fetch, digest (secret-looking files never opened), README read.
2. **brief**: approach (journey/story, step-by-step...), depth, tempo, theme.
3. **architecture**: Muse Spark maps components/connections/walkthrough/scale, then a reviewer pass checks each against cited files; validators fix names and arrows.
4. **scope**: `groundToReadme` (wip branch) drops side parts and scale fixes the README head does not support.
5. **scene plan** (`planRepoScenes`): ask -> repairRepoPlan -> polish + critique -> found() (checkStory + beats + critique) -> one revise if structural -> fixWording (up to 3 rounds) -> speechCheck (wip) -> beatsOf (`checkBeats`). Topic/article runs use `planConceptScenes` (+ `planConceptBeats` on wip).
6. **voice**: Deepgram Aura TTS with word timings; Muse Transcribe voiceover check.
7. **compose**: board layout, placement check, line cards spliced at their anchor words, camera cuts, pacing report.
8. **render**: Skia frames (Chrome fallback) -> frame check -> ffmpeg mp4, plus `.tldr`, `.excalidraw`, contact sheet.
Plans, voice and repos are cached; a re-render from cache costs about $0.01.

### Per-line visual system (playbook)
- Every narration line has a beat: `title | board | kinetic | chips | terminal | output | browser | number | contrast | doodle` (schema: `packages/core/src/schemas.ts` Beat). Cards are full-frame cut-aways in the hand-drawn look; board stays on the diagram.
- On-screen words are spoken in that same line and synced to the anchor words. `checkBeats` demotes any card whose words are not said, any command not in the README, any number the source never states.
- Never the same visual three lines running (board excepted); about 12-25 visual changes a minute; kinetic capped at about 1/3 of cards (wip).
- Title card: name, underline, tagline (3-6 lowercase words), hook line. No icon row.
- Rules: real part names (agent-browser CLI, daemon, Chrome DevTools Protocol), each explained in one plain clause; familiar anchors (Claude Code, Cursor) as text chips, never logos; no invented nicknames; plain casual language; problem before fix; at most one dry joke; recap ends on a payoff sentence; every fact grounded in README and code.
- Full research: `docs/research/PLAYBOOK.md`, approved sample script `docs/research/agent-browser-sample.md`, creator transcripts in `docs/research/transcripts/` (Crayon Capital, Fireship, Caleb Writes Code, Vox, CNBC, KodeKloud...). Engine-side rules: `docs/explaining-playbook.md`.

### The user's video feedback and direction
- Loved the first seconds of the early agent-browser video: name + tagline, then "What if your AI could..." then contrast lines, then "That's agent-browser: a command-line tool that lets an AI agent, like Claude Code or Cursor, drive a real Chrome browser."
- Plain language; real names, never analogies standing in for part names; familiar anchors like Claude Code/Cursor.
- Scope: "all the relevant and necessary, it doesn't have to be all features every single time".
- Visuals: a mix of predetermined and free; what's shown must match the script, Crayon-style sync (watch how Crayon Capital does it). No formulaic layouts.

### Environment variables (names only; values live in gitignored `apps/web/.env.local` / `.env`; never print or commit them)
- Keys: `MODEL_API_KEY` (Meta Model API), `OPENROUTER_API_KEY` (Muse Spark via OpenRouter, preferred LLM path), `DEEPGRAM_API_KEY`.
- Model: `EXPLANIMATE_LLM_PROVIDER`, `EXPLANIMATE_SPARK_MODEL`, `EXPLANIMATE_HEDGE`, `MODEL_ORDER`.
- Spend guard: `EXPLANIMATE_META_CAP_USD`, `EXPLANIMATE_VOICE_CAP_USD`, `EXPLANIMATE_META_RESERVE_USD`, `EXPLANIMATE_VOICE_RESERVE_USD`.
- Limits/queue: `EXPLANIMATE_REQ_PER_MIN`, `EXPLANIMATE_JOBS_PER_HOUR`, `EXPLANIMATE_TRUST_PROXY`, `EXPLANIMATE_CONCURRENCY`, `EXPLANIMATE_QUEUE_MAX`, `EXPLANIMATE_WAIT_IDLE_S`, `EXPLANIMATE_DEMO_ONLY`, `EXPLANIMATE_RESUME`.
- Paths/caches: `EXPLANIMATE_JOBS_DIR`, `EXPLANIMATE_GALLERY_DIR`, `EXPLANIMATE_OUT_DIR`, `EXPLANIMATE_ROOT`, `EXPLANIMATE_REPO_CACHE`, `EXPLANIMATE_PLAN_CACHE`, `EXPLANIMATE_PLAN_CACHE_DIR`, `EXPLANIMATE_TTS_CACHE`, `EXPLANIMATE_ICON_CACHE`, `EXPLANIMATE_CLONE_TIMEOUT_S`.
- Render/voice: `EXPLANIMATE_CHROME`, `EXPLANIMATE_RENDERER`, `EXPLANIMATE_ENCODER`, `EXPLANIMATE_VOICE`, `EXPLANIMATE_CHAT_VOICE`, `EXPLANIMATE_STT`.
- Servers: `EXPLANIMATE_API_PORT`, `EXPLANIMATE_CLI`, `EXPLANIMATE_MCP_WAIT_SEC`, `EXPLANIMATE_ALLOW_LOCAL`, `EXPLANIMATE_ALLOW_PRIVATE_URLS`.
- Old `EXPLAINLIKE_*` names still work; `EXPLANIMATE_*` wins. `.env.example` documents each.

### Running on Windows
- `pnpm install`, `pnpm -s typecheck`, `pnpm -s test` (must end `# fail 0`), `pnpm --filter @explanimate/web build`, `pnpm web`.
- Render: `pnpm -s explanimate https://github.com/vercel-labs/agent-browser --out .\out\agent-browser-v5 --fresh`.
- The .ps1 quirk: PowerShell may refuse `pnpm.ps1` (execution policy). Use `pnpm.cmd ...`, or run `Set-ExecutionPolicy -Scope Process Bypass` in that shell first, or use cmd.exe. Chrome is found in standard install folders; set `EXPLANIMATE_CHROME` only for a non-standard path.

### PR history
- #1 perf(planner): race two copies of the scene plan and narration calls
- #2 Render frames with Skia by default, Chrome as fallback
- #3 Muse Spark through OpenRouter; keep fixing unexplained terms
- #4 Plain-language explainers: natural walkthrough wording, board sync by meaning, clear shots, plain recap
- #5 Plain box subtitles, literal headings, no circular lines
- #6 chore(guard): default Deepgram cap $10
- #7 feat(planner): one visual per line, real part names explained
- #8 feat(render): line cards per narration line, no icon row on the title card
- #9 fix(render): find hyphenated names in the voice timings (main at fea9535)
- Branch `wip/v5-script-quality` (not merged, no PR): the v5 work below.

### v4 known gaps (Drive: agent-browser-v4.mp4)
Narration well below the approved sample: garbled or subjectless lines ("for you user to use", "X starts every job"), "your X" on part names, full part names repeated back to back, handoff chains without why; hook lost the loved shape; a dashboard line with weak README support; terminal cards shown when the command was not spoken; few output/browser/contrast cards; kinetic rows built off to the left.

### v5 task list (from the user, Nov 3, 5:52 AM)
1. Narration quality, fixed at the root: sample + 1-2 Crayon/Fireship excerpts as few-shot in planner and polish prompts; restore the hook (tagline, then "What if your AI could..."); ban subjectless/garbled lines, "your X" on part names, repeated full names back to back; grammar and natural-speech check (reject and rewrite); lines explain WHY each part exists (problem before fix); strict grounding (drop the dashboard unless the README core supports it).
2. Card variety and matching: terminal only when the command is spoken; output, browser and contrast cards when the line describes them (snapshot refs `textbox "Email" [ref=e3]` / `fill @e3`; auth vault "the LLM never sees passwords"); planner writes lines that earn those cards; kinetic at most about 1/3.
3. Kinetic layout: center each row progressively.
4. Topic runs get line cards too, if cheap and safe.
Then render agent-browser-v5 fresh (timed, frames checked), upload as agent-browser-v5.mp4 to the Drive folder "Explain Like samples" (id DRIVE_FOLDER_ID); PRs, green CI, rebase-merge; report with full narration and an honest gap list.

### Status of v5 on `wip/v5-script-quality` (tests 315 pass, typecheck clean, web build passed before the last edits)
- Done in code: items 1-4 (VOICE_EXAMPLES few-shot, hook checks incl. "That's <name>:", spokenSlips/nickname checks, speechCheck gate, groundToReadme, commandWords terminal rule, kinetic cap, contrast order check, ref lines -> output card with README rows, duplicate-beat fix, return trip told in one sentence, daemon rule in the architecture prompt, `buildRow` progressive centering, `planConceptBeats` for topics).
- Two trial renders on the box (not uploaded). Second trial: hook good ("What if your AI could click around the web? ... That's agent-browser: a command-line tool that lets an AI agent drive a Chrome browser. It works with Claude Code or Cursor."), daemon present, dashboard dropped. Still weak: walkthrough reads as a handoff chain, "That helper is an AI agent." survived (nickname check broadened after), 9.9 changes/min (under 12), no auth-vault contrast line, tiny-text frame warnings on the zoomed-out board at ~78 s.
- Next: run the full test + web build, render v5 fresh, check frames against lines, fix what's left, split into PRs (planner/cli vs render), merge after green CI, upload v5.
- Untested: `planConceptBeats` live (needs a cheap DNS topic run, about $0.06 Meta + $0.03 Deepgram).

### Spend (as of the handoff)
About $11.2 of $25 Meta and $2.4 of $10 Deepgram (v5 trials added about $0.79 Meta and $0.12 Deepgram to $10.4 / $2.3). Fresh agent-browser run: about $0.40 Meta + $0.06 Deepgram; re-render from cache about $0.01. Stop before any run would pass 80% of a cap.

### Constraints
No public deploy without the user's OK; never read, print, commit or send secrets to models; no Meta logo or trademark in videos; no client code (a client project) through Muse; don't touch the Tokyo VPS or Cloudflare; DNS changes on hold until the user says.

### Open questions for the user
- Hosting: redeploy on the Tokyo VPS, or move to a vps VPS 6?
- Contributor model test (`muse-spark-1.3-contributor`) vs OpenRouter Muse Spark: run the comparison or not?
- Pending: re-render the gallery samples (~\explanimate-gallery) with the new line cards once v5 is merged.
