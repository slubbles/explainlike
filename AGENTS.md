# Explanimate: start here

This file is the single entry point for any AI or human picking up the project. Read it top to bottom once; deeper docs are linked where they matter.

For a short, plain-language eagle view of the whole codebase and project, see [`docs/CODEBASE-MAP.md`](docs/CODEBASE-MAP.md).

## 1. Summary
- **What it is:** Explanimate turns a GitHub repo, an article, an X post or a plain topic ("how DNS works") into a narrated, hand-drawn whiteboard explainer video (mp4), plus the same drawing as `.tldr` and `.excalidraw` boards.
- **Why:** Meta Global AI Developer Hackathon entry (indie track), built on Meta Muse models (Muse Spark for planning, Muse Transcribe for the voiceover check, Muse Image/SAM for doodle icons) with Deepgram Aura for the voice. The user submits the entry himself.
- **Deadline: Thu Nov 5, 2026, 10:00 AM Manila (UTC+8).** Keep `main` shippable at all times.
- **Repo:** github.com/slubbles/explanimate (renamed from metual, then explainlike). Laptop copy: `C:\Users\idder\explainlike`. Only one branch exists: `main`.
- **Name history:** Metual, then Explain Like, now Explanimate (ex-PLAN-ih-mate). Old `EXPLAINLIKE_*` env names and `explainlike-*` default folders still work on purpose; don't treat them as stale.

## 2. Current state (Nov 3, 2026, 7:15 AM Manila)
- `main` has PRs #1-#11 merged, CI green. Three branches are ready on the laptop, not pushed (the stored `gh` token is invalid, so re-authenticate, then push and open a PR for each): `guard-private-links` (private links refused everywhere by default, `--allow-private` opt-out, tests), `docs-refresh` (quick start, code map, deploy notes, `railway.json` deleted), `fix-board-wire-cut` (the DNS wire cut fixed, regression test). 328 tests passing (317 + 10 guard + 1 wire-cut). v5 (PR #11) is merged; `docs/handoff/v5-wip.patch` is gone.
- Latest sample: `agent-browser-v5.mp4` (144 s) in the Google Drive folder "Explain Like samples" (folder id `15F_jFp0e1AAlowNfRg4N870naIOBoSdm`).
- The gallery was re-rendered from cached plans and voice with today's main (Skia, "Explanimate" watermark) into the Drive subfolder "Explanimate gallery" (id `1BeHDP_NDLzTGUydmkKo3ZW9FPwzvedIC`): mp4s, posters and `gallery.json` for openmausbot, karpathy-minbpe, rxi-microui, how-the-internet-grew, silk-road, pallets-itsdangerous. **how-dns-works failed** on its cached plan: placement check, "wire book>machine is cut off by the frame edge at 46.6s". The cut is fixed on `fix-board-wire-cut`; it still needs a re-render from cache and a frame check.
- Production is an old build (see section 8). Today's main is not deployed.
- Spend so far: about **$11.85 of $25 Meta** and **$2.60 of $10 Deepgram**.

## 3. How to run (Windows laptop)
```powershell
cd C:\Users\idder\explainlike
git pull
pnpm install
pnpm -s typecheck
pnpm -s test                              # must end with "# fail 0"
pnpm --filter @explanimate/web build
pnpm -s explanimate https://github.com/vercel-labs/agent-browser --out .\out\agent-browser-v5 --fresh
pnpm web                                  # web app on http://localhost:3000
```
- **The .ps1 quirk:** PowerShell can refuse to run `pnpm.ps1` because of the execution policy. Use `pnpm.cmd ...`, run `Set-ExecutionPolicy -Scope Process Bypass` in that window first, or use cmd.exe.
- Chrome is found in its standard install folders; set `EXPLANIMATE_CHROME` only for a non-standard path. `ffmpeg` must be on PATH.
- Keys live in the gitignored `apps/web/.env.local` (or `.env`). `.env.example` documents every setting.
- CLI flags: `--out <dir>`, `--fresh` (plan again, ignore caches), `--no-qa`. A fresh agent-browser run costs about $0.40 Meta + $0.06 Deepgram and takes 3-4 minutes. A re-render from cache costs about $0.01.
- Each run writes `plan.json`, `architecture.json`, `manifest.json` (notes: scope, line visuals, speech gate, self-check, frame check), the mp4, both boards and a contact sheet. Check the frames against the lines before calling a video done.
- CI (`.github/workflows/ci.yml`) runs typecheck, tests and the web build on every push and PR.

