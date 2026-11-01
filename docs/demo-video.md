# Demo video (3:00, the submission)

The judging is 30% impact, 25% Meta tools, 20% depth, 25% demo. This video is the demo
score, so it gets the same care as the code. Rules that shape it: three minutes or less,
and the first line must say what existed before the event and what was built during it.

Facts to use, all true as of Nov 2:
- First commit Oct 31 08:04 PH; everything in the repo was written after that.
- 220 commits, 220 tests, CI green on main.
- A fresh repo run takes about 2:50; a cached re-render about 30 s; a run costs under $0.20.
- Output is an mp4 plus `.tldr` and `.excalidraw` boards, a contact sheet, and `manifest.json`.

## Before recording (30 min, do not skip)

1. Warm the cache for the repo you will show: run it once, end to end, so the on-camera
   re-render is the 30 s cached path, not the 3 min fresh one.
2. If the video you show was rendered earlier, have the mp4 already open in a player at
   1080p, and the boards already open in tldraw and Excalidraw tabs.
3. Terminal at 18 pt, backlog cleared, no keys visible on screen. `apps/web/.env.local`
   never opens on camera.
4. One take per beat, cut together. Do not screen-record a live 3 min render; show the
   progress bar for four seconds and cut to the finished video.
5. Check the recording for the spend line and the manifest on screen: both are evidence.

## Shot list

| Time | On screen | Voice |
| --- | --- | --- |
| 0:00–0:10 | Terminal: `git log --reverse --oneline \| head -3` shows the Oct 31 first commit. | "This repo's first commit is October 31st. Everything you're about to see was built in the last three days, during this hackathon." |
| 0:10–0:25 | Web app, paste `https://github.com/milind-soni/OpenMausBot`, press Explain. | "Explain Like turns anything hard to learn into a narrated whiteboard video. Give it a repo." |
| 0:25–0:35 | Progress line: fetching, reading the source, planning, drawing. Cut at the first frame. | "It reads the code first, decides how to explain it, then draws it by hand." |
| 0:35–1:20 | The finished OpenMausBot video: architecture builds, one request walks the system, 10x traffic is circled, the fix is drawn. Let the narration carry this; do not talk over it. | (video audio only, two or three seconds of it, then duck) |
| 1:20–1:40 | tldraw: the `.tldr` board. Drag one box; open its note showing the file and line the box came from. Then Excalidraw tab. | "The same drawing comes back as an editable board. Every box is tied to the file it came from, and tapping it answers from that file only." |
| 1:40–2:00 | `manifest.json` and the contact sheet: the checks, the spend, the frame sheet. Zoom on one line. | "Nothing ships unchecked. Boxes are validated against the code, frames are checked for cut-off words and overlaps, both boards are read back, and the voice is listened to. This is the receipt." |
| 2:00–2:15 | Terminal: the cached re-render, timer visible, finishes in ~30 s, prints spend. | "Re-render from cache in thirty seconds, under twenty cents a run." |
| 2:15–2:40 | Second input type: an article URL or a plain topic. Show the different shape it picked (analogy vs walkthrough) and two frames of the result. | "An article or a plain topic gets a different shape without being told: quotes underlined, concepts drawn as small boards." |
| 2:40–3:00 | README on GitHub, repo URL large, then the X post text. | "Meta Muse Spark plans every scene and reviews the finished frames, SAM checks what is actually on screen, Muse Transcribe checks the voice. Explain Like: paste a link, get the explainer." |

## Lines to keep exact

- "Everything you're about to see was built in the last three days, during this hackathon."
- "Every box is tied to the file it came from."
- "This is the receipt." (over the manifest)
- Close with the repo URL, not a logo.

## Do not

- Do not claim a feature the run does not show. Deep-dive focus is unverified live, so it
  stays out of the video until a real clip renders.
- Do not say "AI-powered" or "revolutionary"; the frames do the work.
- Do not show the spend guard warning unless it is actually warning.

## After recording

- Upload unlisted, then put the link in the submission form and the README.
- Keep the raw takes until the submission is confirmed.
