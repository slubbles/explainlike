# Handoff patches

Unmerged work saved as patches so the repo can keep only `main`.

## v5-wip.patch (apply this)
The v5 script-quality batch, made against main at fea9535. Apply with `git apply docs/handoff/v5-wip.patch` on a fresh branch, then run `pnpm -s typecheck` and `pnpm -s test` (315 pass, 0 fail when saved). What it does:
- Planner prompts: few-shot voice examples (the approved agent-browser sample, a Fireship Docker excerpt, a Crayon TSMC excerpt) in the planner, polish and speech-check prompts; why-first, subject-and-verb, no-handoff-chain rules; one-line lowercase tagline.
- Journey hook: "What if ...?" line, contrast lines, then "That's <name>: ..." (checked in `checkStory`).
- `spokenSlips`: garbled pronouns ("for you user to use"), bare part names opening a sentence, "That X" re-introductions, a long name in back-to-back sentences, made-up nicknames ("your helper"); "your X" on a part flagged even once.
- `speechCheck`: one minimal Muse call flags unspoken-sounding sentences and rewrites them; a rewrite is kept only if it keeps each part name once and every walkthrough step, and adds no slip.
- `groundToReadme`: drops side parts and scale fixes the README head (first 12k chars) does not support (drops the dashboard for agent-browser).
- Architecture prompt: client named the way the README does ("ai agent"); a named daemon/server is its own box.
- Beats: a terminal card must say every command word; kinetic capped at about one card in three; contrast sides must be said, problem first (swapped otherwise); a line saying a ref ("fill e3") becomes an output card with the README's element rows; two beats in one sentence no longer repeat it; the walkthrough's return trip may be told in one sentence.
- Topic runs: `planConceptBeats` (one minimal call) gives each line a card, checked by `checkBeats`. Not yet tested live.
- Render: `buildRow` builds kinetic and hook rows word by word, re-centered at each stage.
- Tests: new `packages/planner/test/narration.test.ts`, updated beats/captions/cards tests.

## v3-rough-spots.patch (reference only)
A half-done v3 smoothing commit (50352cd), stopped mid-task. It no longer applies to main; most of its intent was covered by PRs #4 and #5 and by v5-wip. Read it for ideas only.