## 4. Architecture
| Package | Owns |
| --- | --- |
| `packages/ingest` | Fetches repos, articles, X posts and cited sources for plain topics. SSRF guard, size limits, timeouts; secret-looking files are never opened. |
| `packages/planner` | Brief, architecture map plus review, scene plan, self-checks, narration polish, speech gate, per-line beats (`beats.ts`), story shapes (`shapes.ts`). |
| `packages/models` | Muse Spark client: OpenRouter (`meta/muse-spark-1.3`) when `OPENROUTER_API_KEY` is set, else the Meta Model API (`muse-spark-1.3-contributor`). Cost ledger, timeouts, retries, hedged calls. |
| `packages/voice` | Deepgram Aura TTS with word timings; Muse Transcribe voiceover check. |
| `packages/render` | Board layout, line cards (`cards.ts`), composition (`compose.ts`), placement check, Skia frames (Chrome fallback), frame check, ffmpeg, music and sound effects. |
| `packages/core` | Shared schemas (`schemas.ts`: Scene, Beat, VisualType), plain-language rules, pacing, text helpers. |
| `packages/cli` | `pnpm explanimate <link or topic>`; `pipeline.ts` runs the stages. |
| `packages/api` | Local job API on 127.0.0.1:7311 (`/v1/jobs`). |
| `packages/mcp` | `/explanimate` MCP server (`explain`, `explain_status`, `explain_cancel`), set up in Muse Code on the laptop. |
| `apps/web` | Next.js 16 app: job queue, gallery (`/gallery`), voice mode, spend guard, rate limits, `/api/health`. |

**Pipeline stages** (`packages/cli/src/pipeline.ts`):
1. **ingest:** clone or fetch the source, build a digest, read the README.
2. **brief:** pick the approach (journey, story, step-by-step...), depth, tempo and theme.
3. **architecture** (repos): Muse maps components, connections, a walkthrough and scale risks, a reviewer checks them against the cited files, then validators fix names and arrows.
4. **scope** (v5 patch): `groundToReadme` drops parts and claims the README's core does not support.
5. **scene plan:** `planRepoScenes` runs ask, repair, polish and critique, self-check (`checkStory` + beats), one revise if a problem is structural, `fixWording` (up to 3 rounds), `speechCheck` (v5), then `checkBeats`. Topics use `planConceptScenes` (+ `planConceptBeats` in v5).
6. **voice:** Aura TTS with word timestamps, then the voiceover check.
7. **compose:** board layout, line cards spliced at their anchor words, camera cuts, pacing report.
8. **render and encode:** frames, frame check, mp4, boards, contact sheet.

Plans (per repo commit), voice, repos and icons are cached. See [`docs/code-map.md`](docs/code-map.md).

## 5. The explainer rules (what a good video is)
- **Per-line visuals:** every narration line has a beat: `title | board | kinetic | chips | terminal | output | browser | number | contrast | doodle`. `board` stays on the evolving diagram; the others are full-frame hand-drawn cut-aways shown on the words they show.
- On-screen words are spoken in that same line and synced to their anchor words. `checkBeats` demotes a card whose words aren't said, a command that isn't in the README, or a number the source never states.
- Never the same visual type three lines running (board excepted). Aim for about 12-25 visual changes a minute. Kinetic is at most about a third of the cards.
- **Title card:** the name, an underline, a 3-6 word lowercase tagline, then the hook line. No icon row.
- **Wording:** real part names (agent-browser CLI, daemon, Chrome DevTools Protocol), each explained in one plain clause. Familiar anchors (Claude Code, Cursor) appear as text chips, never logos. No invented nicknames. Plain casual language, problem before fix, at most one dry joke, and the recap ends on a payoff sentence.
- **Grounding:** every fact is grounded in the README and the code.
- Deeper: [`docs/explaining-playbook.md`](docs/explaining-playbook.md) (engine rules), [`docs/research/PLAYBOOK.md`](docs/research/PLAYBOOK.md) (study of Crayon Capital, Fireship, Caleb Writes Code, Vox, CNBC, KodeKloud), [`docs/research/agent-browser-sample.md`](docs/research/agent-browser-sample.md) (**the approved sample script, the quality bar**), [`docs/research/transcripts/`](docs/research/transcripts/) (creator transcripts).

## 6. The user's preferences and feedback
- He loved the opening of the early agent-browser video. Keep that shape:
  1. the name and the tagline
  2. "What if your AI could…"
  3. contrast lines ("Not guess what a page says. Actually open it…")
  4. "That's agent-browser: a command-line tool that lets an AI agent, like Claude Code or Cursor, drive a real Chrome browser."
