# Hackathon entry (drafts, do not post)

Meta Global AI Developer Hackathon, indie developer track. Theme: Build for Your World.

## Write-up

Explain Like turns anything hard to learn into a short whiteboard video. Give it
a GitHub repo, an article, an X post, or just a topic. It reads the source,
maps the system, writes the story, speaks it, and draws it by hand on one
canvas. You get an mp4 plus editable boards.

It is built on Meta's models end to end. Muse Spark plans the brief, the
architecture map, and every scene. It also reviews the finished frames. SAM
powers open-vocabulary detection in the frame checks. Muse Transcribe checks
the voiceover against the script. Deepgram Aura speaks it.

Everything is checked before you see it. Boxes are validated against real
files. Tapped boxes answer only from their evidence files. Names the voice
mishears get one respelled retake. Labels, arrows, frames, and both boards
pass deterministic checks before the render counts.

A fresh repo run takes about three minutes and costs well under a dollar. A
cached re-render takes about thirty seconds. The plan cache is shared per
commit, and every run prints its spend against a guard.

## Samples

- OpenMausBot repo walkthrough (see README).
- Meta hackathon event page, plain-language cut (`meta-million-dollar-build-sprint.mp4`).
  The first cut reached for a pantry analogy unprompted. The kept cut was
  steered with plain direct language and no forced analogy. Steering is per
  run, so repeat the note on every re-render.
- Third sample to be locked before submission.

## Verification (Nov 1)

- Follow-up what-if runs clean end to end on article input, producing video
  and boards with no errors. Its manifest reads like a full story render, so
  what-if-specific content on articles is unconfirmed; advertise follow-ups
  for repo runs, where the architecture path is designed for them.
- Deep-dive focus stays unverified live: the engine channel dropped before a
  focus clip could render, and five retries across two sessions all failed
  with the channel closed. A minbpe focus run is queued with its component
  (regex-tokenizer) and output folder ready; it needs a live engine channel.
  Shared prompt and validator logic is unit-tested.
- Frame check on the kept hackathon cut: three sampled frames show distinct
  scenes, synced captions, and no cut-off or blank frames. Plain language
  held with no pantry analogy.
- A minbpe repo run verified the review pass finds real walkthrough issues,
  both boards read back clean, and 2111 frames encoded to a 6.8 MB mp4.
- MCP server verified over stdio: handshake answers and all three tools
  (explain, explain_status, explain_cancel) list with correct schemas. The
  dead channel is the host connection, not the server code.
- Follow-ups are repo-video-only by tool contract, which explains the article
  what-if rendering a full video. No code change; scope note stands.
- microui pacing accepted at 7.48 cuts/min for that sample. No code change.
- New respellings (parsel, cooriers) await one real-audio check on a live
  render. Retake logic is unit-tested.

## X drafts (do not post)

1. I built an app that turns any repo into a hand-drawn whiteboard explainer,
   narrated, with editable boards. Powered by Muse Spark end to end.
2. Paste a link, get a 2-minute whiteboard video plus tldraw and Excalidraw
   boards. Every box is tied to real files. Every claim is checked.
3. It speaks with Deepgram Aura, checks its own frames with Spark vision, and
   re-renders from cache in ~30 seconds. Built for the Meta hackathon.
