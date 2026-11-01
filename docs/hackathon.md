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
- Third sample to be locked before submission.

## X drafts (do not post)

1. I built an app that turns any repo into a hand-drawn whiteboard explainer,
   narrated, with editable boards. Powered by Muse Spark end to end.
2. Paste a link, get a 2-minute whiteboard video plus tldraw and Excalidraw
   boards. Every box is tied to real files. Every claim is checked.
3. It speaks with Deepgram Aura, checks its own frames with Spark vision, and
   re-renders from cache in ~30 seconds. Built for the Meta hackathon.