- Plain language a non-programmer follows. Use real part names, never analogies standing in for them, and anchor them to tools people know.
- Scope: "all the relevant and necessary, it doesn't have to be all features every single time."
- Visuals: a mix of predetermined and free choice. What's on screen must match the script, synced the way Crayon Capital does it. Nothing formulaic.
- Work style:
  - Keep going batch after batch within the caps. Don't ask permission for reversible work.
  - Use small auditable commits: `type(scope): plain subject`, a blank line, one sentence on why, then bullets.
  - Open a PR with a meaningful title, wait for green CI, then rebase-merge.
  - Never trade quality for speed.
- UI: clean, light and restrained, Inter font and brand colors only.

## 7. Decisions and why
- **OpenRouter Muse Spark is the default LLM path.** The user uses his OpenRouter key instead of Meta credits. `MODEL_API_KEY` is still needed for icons and the voiceover check.
- **Skia renders by default, with Chrome as the fallback.** It's faster.
- **Plan and narration calls are raced (hedged).** This cuts wait time.
- **Line cards replaced the title-card icon row.** The user wants visuals that match each line.
- **Deepgram cap is $10**, raised from $3 by the user.
- **The README head grounds the core story.** Feature bullets support why-lines only.

## 8. Deployment
- **Live URL:** https://explanimate.co (`www.explanimate.co` redirects to it).
- **Server:** a Contabo VPS in Tokyo at 84.247.153.238, shared with another project (OpenBot). Never touch OpenBot's containers, folders or its Caddy block.
- **Container:** `explanimate`, published on 127.0.0.1:3001 (the app listens on 3000 inside). Docker volume `explanimate-data` mounted at `/data`: jobs in `/data/jobs`, gallery in `/data/gallery` (`EXPLANIMATE_GALLERY_DIR=/data/gallery`) holding `gallery.json` plus each sample's `.mp4` and `.jpg` poster.
- **Caddy** (system service, `/etc/caddy/Caddyfile`) serves explanimate.co and www, reverse-proxying to 127.0.0.1:3001.
- **Cloudflare:** zone explanimate.co, nameservers jakub.ns.cloudflare.com and lola.ns.cloudflare.com set at the Spaceship registrar (DNSSEC off), proxied A records for the apex and www pointing at the server, SSL mode Full.
- **Redeploy:** run `/root/deploy-explanimate.sh` on the server; it resets the server's checkout to origin/main, rebuilds the image and restarts the container, then health-checks `/api/health`.
- **Roll back:** stop `explanimate` and start the old `explainlike` container (kept stopped on purpose; do not delete it).
- **Gotcha:** the app runs as uid 1000, so anything copied into the volume (`/var/lib/docker/volumes/explanimate-data/_data`) must be `chown -R 1000:1000`, or jobs and the gallery fail with permission errors.
- **Secrets** live only in a server-side env file; never name its values in docs.
- Repo how-to (Docker flow, Caddy recipes, DNS record shapes) stays in [`docs/deploy.md`](docs/deploy.md).

## 9. Environment variables (names only; never print, commit or send values)
- **Keys:** `MODEL_API_KEY`, `OPENROUTER_API_KEY`, `DEEPGRAM_API_KEY`
- **Model:**
  - `EXPLANIMATE_LLM_PROVIDER`, `EXPLANIMATE_SPARK_MODEL`, `EXPLANIMATE_HEDGE`
  - `MODEL_ORDER`
- **Spend guard:**
  - `EXPLANIMATE_META_CAP_USD`, `EXPLANIMATE_VOICE_CAP_USD`
  - `EXPLANIMATE_META_RESERVE_USD`, `EXPLANIMATE_VOICE_RESERVE_USD`
- **Limits and queue:**
  - `EXPLANIMATE_REQ_PER_MIN`, `EXPLANIMATE_JOBS_PER_HOUR`, `EXPLANIMATE_TRUST_PROXY`
  - `EXPLANIMATE_CONCURRENCY`, `EXPLANIMATE_QUEUE_MAX`, `EXPLANIMATE_WAIT_IDLE_S`
  - `EXPLANIMATE_DEMO_ONLY`, `EXPLANIMATE_RESUME`
- **Paths and caches:**
  - `EXPLANIMATE_JOBS_DIR`, `EXPLANIMATE_GALLERY_DIR`, `EXPLANIMATE_OUT_DIR`, `EXPLANIMATE_ROOT`
  - `EXPLANIMATE_REPO_CACHE`, `EXPLANIMATE_PLAN_CACHE`, `EXPLANIMATE_PLAN_CACHE_DIR`
  - `EXPLANIMATE_TTS_CACHE`, `EXPLANIMATE_ICON_CACHE`, `EXPLANIMATE_CLONE_TIMEOUT_S`
