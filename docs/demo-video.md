# Demo video (3:00, the submission)

The judging is 30% impact, 25% Meta tools, 20% depth, 25% demo. This video is the demo
score, so it gets the same care as the code. Rules that shape it: three minutes or less,
and the first line must say what existed before the event and what was built during it.

Facts to use, all true as of Nov 2:
- First commit Oct 31 08:04 PH; everything in the repo was written after that.
- 220 commits, 220 tests, CI green on main.
- Measured on OpenMausBot (2:32 of video): a fresh run took 5:11 and $0.26. The same commit again took 2:00 and $0.015 - planning and voice cost nothing, the voice check still transcribes, and every frame is redrawn.
- Output is an mp4 plus `.tldr` and `.excalidraw` boards, a contact sheet, and `manifest.json`.

## Before recording (30 min, do not skip)

0. Build and start the web app, and leave it up: `pnpm --filter @explanimate/web build`,
   then `pnpm --filter @explanimate/web start` from `apps/web`. Check
   `http://localhost:3000/api/health` says `"ok":true` with ffmpeg, chrome, modelKey,
   voiceKey and jobsDir all true. `next dev` compiles on the first click and that compile
   would land on camera.
1. Render the repo you will show once, end to end, and keep its manifest: the on-camera
   evidence is a second run's one-cent spend and its zero-second planning and voice stages, not a
   render finishing live. Drawing runs at about twenty frames a second.
2. If the video you show was rendered earlier, have the mp4 already open in a player at
   1080p, and the boards already open in tldraw and Excalidraw tabs. The in-app gallery
   starts empty, so the finished video comes from the player, not from a card.
3. Terminal at 18 pt, backlog cleared, no keys visible on screen. `apps/web/.env.local`
   never opens on camera. If a result page opens on a frozen frame, click play once before
   the take: Chrome blocks sound until the page has had a click.
4. One take per beat, cut together. Do not screen-record a live 3 min render; show the
   progress bar for four seconds and cut to the finished video.
5. Check the recording for the spend line and the manifest on screen: both are evidence.

## Shot list

| Time | On screen | Voice |
| --- | --- | --- |
| 0:00–0:10 | PowerShell: `git log --reverse --date=short --pretty=format:"%h %ad %s" \| Select-Object -First 3` shows the Oct 31 first commit. | "This repo's first commit is October 31st. Everything you're about to see was built in the last three days, during this hackathon." |
| 0:10–0:25 | Web app, paste `https://github.com/milind-soni/OpenMausBot`, press Explain. | "Explanimate turns anything hard to learn into a narrated whiteboard video. Give it a repo, and two and a half minutes later you hand someone the tour instead of the codebase." |
| 0:25–0:35 | Progress line: fetching, reading the source, planning, drawing. Cut at the first frame. | "It reads the code first, decides how to explain it, then draws it by hand." |
| 0:35–1:20 | The finished OpenMausBot video: architecture builds, one request walks the system, 10x traffic is circled, the fix is drawn. Let the narration carry this; do not talk over it. | (video audio only, two or three seconds of it, then duck) |
| 1:20–1:40 | tldraw: the `.tldr` board. Drag one box; open its note showing the file and line the box came from. Then Excalidraw tab. | "The same drawing comes back as an editable board. Every box is tied to the file it came from, and tapping it answers from that file only." |
| 1:40–2:00 | `manifest.json` and the contact sheet: the checks, the spend, the frame sheet. Zoom on one line. | "Nothing ships unchecked. Boxes are validated against the code, frames are checked for cut-off words and overlaps, both boards are read back, and the voice is listened to. This is the receipt." |
| 2:00–2:15 | `manifest.json` from a second run of the same commit: brief, architecture, scene plan and voice at 0 s, spend $0.015, next to the frame stage's real seconds. | "Second run of the same commit: planning and voice come back in zero seconds. The only spend left is a cent for the voice check. Drawing is the clock — about twenty frames a second." |
| 2:15–2:40 | Second input type: an article URL or a plain topic. Show the different shape it picked (analogy vs walkthrough) and two frames of the result. | "An article or a plain topic gets a different shape without being told: quotes underlined, concepts drawn as small boards." |
| 2:40–3:00 | README on GitHub, repo URL large, then the X post text. | "Meta Muse Spark plans every scene and reviews the finished frames, SAM checks what is actually on screen, Muse Transcribe checks the voice. Explanimate: paste a link, get the explainer." |

## Lines to keep exact

- "Everything you're about to see was built in the last three days, during this hackathon."
- "Every box is tied to the file it came from."
- "This is the receipt." (over the manifest)
- Close with the repo URL, not a logo.

## Do not

- Do not run the opening `git log ... | head -3` from the doc as written: Windows PowerShell
  has no `head`. Use the `Select-Object -First 3` form in the shot list.
- Do not claim a feature the run does not show. Deep-dive focus is unverified live, so it
  stays out of the video until a real clip renders.
- Do not say "AI-powered" or "revolutionary"; the frames do the work.
- Do not show the spend guard warning unless it is actually warning.

## After recording

- Upload unlisted, then put the link in the submission form and the README.
- Keep the raw takes until the submission is confirmed.