- **Render and voice:**
  - `EXPLANIMATE_CHROME`, `EXPLANIMATE_RENDERER`, `EXPLANIMATE_ENCODER`
  - `EXPLANIMATE_VOICE`, `EXPLANIMATE_CHAT_VOICE`, `EXPLANIMATE_STT`
- **Servers:**
  - `EXPLANIMATE_API_PORT`, `EXPLANIMATE_CLI`, `EXPLANIMATE_MCP_WAIT_SEC`
  - `EXPLANIMATE_ALLOW_LOCAL`, `EXPLANIMATE_ALLOW_PRIVATE_URLS`
- Old `EXPLAINLIKE_*` names still work; the `EXPLANIMATE_*` name wins.

## 10. History
| PR | What |
| --- | --- |
| #1 | perf(planner): race two copies of the scene plan and narration calls |
| #2 | Skia renderer by default, Chrome fallback |
| #3 | Muse Spark through OpenRouter; keep fixing unexplained terms |
| #4 | Plain-language explainers: natural walkthrough wording, board sync by meaning, clear shots, plain recap |
| #5 | Plain box subtitles, literal headings, no circular lines |
| #6 | chore(guard): default Deepgram cap $10 |
| #7 | feat(planner): one visual per line, real part names explained |
| #8 | feat(render): line cards per narration line, no icon row on the title card |
| #9 | fix(render): find hyphenated names in the voice timings |
| #10 | docs: this handoff, research and patches |

**v4 known gaps** (what v5 fixes):
- The narration falls well below the approved sample:
  - garbled or subjectless lines ("for you user to use", "X starts every job")
  - "your X" on part names
  - full part names repeated back to back
  - handoff chains that never say why
- The hook lost its loved shape.
- A dashboard line had weak README support.
- Terminal cards appeared without their command being spoken.
- There were few output, browser and contrast cards.
- Kinetic rows were built off to the left.

## 11. Next tasks, in priority order
Done: private links are refused everywhere by default (CLI, local API, /explanimate MCP path, with `--allow-private` for local use); the README quick start, code map and deploy notes are refreshed and `railway.json` is deleted; the DNS wire cut is fixed with a regression test; the site is live (section 8); the live minbpe frame-edge slices and the verb-object caption split are fixed with regression tests. What remains:
1. **v5 script polish** (the shipped v5 is render attempt 1; attempt 2 used the merged code):
   - Attempt 1: about 10.6 visual changes a minute, under 12; the walkthrough repeats the daemon line; the password promise is said but has no contrast card, and "Chrome fills the saved password" is looser than the README (credentials are stored encrypted locally, `auth login` logs in by name).
   - Attempt 2 (merged code: every sentence naming a part points the board): about 18.5 changes a minute, but the promise came out as "so it stays hidden", and the walkthrough has a handoff line ("the devtools protocol passes it on").
   - Both: the self-check is left open on "the daemon and the chrome talk directly" with no arrow.
   - Next: make the promise check a hard fail before polish rewrites it; keep the walkthrough why-first through polish.
2. **Re-render the DNS gallery sample** from cache and check the frames against the lines before calling it done.
3. **Sign off or revert the walkthrough trade:** the frame-edge fix keeps a sliced subject whole by widening its shot, and on the dense microui7 walk that merges adjacent closeups (the placement test now asserts at least 2 walk shots instead of 3; close-ups still cover at least 60%). Keep whole subjects, or revert `packages/render/src/placement.ts` to main and put the 3-shot bar back (sliced subjects return).
4. **Caption wording, not chunking:** "You watch aa win aa" splits at "and" correctly; the line itself is awkward ("aa win aa"). Fix in the planner wording rules, not the chunker.
5. **Ask the user:** whether to run the contributor-model test (`muse-spark-1.3-contributor` vs OpenRouter Muse Spark).
6. **Later:** the hackathon write-up and X post drafts ([`docs/hackathon.md`](docs/hackathon.md); don't post), the demo video plan ([`docs/demo-video.md`](docs/demo-video.md)), and voice cloning.

## 12. Don'ts
- Never read, print, commit or send API keys or `.env` files to a model. The pre-commit check is `scripts/check-secrets.sh`.
- Don't deploy publicly or touch DNS without the user's OK. Don't touch the Tokyo VPS or Cloudflare unless he asks.
- No Meta logo or trademark in videos. Familiar tools appear as text chips, never logos.
- Don't run Muse on client code (for example ACC). Test with public repos and topics.
- Stop before any run would pass 80% of a spend cap ($25 Meta, $10 Deepgram).
- No force-push and no direct pushes that skip CI. Keep only `main`: delete a branch after it merges, and save unmerged work as a patch under `docs/handoff/`.
- Don't post anything (X, hackathon) for the user.
